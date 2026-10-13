alter table public.profiles
  add column if not exists state text,
  add column if not exists lga text;

alter table public.driver_profiles
  add column if not exists state text,
  add column if not exists lga text;

alter table public.rides
  add column if not exists pickup_state text;

update public.profiles p
set state = nullif(u.raw_user_meta_data ->> 'state', ''),
    lga = nullif(u.raw_user_meta_data ->> 'lga', '')
from auth.users u
where u.id = p.auth_user_id;

update public.driver_profiles d
set state = p.state,
    lga = p.lga
from public.profiles p
where p.id = d.profile_id;

create table if not exists public.service_vehicle_areas (
  state text not null,
  lga text not null,
  vehicle_type text not null check (vehicle_type in ('bike', 'car', 'tricycle')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (state, lga, vehicle_type)
);

alter table public.service_vehicle_areas enable row level security;
revoke all on public.service_vehicle_areas from anon, authenticated;

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (auth_user_id, full_name, email, phone, account_type, state, lga)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.email,
    new.phone,
    case when new.raw_user_meta_data ->> 'user_type' = 'driver' then 'driver' else 'rider' end,
    nullif(new.raw_user_meta_data ->> 'state', ''),
    nullif(new.raw_user_meta_data ->> 'lga', '')
  )
  on conflict (auth_user_id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone,
        state = coalesce(excluded.state, public.profiles.state),
        lga = coalesce(excluded.lga, public.profiles.lga),
        account_type = case
          when new.raw_user_meta_data ->> 'user_type' in ('rider', 'driver')
            then new.raw_user_meta_data ->> 'user_type'
          else public.profiles.account_type
        end,
        updated_at = now();
  return new;
end;
$$;

create or replace function public.get_configured_vehicle_types(p_state text, p_lga text)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select a.vehicle_type
  from public.service_vehicle_areas a
  where a.state = p_state and a.lga = p_lga and a.enabled
  order by a.vehicle_type;
$$;

revoke all on function public.get_configured_vehicle_types(text, text) from public, anon;
grant execute on function public.get_configured_vehicle_types(text, text) to authenticated;

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
  if p_vehicle_type is null or p_vehicle_type not in ('bike', 'car', 'tricycle')
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
  if v_profile.state is null or v_profile.lga is null or not exists (
    select 1 from public.service_vehicle_areas a
    where a.state = v_profile.state and a.lga = v_profile.lga
      and a.vehicle_type = p_vehicle_type and a.enabled
  ) then
    raise exception 'This vehicle type is not enabled by Kkary for your selected state and L.G.A.' using errcode = '22023';
  end if;

  insert into public.driver_profiles (
    profile_id, state, lga, vehicle_type, vehicle_make, vehicle_model, vehicle_color, plate_number
  ) values (
    v_profile.id, v_profile.state, v_profile.lga, p_vehicle_type, trim(p_vehicle_make),
    trim(p_vehicle_model), trim(p_vehicle_color), upper(trim(p_plate_number))
  )
  on conflict (profile_id) do update set
    state = excluded.state,
    lga = excluded.lga,
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

create or replace function public.get_nearby_online_drivers(
  p_lat double precision,
  p_lng double precision
)
returns table (
  vehicle_type text,
  current_lat double precision,
  current_lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select d.vehicle_type, round(d.current_lat::numeric, 4)::double precision, round(d.current_lng::numeric, 4)::double precision
  from public.driver_profiles d
  where auth.uid() is not null
    and p_lat between -90 and 90 and p_lng between -180 and 180
    and d.is_approved and d.is_online
    and d.location_updated_at >= now() - interval '2 minutes'
    and d.current_lat is not null and d.current_lng is not null
    and not exists (
      select 1 from public.rides active
      where active.driver_id = d.id
        and active.status in ('driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started')
    )
    and 6371 * 2 * asin(sqrt(
      power(sin(radians(p_lat - d.current_lat) / 2), 2)
      + cos(radians(d.current_lat)) * cos(radians(p_lat))
      * power(sin(radians(p_lng - d.current_lng) / 2), 2)
    )) <= 30
  order by 6371 * 2 * asin(sqrt(
    power(sin(radians(p_lat - d.current_lat) / 2), 2)
    + cos(radians(d.current_lat)) * cos(radians(p_lat))
    * power(sin(radians(p_lng - d.current_lng) / 2), 2)
  ))
  limit 50;
$$;

revoke all on function public.get_nearby_online_drivers(double precision, double precision) from public, anon;
grant execute on function public.get_nearby_online_drivers(double precision, double precision) to authenticated;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where contype = 'c'
      and conrelid = 'public.driver_profiles'::regclass
      and position('vehicle_type' in pg_get_constraintdef(oid)) > 0
  loop
    execute format('alter table public.driver_profiles drop constraint %I', constraint_row.conname);
  end loop;
  alter table public.driver_profiles
    add constraint driver_profiles_vehicle_type_check
    check (vehicle_type in ('bike', 'car', 'tricycle'));

  for constraint_row in
    select conname
    from pg_constraint
    where contype = 'c'
      and conrelid = 'public.rides'::regclass
      and position('vehicle_type' in pg_get_constraintdef(oid)) > 0
  loop
    execute format('alter table public.rides drop constraint %I', constraint_row.conname);
  end loop;
  alter table public.rides
    add constraint rides_vehicle_type_check
    check (vehicle_type in ('bike', 'car', 'tricycle'));

  for constraint_row in
    select conname
    from pg_constraint
    where contype = 'c'
      and conrelid = 'public.driver_documents'::regclass
      and position('document_type' in pg_get_constraintdef(oid)) > 0
  loop
    execute format('alter table public.driver_documents drop constraint %I', constraint_row.conname);
  end loop;
  alter table public.driver_documents
    add constraint driver_documents_document_type_check
    check (document_type in (
      'drivers_license', 'nin',
      'motorcycle_registration', 'motorcycle_insurance',
      'car_registration', 'car_insurance',
      'tricycle_registration', 'tricycle_insurance'
    ));
end;
$$;

drop policy if exists "Drivers upload their own verification documents" on storage.objects;
create policy "Drivers upload their own verification documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'driver-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.driver_profiles d
      join public.profiles p on p.id = d.profile_id
      where d.id::text = (storage.foldername(name))[2]
        and p.auth_user_id = auth.uid()
        and (
          (storage.foldername(name))[3] in ('drivers_license', 'nin')
          or (d.vehicle_type = 'bike' and (storage.foldername(name))[3] in ('motorcycle_registration', 'motorcycle_insurance'))
          or (d.vehicle_type = 'car' and (storage.foldername(name))[3] in ('car_registration', 'car_insurance'))
          or (d.vehicle_type = 'tricycle' and (storage.foldername(name))[3] in ('tricycle_registration', 'tricycle_insurance'))
        )
    )
  );

create or replace function public.submit_driver_document(
  p_document_type text,
  p_file_name text,
  p_mime_type text,
  p_storage_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_driver public.driver_profiles%rowtype;
  v_document public.driver_documents%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to upload driver documents' using errcode = '42501';
  end if;
  if p_document_type not in (
    'drivers_license', 'nin',
    'motorcycle_registration', 'motorcycle_insurance',
    'car_registration', 'car_insurance',
    'tricycle_registration', 'tricycle_insurance'
  ) or p_file_name is null or length(trim(p_file_name)) not between 1 and 255
    or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    or p_storage_key is null or length(p_storage_key) > 512 then
    raise exception 'Invalid driver document details' using errcode = '22023';
  end if;

  select d.* into v_driver
  from public.driver_profiles d
  join public.profiles p on p.id = d.profile_id
  where p.auth_user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Register your vehicle before uploading documents' using errcode = '42501';
  end if;
  if (p_document_type in ('motorcycle_registration', 'motorcycle_insurance') and v_driver.vehicle_type <> 'bike')
    or (p_document_type in ('car_registration', 'car_insurance') and v_driver.vehicle_type <> 'car')
    or (p_document_type in ('tricycle_registration', 'tricycle_insurance') and v_driver.vehicle_type <> 'tricycle') then
    raise exception 'These vehicle documents do not match your registered vehicle type' using errcode = '22023';
  end if;
  if p_storage_key not like auth.uid()::text || '/' || v_driver.id::text || '/' || p_document_type || '/%'
    or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'driver-documents'
        and o.name = p_storage_key
        and o.owner_id = auth.uid()::text
    ) then
    raise exception 'Upload the document to your private driver folder first' using errcode = '42501';
  end if;

  insert into public.driver_documents (
    driver_id, document_type, original_file_name, mime_type, storage_key,
    verification_status, rejection_reason, reviewed_by, reviewed_at, updated_at
  ) values (
    v_driver.id, p_document_type, trim(p_file_name), p_mime_type, p_storage_key,
    'pending', null, null, null, now()
  )
  on conflict (driver_id, document_type) do update
    set original_file_name = excluded.original_file_name,
        mime_type = excluded.mime_type,
        storage_key = excluded.storage_key,
        verification_status = 'pending',
        rejection_reason = null,
        reviewed_by = null,
        reviewed_at = null,
        updated_at = now()
  returning * into v_document;

  update public.driver_profiles set is_online = false
  where id = v_driver.id;
  return jsonb_build_object(
    'id', v_document.id,
    'document_type', v_document.document_type,
    'verification_status', v_document.verification_status
  );
end;
$$;

revoke all on function public.submit_driver_document(text, text, text, text) from public, anon;
grant execute on function public.submit_driver_document(text, text, text, text) to authenticated;

create or replace function public.driver_identity_verified(p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.driver_profiles d
    where d.id = p_driver_id
      and exists (
        select 1 from public.driver_documents doc
        where doc.driver_id = d.id
          and doc.document_type = 'drivers_license'
          and doc.verification_status = 'approved'
      )
      and exists (
        select 1 from public.driver_documents doc
        where doc.driver_id = d.id
          and doc.document_type = 'nin'
          and doc.verification_status = 'approved'
      )
      and (
        (d.vehicle_type = 'bike'
          and exists (select 1 from public.driver_documents doc where doc.driver_id = d.id and doc.document_type = 'motorcycle_registration' and doc.verification_status = 'approved')
          and exists (select 1 from public.driver_documents doc where doc.driver_id = d.id and doc.document_type = 'motorcycle_insurance' and doc.verification_status = 'approved'))
        or
        (d.vehicle_type = 'car'
          and exists (select 1 from public.driver_documents doc where doc.driver_id = d.id and doc.document_type = 'car_registration' and doc.verification_status = 'approved')
          and exists (select 1 from public.driver_documents doc where doc.driver_id = d.id and doc.document_type = 'car_insurance' and doc.verification_status = 'approved'))
        or
        (d.vehicle_type = 'tricycle'
          and exists (select 1 from public.driver_documents doc where doc.driver_id = d.id and doc.document_type = 'tricycle_registration' and doc.verification_status = 'approved')
          and exists (select 1 from public.driver_documents doc where doc.driver_id = d.id and doc.document_type = 'tricycle_insurance' and doc.verification_status = 'approved'))
      )
  );
$$;

drop function if exists public.request_ride(text, text, double precision, double precision, double precision, double precision, text, text, numeric, integer);
create function public.request_ride(
  p_pickup_address text,
  p_dropoff_address text,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_pickup_state text,
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
  if p_pickup_address is null or length(trim(p_pickup_address)) not between 2 and 255
     or p_dropoff_address is null or length(trim(p_dropoff_address)) not between 2 and 255 then
    raise exception 'Enter valid pickup and destination addresses' using errcode = '22023';
  end if;
  if p_vehicle_type not in ('bike', 'car', 'tricycle') then
    raise exception 'Choose a valid ride type' using errcode = '22023';
  end if;
  if p_pickup_state is null or p_pickup_lga is null or not exists (
    select 1 from public.service_vehicle_areas a
    where a.state = p_pickup_state and a.lga = p_pickup_lga
      and a.vehicle_type = p_vehicle_type and a.enabled
  ) then
    raise exception 'This vehicle type is not available in the selected state and L.G.A.' using errcode = '22023';
  end if;
  if p_pickup_lat is null or p_pickup_lng is null or p_dropoff_lat is null or p_dropoff_lng is null
     or p_pickup_lat not between 4 and 14 or p_dropoff_lat not between 4 and 14
     or p_pickup_lng not between 2 and 15 or p_dropoff_lng not between 2 and 15
     or p_pickup_lat not between -90 and 90 or p_dropoff_lat not between -90 and 90
     or p_pickup_lng not between -180 and 180 or p_dropoff_lng not between -180 and 180 then
    raise exception 'Choose pickup and destination locations in Nigeria' using errcode = '22023';
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
    raise exception 'Your Kkary profile is not ready yet' using errcode = 'P0002';
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
    case when p_vehicle_type = 'bike' then 700 when p_vehicle_type = 'car' then 1500 else 1100 end,
    case when p_vehicle_type = 'bike' then 400 + (v_distance_km * 180)
         when p_vehicle_type = 'car' then 800 + (v_distance_km * 300)
         else 600 + (v_distance_km * 240) end
  );

  insert into public.rides (
    rider_id, pickup_address, dropoff_address,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
    pickup_state, pickup_lga, distance_km, eta_minutes, status, vehicle_type, estimated_fare
  ) values (
    v_profile.id, trim(p_pickup_address), trim(p_dropoff_address),
    p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
    trim(p_pickup_state), trim(p_pickup_lga), v_distance_km, p_eta_minutes,
    'matching', p_vehicle_type, v_fare
  )
  returning * into v_ride;
  return to_jsonb(v_ride);
end;
$$;

drop function if exists public.get_ride_vehicle_options(double precision, double precision, numeric, integer);
create function public.get_ride_vehicle_options(
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_pickup_state text,
  p_pickup_lga text,
  p_route_distance_km numeric,
  p_eta_minutes integer
)
returns table (vehicle_type text, estimated_fare numeric, available_drivers integer)
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
     or p_pickup_lat not between 4 and 14 or p_pickup_lng not between 2 and 15
     or p_pickup_state is null or p_pickup_lga is null
     or p_route_distance_km is null or p_route_distance_km < 0.1 or p_route_distance_km > 500
     or p_eta_minutes is null or p_eta_minutes < 1 or p_eta_minutes > 600 then
    raise exception 'Choose valid pickup and destination locations' using errcode = '22023';
  end if;
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if not found or v_profile.account_type <> 'rider' then
    raise exception 'Use the Rider app to check ride availability' using errcode = '42501';
  end if;

  foreach v_vehicle in array array['bike', 'car', 'tricycle'] loop
    if not exists (
      select 1 from public.service_vehicle_areas a
      where a.state = p_pickup_state and a.lga = p_pickup_lga
        and a.vehicle_type = v_vehicle and a.enabled
    ) then
      continue;
    end if;
    v_base := case when v_vehicle = 'bike' then 700 when v_vehicle = 'car' then 1500 else 1100 end;
    v_per_km := case when v_vehicle = 'bike' then 180 when v_vehicle = 'car' then 300 else 240 end;
    return query
    select v_vehicle,
      greatest(v_base, case when v_vehicle = 'bike' then 400 when v_vehicle = 'car' then 800 else 600 end
        + round(p_route_distance_km, 2) * v_per_km)::numeric(12, 2),
      count(*)::integer
    from public.driver_profiles d
    where d.is_approved and d.is_online and d.vehicle_type = v_vehicle
        and exists (
          select 1 from public.service_vehicle_areas driver_area
          where driver_area.state = d.state and driver_area.lga = d.lga
            and driver_area.vehicle_type = d.vehicle_type and driver_area.enabled
        )
        and d.location_updated_at >= now() - interval '2 minutes'
      and d.current_lat is not null and d.current_lng is not null
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

revoke all on function public.request_ride(text, text, double precision, double precision, double precision, double precision, text, text, text, numeric, integer) from public, anon;
grant execute on function public.request_ride(text, text, double precision, double precision, double precision, double precision, text, text, text, numeric, integer) to authenticated;
revoke all on function public.get_ride_vehicle_options(double precision, double precision, text, text, numeric, integer) from public, anon;
grant execute on function public.get_ride_vehicle_options(double precision, double precision, text, text, numeric, integer) to authenticated;

drop function if exists public.get_nearby_online_drivers(double precision, double precision);
create function public.get_nearby_online_drivers(
  p_lat double precision,
  p_lng double precision,
  p_state text,
  p_lga text
)
returns table (vehicle_type text, current_lat double precision, current_lng double precision)
language sql
stable
security definer
set search_path = public
as $$
  select d.vehicle_type, round(d.current_lat::numeric, 4)::double precision, round(d.current_lng::numeric, 4)::double precision
  from public.driver_profiles d
  where auth.uid() is not null
    and p_lat between -90 and 90 and p_lng between -180 and 180
    and exists (
      select 1 from public.service_vehicle_areas a
      where a.state = p_state and a.lga = p_lga
        and a.vehicle_type = d.vehicle_type and a.enabled
    )
    and exists (
      select 1 from public.service_vehicle_areas driver_area
      where driver_area.state = d.state and driver_area.lga = d.lga
        and driver_area.vehicle_type = d.vehicle_type and driver_area.enabled
    )
    and d.is_approved and d.is_online
    and d.location_updated_at >= now() - interval '2 minutes'
    and d.current_lat is not null and d.current_lng is not null
    and not exists (
      select 1 from public.rides active
      where active.driver_id = d.id
        and active.status in ('driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started')
    )
    and 6371 * 2 * asin(sqrt(
      power(sin(radians(p_lat - d.current_lat) / 2), 2)
      + cos(radians(d.current_lat)) * cos(radians(p_lat))
      * power(sin(radians(p_lng - d.current_lng) / 2), 2)
    )) <= 30
  order by 6371 * 2 * asin(sqrt(
    power(sin(radians(p_lat - d.current_lat) / 2), 2)
    + cos(radians(d.current_lat)) * cos(radians(p_lat))
    * power(sin(radians(p_lng - d.current_lng) / 2), 2)
  ))
  limit 50;
$$;
revoke all on function public.get_nearby_online_drivers(double precision, double precision, text, text) from public, anon;
grant execute on function public.get_nearby_online_drivers(double precision, double precision, text, text) to authenticated;

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
  if p_is_online and (p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180) then
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
    raise exception 'Your driver application is awaiting Kkary approval' using errcode = '42501';
  end if;
  if p_is_online and not public.driver_identity_verified(v_driver.id) then
    raise exception 'Upload and receive approval for all required driver documents before going online' using errcode = '42501';
  end if;
  if p_is_online and not exists (
    select 1 from public.service_vehicle_areas a
    where a.state = v_driver.state and a.lga = v_driver.lga
      and a.vehicle_type = v_driver.vehicle_type and a.enabled
  ) then
    raise exception 'Your vehicle type is no longer enabled for your registered state and L.G.A.' using errcode = '42501';
  end if;
  if not p_is_online and exists (
    select 1 from public.rides where driver_id = v_driver.id and status = 'trip_started'
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

create or replace function public.list_available_ride_offers()
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
    to_jsonb(r) || jsonb_build_object('rider', jsonb_build_object('name', rider.full_name, 'avatar_path', rider.avatar_path))
    order by r.created_at desc
  ), '[]'::jsonb)
  into v_offers
  from public.rides r
  join public.profiles rider on rider.id = r.rider_id
  where r.status = 'matching' and r.driver_id is null
    and r.vehicle_type = v_driver.vehicle_type
    and exists (
      select 1 from public.service_vehicle_areas driver_area
      where driver_area.state = v_driver.state and driver_area.lga = v_driver.lga
        and driver_area.vehicle_type = v_driver.vehicle_type and driver_area.enabled
    )
    and exists (
      select 1 from public.service_vehicle_areas a
      where a.state = r.pickup_state and a.lga = r.pickup_lga
        and a.vehicle_type = r.vehicle_type and a.enabled
    )
    and v_driver.current_lat is not null and v_driver.current_lng is not null
    and v_driver.location_updated_at >= now() - interval '2 minutes'
    and 6371 * 2 * asin(sqrt(
      power(sin(radians(r.pickup_lat - v_driver.current_lat) / 2), 2)
      + cos(radians(v_driver.current_lat)) * cos(radians(r.pickup_lat))
      * power(sin(radians(r.pickup_lng - v_driver.current_lng) / 2), 2)
    )) <= 30
    and not exists (
      select 1 from public.ride_driver_responses response
      where response.ride_id = r.id and response.driver_id = v_driver.id and response.response = 'declined'
    )
    and not exists (
      select 1 from public.rides active
      where active.driver_id = v_driver.id
        and active.status in ('driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started')
    );
  return v_offers;
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
     or v_driver.current_lat is null or v_driver.current_lng is null
     or not public.driver_identity_verified(v_driver.id)
     or not exists (
       select 1 from public.service_vehicle_areas driver_area
       where driver_area.state = v_driver.state and driver_area.lga = v_driver.lga
         and driver_area.vehicle_type = v_driver.vehicle_type and driver_area.enabled
     ) then
    raise exception 'You must be verified, approved, online, and sharing a recent location to accept rides' using errcode = '42501';
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
  where id = p_ride_id and status = 'matching' and driver_id is null
    and vehicle_type = v_driver.vehicle_type
    and exists (
      select 1 from public.service_vehicle_areas a
      where a.state = rides.pickup_state and a.lga = rides.pickup_lga
        and a.vehicle_type = rides.vehicle_type and a.enabled
    )
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

create or replace function public.ensure_nearby_driver_for_ride()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'matching' and new.driver_id is null
     and (
       not exists (
         select 1 from public.service_vehicle_areas a
         where a.state = new.pickup_state and a.lga = new.pickup_lga
           and a.vehicle_type = new.vehicle_type and a.enabled
       )
       or not exists (
         select 1
         from public.driver_profiles d
         where d.is_approved and d.is_online and d.vehicle_type = new.vehicle_type
           and exists (
             select 1 from public.service_vehicle_areas driver_area
             where driver_area.state = d.state and driver_area.lga = d.lga
               and driver_area.vehicle_type = d.vehicle_type and driver_area.enabled
           )
           and d.location_updated_at >= now() - interval '2 minutes'
           and d.current_lat is not null and d.current_lng is not null
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
       )
     ) then
    raise exception 'No approved drivers for this vehicle are currently available near your pickup. Choose another vehicle or try again shortly.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.admin_dashboard_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'riderCount', (select count(*) from public.profiles where account_type = 'rider'),
    'driverCount', (select count(*) from public.driver_profiles),
    'activeDriverCount', (
      select count(*) from public.driver_profiles
      where is_approved and is_online
        and location_updated_at >= now() - interval '2 minutes'
        and current_lat is not null and current_lng is not null
    ),
    'activeRideCount', (
      select count(*) from public.rides
      where status in ('matching', 'driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started')
    ),
    'completedRideCount', (select count(*) from public.rides where status = 'trip_completed'),
    'cancelledRideCount', (
      select count(*) from public.rides
      where status in ('cancelled_by_rider', 'cancelled_by_driver', 'cancelled_no_driver')
    ),
    'revenueKobo', coalesce((
      select round(sum(estimated_fare) * 100)::bigint
      from public.rides where status = 'trip_completed'
    ), 0)
  );
$$;

revoke all on function public.admin_dashboard_snapshot() from public, anon, authenticated;
grant execute on function public.admin_dashboard_snapshot() to service_role;
