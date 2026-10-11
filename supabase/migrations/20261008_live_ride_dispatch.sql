alter table public.profiles
  add column if not exists account_type text not null default 'rider'
    check (account_type in ('rider', 'driver'));

alter table public.profiles
  add column if not exists phone text;

update public.profiles p
set account_type = case
  when u.raw_user_meta_data ->> 'user_type' = 'driver' then 'driver'
  else 'rider'
end
from auth.users u
where u.id = p.auth_user_id;

alter table public.driver_profiles
  add column if not exists is_approved boolean not null default false,
  add column if not exists vehicle_make text,
  add column if not exists vehicle_model text,
  add column if not exists vehicle_color text,
  add column if not exists plate_number text,
  add column if not exists location_updated_at timestamptz;

update public.driver_profiles set is_online = false where not is_approved;

alter table public.rides
  add column if not exists pickup_lga text,
  add column if not exists distance_km numeric(8, 2),
  add column if not exists eta_minutes integer;

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (auth_user_id, full_name, email, phone, account_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.email,
    new.phone,
    case when new.raw_user_meta_data ->> 'user_type' = 'driver' then 'driver' else 'rider' end
  )
  on conflict (auth_user_id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone,
        account_type = case
          when new.raw_user_meta_data ->> 'user_type' in ('rider', 'driver')
            then new.raw_user_meta_data ->> 'user_type'
          else public.profiles.account_type
        end,
        updated_at = now();
  return new;
end;
$$;

create index if not exists rides_matching_vehicle_created_idx
  on public.rides (vehicle_type, created_at desc)
  where status = 'matching' and driver_id is null;

create index if not exists driver_profiles_dispatch_idx
  on public.driver_profiles (vehicle_type, is_online, is_approved);

alter table public.rides enable row level security;
alter table public.driver_profiles enable row level security;

drop policy if exists "Rides are viewable by rider or assigned driver" on public.rides;
drop policy if exists "Rides can be inserted by authenticated users" on public.rides;
drop policy if exists "Driver profiles are viewable by authenticated users" on public.driver_profiles;
drop policy if exists "Kkar drivers can read their own profile" on public.driver_profiles;
drop policy if exists "Kkar riders can read assigned driver profiles" on public.driver_profiles;
revoke all on public.rides from anon, authenticated;
revoke all on public.driver_profiles from anon, authenticated;
grant select on public.rides, public.driver_profiles to authenticated;

create or replace function public.request_ride(
  p_pickup_address text,
  p_dropoff_address text,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_vehicle_type text,
  p_pickup_lga text,
  p_route_distance_km numeric,
  p_eta_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_ride public.rides%rowtype;
  v_direct_km numeric;
  v_distance_km numeric;
  v_fare numeric;
begin
  if auth.uid() is null then
    raise exception 'Sign in to request a ride' using errcode = '42501';
  end if;
  if p_pickup_address is null or length(trim(p_pickup_address)) < 2 or length(trim(p_pickup_address)) > 255
     or p_dropoff_address is null or length(trim(p_dropoff_address)) < 2 or length(trim(p_dropoff_address)) > 255 then
    raise exception 'Enter valid pickup and destination addresses' using errcode = '22023';
  end if;
  if p_vehicle_type is null or p_vehicle_type not in ('bike', 'car') then
    raise exception 'Choose a valid ride type' using errcode = '22023';
  end if;
  if p_pickup_lat is null or p_pickup_lng is null or p_dropoff_lat is null or p_dropoff_lng is null
     or p_pickup_lat not between 4.3 and 5.7 or p_dropoff_lat not between 4.3 and 5.7
     or p_pickup_lng not between 7.25 and 8.6 or p_dropoff_lng not between 7.25 and 8.6 then
    raise exception 'Choose pickup and destination locations in Akwa Ibom' using errcode = '22023';
  end if;
  if p_pickup_lat not between -90 and 90 or p_dropoff_lat not between -90 and 90
     or p_pickup_lng not between -180 and 180 or p_dropoff_lng not between -180 and 180 then
    raise exception 'Choose valid map locations' using errcode = '22023';
  end if;
  if p_route_distance_km is null or p_route_distance_km < 0.1 or p_route_distance_km > 500
     or p_eta_minutes is null or p_eta_minutes < 1 or p_eta_minutes > 600 then
    raise exception 'Unable to calculate a valid route estimate' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles
  where auth_user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Your Kkar profile is not ready yet' using errcode = 'P0002';
  end if;
  if v_profile.account_type <> 'rider' then
    raise exception 'Use the Rider app to request a ride' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.rides
    where rider_id = v_profile.id
      and status in ('matching', 'driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started')
  ) then
    raise exception 'You already have an active ride' using errcode = '23505';
  end if;

  v_direct_km := 6371 * 2 * asin(sqrt(
    power(sin(radians(p_dropoff_lat - p_pickup_lat) / 2), 2)
    + cos(radians(p_pickup_lat)) * cos(radians(p_dropoff_lat))
    * power(sin(radians(p_dropoff_lng - p_pickup_lng) / 2), 2)
  ));
  if v_direct_km < 0.05 or p_route_distance_km < v_direct_km * 0.95
     or p_route_distance_km > greatest(v_direct_km * 3, v_direct_km + 5) then
    raise exception 'The route estimate does not match the selected locations' using errcode = '22023';
  end if;
  v_distance_km := round(p_route_distance_km, 2);
  v_fare := greatest(
    case when p_vehicle_type = 'bike' then 700 else 1500 end,
    case when p_vehicle_type = 'bike' then 400 + (v_distance_km * 180)
         else 800 + (v_distance_km * 300) end
  );

  insert into public.rides (
    rider_id, pickup_address, dropoff_address,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
    pickup_lga, distance_km, eta_minutes, status, vehicle_type, estimated_fare
  ) values (
    v_profile.id, trim(p_pickup_address), trim(p_dropoff_address),
    p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
    nullif(trim(p_pickup_lga), ''), v_distance_km, p_eta_minutes,
    'matching', p_vehicle_type, v_fare
  )
  returning * into v_ride;

  return to_jsonb(v_ride);
end;
$$;

create or replace function public.register_driver(
  p_vehicle_type text,
  p_vehicle_make text,
  p_vehicle_model text,
  p_vehicle_color text,
  p_plate_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_driver public.driver_profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to register as a driver' using errcode = '42501';
  end if;
  if p_vehicle_type is null or p_vehicle_type not in ('bike', 'car')
     or p_vehicle_make is null or length(trim(p_vehicle_make)) < 2 or length(trim(p_vehicle_make)) > 80
     or p_vehicle_model is null or length(trim(p_vehicle_model)) < 1 or length(trim(p_vehicle_model)) > 80
     or p_vehicle_color is null or length(trim(p_vehicle_color)) < 2 or length(trim(p_vehicle_color)) > 40
     or p_plate_number is null or length(trim(p_plate_number)) < 3 or length(trim(p_plate_number)) > 32 then
    raise exception 'Enter complete, valid vehicle details' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles
  where auth_user_id = auth.uid()
  for share;
  if not found or v_profile.account_type <> 'driver' then
    raise exception 'This account is not registered as a driver' using errcode = '42501';
  end if;

  insert into public.driver_profiles (
    profile_id, vehicle_type, vehicle_make, vehicle_model, vehicle_color, plate_number
  ) values (
    v_profile.id, p_vehicle_type, trim(p_vehicle_make), trim(p_vehicle_model),
    trim(p_vehicle_color), upper(trim(p_plate_number))
  )
  on conflict (profile_id) do update set
    vehicle_type = excluded.vehicle_type,
    vehicle_make = excluded.vehicle_make,
    vehicle_model = excluded.vehicle_model,
    vehicle_color = excluded.vehicle_color,
    plate_number = excluded.plate_number,
    is_online = false
  where not public.driver_profiles.is_approved
  returning * into v_driver;

  if not found then
    select * into v_driver from public.driver_profiles where profile_id = v_profile.id;
  end if;
  return to_jsonb(v_driver);
end;
$$;

drop function if exists public.set_driver_availability(boolean);
create or replace function public.set_driver_availability(
  p_is_online boolean,
  p_lat double precision default null,
  p_lng double precision default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver public.driver_profiles%rowtype;
begin
  if p_is_online is null then
    raise exception 'Choose whether to go online or offline' using errcode = '22023';
  end if;
  if p_is_online and (
    p_lat is null or p_lng is null
    or p_lat not between -90 and 90 or p_lng not between -180 and 180
  ) then
    raise exception 'A valid current location is required to go online' using errcode = '22023';
  end if;
  select d.* into v_driver
  from public.driver_profiles d
  join public.profiles p on p.id = d.profile_id
  where p.auth_user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Submit your driver application first' using errcode = 'P0002';
  end if;
  if p_is_online and not v_driver.is_approved then
    raise exception 'Your driver application is awaiting Kkar approval' using errcode = '42501';
  end if;
  if not p_is_online and exists (
    select 1 from public.rides
    where driver_id = v_driver.id and status = 'trip_started'
  ) then
    raise exception 'Complete your active trip before going offline' using errcode = '55000';
  end if;
  update public.driver_profiles
  set is_online = p_is_online,
      current_lat = case when p_is_online then p_lat else current_lat end,
      current_lng = case when p_is_online then p_lng else current_lng end,
      location_updated_at = case when p_is_online then now() else location_updated_at end
  where id = v_driver.id;
  return p_is_online;
end;
$$;

create or replace function public.update_driver_location(
  p_lat double precision,
  p_lng double precision,
  p_heading double precision default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
begin
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or (p_heading is not null and p_heading not between 0 and 360) then
    raise exception 'Invalid location coordinates' using errcode = '22023';
  end if;
  select d.id into v_driver_id
  from public.driver_profiles d
  join public.profiles p on p.id = d.profile_id
  where p.auth_user_id = auth.uid()
    and d.is_approved
    and (
      d.is_online
      or exists (select 1 from public.rides r where r.driver_id = d.id and r.status in ('driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started'))
    );
  if not found then
    raise exception 'Go online before sharing your location' using errcode = '42501';
  end if;
  update public.driver_profiles
  set current_lat = p_lat,
      current_lng = p_lng,
      location_updated_at = now()
  where id = v_driver_id;
  return true;
end;
$$;

create or replace function public.list_available_rides()
returns setof public.rides
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
  limit 1;
  if not found or not v_driver.is_approved or not v_driver.is_online then
    return;
  end if;
  return query
  select r.*
  from public.rides r
  where r.status = 'matching'
    and r.driver_id is null
    and r.vehicle_type = v_driver.vehicle_type
    and (
      v_driver.current_lat is null
      or v_driver.current_lng is null
      or r.pickup_lat is null
      or 6371 * 2 * asin(sqrt(
        power(sin(radians(r.pickup_lat - v_driver.current_lat) / 2), 2)
        + cos(radians(v_driver.current_lat)) * cos(radians(r.pickup_lat))
        * power(sin(radians(r.pickup_lng - v_driver.current_lng) / 2), 2)
      )) <= 30
    )
  order by r.created_at desc
  limit 30;
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
  if not found or not v_driver.is_approved or not v_driver.is_online then
    raise exception 'You must be approved and online to accept rides' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.rides
    where driver_id = v_driver.id
      and status in ('driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started')
  ) then
    raise exception 'Complete or cancel your current ride before accepting another' using errcode = '55000';
  end if;
  update public.rides
  set driver_id = v_driver.id, status = 'driver_assigned'
  where id = p_ride_id
    and status = 'matching'
    and driver_id is null
    and vehicle_type = v_driver.vehicle_type
  returning * into v_ride;
  if not found then
    raise exception 'This ride was already accepted or is no longer available' using errcode = '40001';
  end if;
  return to_jsonb(v_ride);
end;
$$;

create or replace function public.update_ride_status(p_ride_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides%rowtype;
  v_profile_id uuid;
  v_is_rider boolean;
  v_is_driver boolean;
begin
  select id into v_profile_id from public.profiles where auth_user_id = auth.uid();
  if v_profile_id is null then
    raise exception 'Kkar profile not found' using errcode = 'P0002';
  end if;

  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;
  v_is_rider := v_ride.rider_id = v_profile_id;
  v_is_driver := exists (
    select 1 from public.driver_profiles d
    where d.id = v_ride.driver_id and d.profile_id = v_profile_id and d.is_approved
  );

  if p_status = 'cancelled_by_rider' and v_is_rider
     and v_ride.status in ('matching', 'driver_assigned', 'driver_en_route', 'driver_arrived') then
    update public.rides set status = p_status where id = p_ride_id returning * into v_ride;
  elsif v_is_driver and (
    (v_ride.status = 'driver_assigned' and p_status = 'driver_en_route')
    or (v_ride.status = 'driver_en_route' and p_status = 'driver_arrived')
    or (v_ride.status = 'driver_arrived' and p_status = 'trip_started')
    or (v_ride.status = 'trip_started' and p_status = 'trip_completed')
    or (v_ride.status in ('driver_assigned', 'driver_en_route', 'driver_arrived') and p_status = 'cancelled_by_driver')
  ) then
    update public.rides set status = p_status where id = p_ride_id returning * into v_ride;
  else
    raise exception 'This ride cannot be changed to the requested status' using errcode = '42501';
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
    'driver', case when d.id is null then null else jsonb_build_object(
      'id', d.id,
      'name', p.full_name,
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

create or replace function public.get_my_driver_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(d)
  from public.driver_profiles d
  join public.profiles p on p.id = d.profile_id
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.get_my_ride_history()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    to_jsonb(r) || jsonb_build_object(
      'driver', case when d.id is null then null else jsonb_build_object(
        'name', p.full_name,
        'vehicle_type', d.vehicle_type,
        'vehicle_make', d.vehicle_make,
        'vehicle_model', d.vehicle_model,
        'vehicle_color', d.vehicle_color,
        'plate_number', d.plate_number
      ) end
    ) order by r.created_at desc
  ), '[]'::jsonb)
  from public.rides r
  left join public.driver_profiles d on d.id = r.driver_id
  left join public.profiles p on p.id = d.profile_id
  where exists (
    select 1 from public.profiles rider
    where rider.id = r.rider_id and rider.auth_user_id = auth.uid()
  ) or exists (
    select 1 from public.driver_profiles own_driver
    join public.profiles own_profile on own_profile.id = own_driver.profile_id
    where own_driver.id = r.driver_id and own_profile.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.request_ride(text,text,double precision,double precision,double precision,double precision,text,text,numeric,integer) from public;
revoke all on function public.register_driver(text,text,text,text,text) from public;
revoke all on function public.set_driver_availability(boolean,double precision,double precision) from public;
revoke all on function public.update_driver_location(double precision,double precision,double precision) from public;
revoke all on function public.list_available_rides() from public;
revoke all on function public.accept_ride(uuid) from public;
revoke all on function public.update_ride_status(uuid,text) from public;
revoke all on function public.get_my_active_ride() from public;
revoke all on function public.get_my_driver_profile() from public;
revoke all on function public.get_my_ride_history() from public;

grant execute on function public.request_ride(text,text,double precision,double precision,double precision,double precision,text,text,numeric,integer) to authenticated;
grant execute on function public.register_driver(text,text,text,text,text) to authenticated;
grant execute on function public.set_driver_availability(boolean,double precision,double precision) to authenticated;
grant execute on function public.update_driver_location(double precision,double precision,double precision) to authenticated;
grant execute on function public.list_available_rides() to authenticated;
grant execute on function public.accept_ride(uuid) to authenticated;
grant execute on function public.update_ride_status(uuid,text) to authenticated;
grant execute on function public.get_my_active_ride() to authenticated;
grant execute on function public.get_my_driver_profile() to authenticated;
grant execute on function public.get_my_ride_history() to authenticated;
