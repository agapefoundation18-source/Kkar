create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.driver_profiles(id) on delete cascade,
  document_type text not null check (document_type in (
    'drivers_license', 'nin',
    'motorcycle_registration', 'motorcycle_insurance',
    'car_registration', 'car_insurance'
  )),
  original_file_name text not null check (length(original_file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  storage_key text not null unique,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (driver_id, document_type)
);

create index if not exists driver_documents_review_idx
  on public.driver_documents (verification_status, created_at);

alter table public.driver_documents enable row level security;
revoke all on public.driver_documents from anon, authenticated;
grant select on public.driver_documents to authenticated;

drop policy if exists "Drivers can read their own document status" on public.driver_documents;
create policy "Drivers can read their own document status"
  on public.driver_documents for select to authenticated
  using (exists (
    select 1
    from public.driver_profiles d
    join public.profiles p on p.id = d.profile_id
    where d.id = driver_documents.driver_id
      and p.auth_user_id = auth.uid()
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-documents',
  'driver-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

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
        )
    )
  );

drop policy if exists "Drivers view their own verification documents" on storage.objects;
create policy "Drivers view their own verification documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'driver-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
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
    'car_registration', 'car_insurance'
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
  if p_document_type in ('motorcycle_registration', 'motorcycle_insurance') and v_driver.vehicle_type <> 'bike'
    or p_document_type in ('car_registration', 'car_insurance') and v_driver.vehicle_type <> 'car' then
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
      )
  );
$$;

revoke all on function public.driver_identity_verified(uuid) from public, anon;

create or replace function public.enforce_verified_driver_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_online and (not new.is_approved or not public.driver_identity_verified(new.id)) then
    raise exception 'Driver licence, NIN, and vehicle documents must be uploaded and approved before going online'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists driver_profiles_require_verified_documents on public.driver_profiles;
create trigger driver_profiles_require_verified_documents
before insert or update of is_online, is_approved
on public.driver_profiles
for each row execute function public.enforce_verified_driver_availability();

create or replace function public.sync_driver_document_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid := coalesce(new.driver_id, old.driver_id);
begin
  if not public.driver_identity_verified(v_driver_id) then
    update public.driver_profiles
    set is_online = false, is_approved = false
    where id = v_driver_id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists driver_documents_revoke_availability on public.driver_documents;
create trigger driver_documents_revoke_availability
after update of verification_status, document_type or delete
on public.driver_documents
for each row execute function public.sync_driver_document_eligibility();

update public.driver_profiles
set is_online = false, is_approved = false;

comment on table public.driver_documents is
  'Private driver verification documents. Required checklist: driver licence, NIN, and registration plus insurance for the registered motorcycle or car.';
