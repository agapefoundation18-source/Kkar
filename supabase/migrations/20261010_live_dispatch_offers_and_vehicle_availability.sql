revoke all on function public.sync_auth_user_profile() from public, anon, authenticated;
drop trigger if exists kkar_sync_auth_user_profile on auth.users;
create trigger kkar_sync_auth_user_profile
after insert on auth.users
for each row
execute function public.sync_auth_user_profile();

create table if not exists public.ride_driver_responses (
  ride_id uuid not null references public.rides(id) on delete cascade,
  driver_id uuid not null references public.driver_profiles(id) on delete cascade,
  response text not null check (response = 'declined'),
  responded_at timestamptz not null default now(),
  primary key (ride_id, driver_id)
);

alter table public.ride_driver_responses enable row level security;
revoke all on public.ride_driver_responses from anon, authenticated;

create index if not exists ride_driver_responses_driver_idx
  on public.ride_driver_responses (driver_id, responded_at desc);

create or replace function public.can_view_ride_avatar(owner_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select owner_user_id = auth.uid()::text
    or exists (
      select 1
      from public.rides r
      join public.profiles rider on rider.id = r.rider_id
      left join public.driver_profiles assigned_driver on assigned_driver.id = r.driver_id
      left join public.profiles assigned_driver_profile on assigned_driver_profile.id = assigned_driver.profile_id
      where (
        (r.status = 'matching' and r.driver_id is null
          and rider.auth_user_id::text = owner_user_id
          and exists (
            select 1
            from public.driver_profiles nearby_driver
            join public.profiles nearby_profile on nearby_profile.id = nearby_driver.profile_id
            where nearby_profile.auth_user_id = auth.uid()
              and nearby_driver.is_approved
              and nearby_driver.is_online
              and nearby_driver.vehicle_type = r.vehicle_type
              and nearby_driver.location_updated_at >= now() - interval '2 minutes'
              and nearby_driver.current_lat is not null
              and nearby_driver.current_lng is not null
              and 6371 * 2 * asin(sqrt(
                power(sin(radians(r.pickup_lat - nearby_driver.current_lat) / 2), 2)
                + cos(radians(nearby_driver.current_lat)) * cos(radians(r.pickup_lat))
                * power(sin(radians(r.pickup_lng - nearby_driver.current_lng) / 2), 2)
              )) <= 30
          ))
        or (r.status in ('driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started')
          and (
            (rider.auth_user_id = auth.uid() and assigned_driver_profile.auth_user_id::text = owner_user_id)
            or (assigned_driver_profile.auth_user_id = auth.uid() and rider.auth_user_id::text = owner_user_id)
          ))
      )
    );
$$;

revoke all on function public.can_view_ride_avatar(text) from public;
grant execute on function public.can_view_ride_avatar(text) to authenticated;

drop policy if exists "Users and active pickup drivers can view account avatars" on storage.objects;
drop policy if exists "Users and active ride participants can view account avatars" on storage.objects;
create policy "Users and active ride participants can view account avatars"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'account-avatars'
    and public.can_view_ride_avatar((storage.foldername(name))[1])
  );

create or replace function public.get_ride_vehicle_options(
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_route_distance_km numeric,
  p_eta_minutes integer
)
returns table (
  vehicle_type text,
  estimated_fare numeric,
  available_drivers integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_vehicle text;
  v_base numeric;
  v_per_km numeric;
begin
  if auth.uid() is null then
    raise exception 'Sign in to check ride availability' using errcode = '42501';
  end if;
  if p_pickup_lat is null or p_pickup_lng is null
     or p_pickup_lat not between 4.3 and 5.7 or p_pickup_lng not between 7.25 and 8.6
     or p_route_distance_km is null or p_route_distance_km < 0.1 or p_route_distance_km > 500
     or p_eta_minutes is null or p_eta_minutes < 1 or p_eta_minutes > 600 then
    raise exception 'Choose valid pickup and destination locations' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles
  where auth_user_id = auth.uid();
  if not found or v_profile.account_type <> 'rider' then
    raise exception 'Use the Rider app to check ride availability' using errcode = '42501';
  end if;

  foreach v_vehicle in array array['bike', 'car'] loop
    if v_vehicle = 'bike' then
      v_base := 700;
      v_per_km := 180;
    else
      v_base := 1500;
      v_per_km := 300;
    end if;

    return query
    select
      v_vehicle,
      greatest(
        v_base,
        case when v_vehicle = 'bike' then 400 else 800 end + round(p_route_distance_km, 2) * v_per_km
      )::numeric(12, 2),
      count(*)::integer
    from public.driver_profiles d
    join public.profiles driver_profile on driver_profile.id = d.profile_id
    where d.is_approved
      and d.is_online
      and d.vehicle_type = v_vehicle
      and d.location_updated_at >= now() - interval '2 minutes'
      and d.current_lat is not null
      and d.current_lng is not null
      and 6371 * 2 * asin(sqrt(
        power(sin(radians(p_pickup_lat - d.current_lat) / 2), 2)
        + cos(radians(d.current_lat)) * cos(radians(p_pickup_lat))
        * power(sin(radians(p_pickup_lng - d.current_lng) / 2), 2)
      )) <= 30
      and not exists (
        select 1 from public.rides active
        where active.driver_id = d.id
          and active.status in ('driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started')
      );
  end loop;
end;
$$;

create or replace function public.ensure_nearby_driver_for_ride()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'matching' and new.driver_id is null
     and not exists (
       select 1
       from public.driver_profiles d
       join public.profiles driver_profile on driver_profile.id = d.profile_id
       where d.is_approved
         and d.is_online
         and d.vehicle_type = new.vehicle_type
         and d.location_updated_at >= now() - interval '2 minutes'
         and d.current_lat is not null
         and d.current_lng is not null
         and 6371 * 2 * asin(sqrt(
           power(sin(radians(new.pickup_lat - d.current_lat) / 2), 2)
           + cos(radians(d.current_lat)) * cos(radians(new.pickup_lat))
           * power(sin(radians(new.pickup_lng - d.current_lng) / 2), 2)
         )) <= 30
         and not exists (
           select 1 from public.rides active
           where active.driver_id = d.id
             and active.status in ('driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started')
         )
     ) then
    raise exception 'No approved drivers for this vehicle are currently available near your pickup. Choose another vehicle or try again shortly.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists rides_require_nearby_available_driver on public.rides;
create trigger rides_require_nearby_available_driver
before insert or update of status, driver_id on public.rides
for each row
execute function public.ensure_nearby_driver_for_ride();

drop function if exists public.list_available_ride_offers();
create function public.list_available_ride_offers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver public.driver_profiles%rowtype;
  v_offers jsonb;
begin
  select d.* into v_driver
  from public.driver_profiles d
  join public.profiles p on p.id = d.profile_id
  where p.auth_user_id = auth.uid()
  limit 1;
  if not found or not v_driver.is_approved or not v_driver.is_online
     or v_driver.location_updated_at < now() - interval '2 minutes' then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    to_jsonb(r) || jsonb_build_object(
      'rider', jsonb_build_object(
        'name', rider.full_name,
        'avatar_path', rider.avatar_path
      )
    ) order by r.created_at desc
  ), '[]'::jsonb)
  into v_offers
  from public.rides r
  join public.profiles rider on rider.id = r.rider_id
  where r.status = 'matching'
    and r.driver_id is null
    and r.vehicle_type = v_driver.vehicle_type
    and v_driver.current_lat is not null
    and v_driver.current_lng is not null
    and v_driver.location_updated_at >= now() - interval '2 minutes'
    and 6371 * 2 * asin(sqrt(
      power(sin(radians(r.pickup_lat - v_driver.current_lat) / 2), 2)
      + cos(radians(v_driver.current_lat)) * cos(radians(r.pickup_lat))
      * power(sin(radians(r.pickup_lng - v_driver.current_lng) / 2), 2)
    )) <= 30
    and not exists (
      select 1 from public.ride_driver_responses response
      where response.ride_id = r.id
        and response.driver_id = v_driver.id
        and response.response = 'declined'
    )
    and not exists (
      select 1 from public.rides active
      where active.driver_id = v_driver.id
        and active.status in ('driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started')
    );
  return v_offers;
end;
$$;

create or replace function public.decline_ride(p_ride_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver public.driver_profiles%rowtype;
begin
  select d.* into v_driver
  from public.driver_profiles d
  join public.profiles p on p.id = d.profile_id
  where p.auth_user_id = auth.uid()
  for update;
  if not found or not v_driver.is_approved or not v_driver.is_online then
    raise exception 'You must be an approved online driver to respond to ride requests' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.rides r
    where r.id = p_ride_id
      and r.status = 'matching'
      and r.driver_id is null
      and r.vehicle_type = v_driver.vehicle_type
  ) then
    raise exception 'This ride is no longer available' using errcode = '40001';
  end if;
  insert into public.ride_driver_responses (ride_id, driver_id, response)
  values (p_ride_id, v_driver.id, 'declined')
  on conflict (ride_id, driver_id) do update
    set response = excluded.response, responded_at = now();
  return true;
end;
$$;

create or replace function public.accept_ride(p_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver public.driver_profiles%rowtype;
  v_ride public.rides%rowtype;
begin
  select d.* into v_driver
  from public.driver_profiles d
  join public.profiles p on p.id = d.profile_id
  where p.auth_user_id = auth.uid()
  for update;
  if not found or not v_driver.is_approved or not v_driver.is_online
     or v_driver.location_updated_at < now() - interval '2 minutes'
     or v_driver.current_lat is null or v_driver.current_lng is null then
    raise exception 'You must be approved, online, and sharing a recent location to accept rides' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.rides active
    where active.driver_id = v_driver.id
      and active.status in ('driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started')
  ) then
    raise exception 'Complete or cancel your current ride before accepting another' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.ride_driver_responses response
    where response.ride_id = p_ride_id and response.driver_id = v_driver.id
      and response.response = 'declined'
  ) then
    raise exception 'You already declined this ride' using errcode = '42501';
  end if;

  update public.rides
  set driver_id = v_driver.id, status = 'driver_assigned'
  where id = p_ride_id
    and status = 'matching'
    and driver_id is null
    and vehicle_type = v_driver.vehicle_type
    and 6371 * 2 * asin(sqrt(
      power(sin(radians(pickup_lat - v_driver.current_lat) / 2), 2)
      + cos(radians(v_driver.current_lat)) * cos(radians(pickup_lat))
      * power(sin(radians(pickup_lng - v_driver.current_lng) / 2), 2)
    )) <= 30
  returning * into v_ride;
  if not found then
    raise exception 'This ride was already accepted or is no longer available near you' using errcode = '40001';
  end if;
  return to_jsonb(v_ride);
end;
$$;

create or replace function public.get_my_active_ride()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(r) || jsonb_build_object(
    'rider', case when rider.id is null then null else jsonb_build_object(
      'name', rider.full_name,
      'avatar_path', rider.avatar_path
    ) end,
    'driver', case when d.id is null then null else jsonb_build_object(
      'id', d.id,
      'name', p.full_name,
      'avatar_path', p.avatar_path,
      'vehicle_type', d.vehicle_type,
      'vehicle_make', d.vehicle_make,
      'vehicle_model', d.vehicle_model,
      'vehicle_color', d.vehicle_color,
      'plate_number', d.plate_number,
      'current_lat', d.current_lat,
      'current_lng', d.current_lng,
      'location_updated_at', d.location_updated_at
    ) end
  )
  from public.rides r
  left join public.profiles rider on rider.id = r.rider_id
  left join public.driver_profiles d on d.id = r.driver_id
  left join public.profiles p on p.id = d.profile_id
  where (
    r.status in ('matching', 'driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started')
    or (
      r.status in ('trip_completed', 'cancelled_by_rider', 'cancelled_by_driver', 'cancelled_no_driver')
      and r.created_at >= now() - interval '30 minutes'
    )
  )
    and (
      exists (select 1 from public.profiles rp where rp.id = r.rider_id and rp.auth_user_id = auth.uid())
      or exists (select 1 from public.driver_profiles dp join public.profiles dp_profile on dp_profile.id = dp.profile_id where dp.id = r.driver_id and dp_profile.auth_user_id = auth.uid())
    )
  order by r.created_at desc
  limit 1;
$$;

revoke all on function public.get_ride_vehicle_options(double precision,double precision,numeric,integer) from public;
revoke all on function public.ensure_nearby_driver_for_ride() from public;
revoke all on function public.list_available_ride_offers() from public;
revoke all on function public.decline_ride(uuid) from public;
revoke all on function public.accept_ride(uuid) from public;
revoke all on function public.get_my_active_ride() from public;

grant execute on function public.get_ride_vehicle_options(double precision,double precision,numeric,integer) to authenticated;
grant execute on function public.list_available_ride_offers() to authenticated;
grant execute on function public.decline_ride(uuid) to authenticated;
grant execute on function public.accept_ride(uuid) to authenticated;
grant execute on function public.get_my_active_ride() to authenticated;
