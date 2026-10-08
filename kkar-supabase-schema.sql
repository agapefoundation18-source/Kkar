create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text unique,
  phone text unique,
  avatar_url text,
  avatar_path text,
  preferred_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists avatar_path text,
  add column if not exists preferred_language text not null default 'en';

create unique index if not exists profiles_auth_user_id_idx
  on public.profiles(auth_user_id);

update public.profiles p
set auth_user_id = u.id
from auth.users u
where p.auth_user_id is null
  and u.email is not null
  and lower(p.email) = lower(u.email);

update public.profiles p
set auth_user_id = u.id
from auth.users u
where p.auth_user_id is null
  and u.phone is not null
  and p.phone = u.phone;

insert into public.profiles (auth_user_id, full_name, email, phone)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
  u.email,
  u.phone
from auth.users u
where not exists (
  select 1 from public.profiles p where p.auth_user_id = u.id
)
on conflict (auth_user_id) do nothing;

create table if not exists public.saved_places (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_type text not null check (place_type in ('home', 'work', 'custom')),
  place_name text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, place_name)
);

create index if not exists saved_places_user_id_idx on public.saved_places(user_id);

create table if not exists public.rides (
  id uuid primary key default uuid_generate_v4(),
  rider_id uuid references public.profiles(id) on delete set null,
  driver_id uuid,
  pickup_address text not null,
  dropoff_address text not null,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  status text not null default 'requested',
  vehicle_type text not null default 'bike',
  estimated_fare numeric(12,2) not null default 0,
  final_fare numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_profiles (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  is_online boolean not null default false,
  vehicle_type text not null default 'bike',
  current_lat double precision,
  current_lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

alter table public.profiles enable row level security;
alter table public.rides enable row level security;
alter table public.driver_profiles enable row level security;
alter table public.saved_places enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
drop policy if exists "Profiles are updatable by owner" on public.profiles;
drop policy if exists "Profiles can be inserted by owner" on public.profiles;
drop policy if exists "Profiles can be selected by owner" on public.profiles;
drop policy if exists "Profiles can be updated by owner" on public.profiles;
drop policy if exists "Saved places are manageable by owner" on public.saved_places;

create policy "Profiles can be selected by owner"
  on public.profiles
  for select
  using (auth.uid() = auth_user_id);

create policy "Profiles can be inserted by owner"
  on public.profiles
  for insert
  with check (auth.uid() = auth_user_id);

create policy "Profiles can be updated by owner"
  on public.profiles
  for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (avatar_path, preferred_language) on public.profiles to authenticated;

create policy "Saved places are manageable by owner"
  on public.saved_places
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Rides are viewable by rider or assigned driver" on public.rides;
drop policy if exists "Rides can be inserted by authenticated users" on public.rides;
drop policy if exists "Driver profiles are viewable by authenticated users" on public.driver_profiles;

create policy "Rides are viewable by rider or assigned driver"
  on public.rides
  for select
  using (
    rider_id = auth.uid() or
    driver_id = auth.uid()
  );

create policy "Rides can be inserted by authenticated users"
  on public.rides
  for insert
  with check (auth.role() = 'authenticated');

create policy "Driver profiles are viewable by authenticated users"
  on public.driver_profiles
  for select
  using (auth.role() = 'authenticated');

drop trigger if exists set_public_profiles_updated_at on public.profiles;
drop trigger if exists set_public_rides_updated_at on public.rides;
drop trigger if exists set_public_driver_profiles_updated_at on public.driver_profiles;
create trigger set_public_profiles_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at();

create trigger set_public_rides_updated_at
before update on public.rides
for each row
execute procedure public.set_updated_at();

create trigger set_public_driver_profiles_updated_at
before update on public.driver_profiles
for each row
execute procedure public.set_updated_at();

drop trigger if exists set_saved_places_updated_at on public.saved_places;
create trigger set_saved_places_updated_at
before update on public.saved_places
for each row
execute procedure public.set_updated_at();

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (auth_user_id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.email,
    new.phone
  )
  on conflict (auth_user_id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_auth_user_profile_insert on auth.users;
drop trigger if exists sync_auth_user_profile_update on auth.users;
create trigger sync_auth_user_profile_insert
after insert on auth.users
for each row
execute procedure public.sync_auth_user_profile();

create trigger sync_auth_user_profile_update
after update of email, phone, raw_user_meta_data on auth.users
for each row
execute procedure public.sync_auth_user_profile();

create or replace function public.can_view_account_avatar(owner_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select owner_user_id = auth.uid()::text;
$$;

revoke all on function public.can_view_account_avatar(text) from public;
grant execute on function public.can_view_account_avatar(text) to authenticated;

create or replace function public.get_active_pickup_avatar_paths()
returns table (ride_id uuid, avatar_path text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, rider_profile.avatar_path
  from public.rides r
  join public.profiles rider_profile on rider_profile.id = r.rider_id
  where rider_profile.avatar_path is not null
    and r.status in ('driver_assigned', 'driver_en_route', 'driver_arrived')
    and (
      r.driver_id = auth.uid()
      or exists (
        select 1
        from public.driver_profiles assigned_driver
        join public.profiles driver_profile on driver_profile.id = assigned_driver.profile_id
        where assigned_driver.profile_id = r.driver_id
          and driver_profile.auth_user_id = auth.uid()
      )
    );
$$;

revoke all on function public.get_active_pickup_avatar_paths() from public;
grant execute on function public.get_active_pickup_avatar_paths() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('account-avatars', 'account-avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Users can upload their own account avatar" on storage.objects;
drop policy if exists "Users and active pickup drivers can view account avatars" on storage.objects;
drop policy if exists "Users can update their own account avatar" on storage.objects;
drop policy if exists "Users can delete their own account avatar" on storage.objects;

create policy "Users can upload their own account avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'account-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users and active pickup drivers can view account avatars"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'account-avatars'
    and public.can_view_account_avatar((storage.foldername(name))[1])
  );

create policy "Users can update their own account avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'account-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'account-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own account avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'account-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.can_delete_my_account()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null and not exists (
    select 1
    from public.rides r
    where (
      r.rider_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = r.rider_id and p.auth_user_id = auth.uid()
      )
    )
      and r.status in ('requested', 'matching', 'driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started')
  );
$$;

revoke all on function public.can_delete_my_account() from public;
grant execute on function public.can_delete_my_account() to authenticated;

drop function if exists public.delete_my_account();
