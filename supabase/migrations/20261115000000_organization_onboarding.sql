create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('administrator', 'structural_engineer', 'inspector', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invited_email text not null,
  invited_role text not null check (invited_role in ('structural_engineer', 'inspector', 'viewer')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists organization_invitations_org_idx
  on public.organization_invitations (organization_id, created_at desc);

create or replace function public.current_user_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select organization_id
  from public.organization_memberships
  where user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_memberships
    where organization_id = target_organization_id
      and user_id = auth.uid()
  )
$$;

create or replace function public.is_organization_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_memberships
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role = 'administrator'
  )
$$;

create or replace function public.create_organization(organization_name text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  new_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if exists (select 1 from public.organization_memberships where user_id = auth.uid()) then
    raise exception 'You already belong to an organization';
  end if;
  if organization_name is null or char_length(btrim(organization_name)) not between 2 and 120 then
    raise exception 'Organization name must be between 2 and 120 characters';
  end if;

  insert into public.organizations (name, created_by)
  values (btrim(organization_name), auth.uid())
  returning id into new_organization_id;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'administrator');

  return new_organization_id;
end
$$;

create or replace function public.create_organization_invite(p_invited_email text, p_invited_role text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_organization_id uuid;
  invite_token text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  v_organization_id := public.current_user_organization_id();
  if v_organization_id is null or not public.is_organization_admin(v_organization_id) then
    raise exception 'Organization administrator access required';
  end if;
  if p_invited_email is null or position('@' in p_invited_email) < 2 then
    raise exception 'A valid invitation email is required';
  end if;
  if p_invited_role is null or p_invited_role not in ('structural_engineer', 'inspector', 'viewer') then
    raise exception 'Invalid invitation role';
  end if;

  invite_token := encode(gen_random_bytes(32), 'hex');
  insert into public.organization_invitations (
    organization_id, invited_email, invited_role, token_hash, invited_by
  ) values (
    v_organization_id,
    lower(btrim(p_invited_email)),
    p_invited_role,
    encode(digest(invite_token, 'sha256'), 'hex'),
    auth.uid()
  );
  return invite_token;
end
$$;

create or replace function public.join_organization(invitation_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  invite public.organization_invitations%rowtype;
  authenticated_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if invitation_token is null or char_length(invitation_token) < 32 then
    raise exception 'Invalid invitation token';
  end if;
  if exists (select 1 from public.organization_memberships where user_id = auth.uid()) then
    raise exception 'You already belong to an organization';
  end if;

  select lower(email) into authenticated_email
  from auth.users
  where id = auth.uid();

  select * into invite
  from public.organization_invitations
  where token_hash = encode(digest(invitation_token, 'sha256'), 'hex')
    and accepted_at is null
    and expires_at > now()
    and lower(invited_email) = authenticated_email
  for update;

  if not found then
    raise exception 'Invitation is invalid, expired, already used, or belongs to another email';
  end if;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (invite.organization_id, auth.uid(), invite.invited_role);
  update public.organization_invitations
  set accepted_at = now()
  where id = invite.id;

  return invite.organization_id;
end
$$;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_invitations enable row level security;

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations
  for select to authenticated
  using (public.is_organization_member(id));

drop policy if exists memberships_scoped_read on public.organization_memberships;
create policy memberships_scoped_read on public.organization_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_organization_admin(organization_id)
  );

drop policy if exists invitations_admin_read on public.organization_invitations;
create policy invitations_admin_read on public.organization_invitations
  for select to authenticated
  using (public.is_organization_admin(organization_id));

revoke all on public.organizations, public.organization_memberships, public.organization_invitations from anon, authenticated;
grant select on public.organizations, public.organization_memberships, public.organization_invitations to authenticated;

revoke all on function public.current_user_organization_id() from public, anon;
revoke all on function public.is_organization_member(uuid) from public, anon;
revoke all on function public.is_organization_admin(uuid) from public, anon;
revoke all on function public.create_organization(text) from public, anon;
revoke all on function public.create_organization_invite(text, text) from public, anon;
revoke all on function public.join_organization(text) from public, anon;
grant execute on function public.current_user_organization_id() to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_organization_admin(uuid) to authenticated;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.create_organization_invite(text, text) to authenticated;
grant execute on function public.join_organization(text) to authenticated;

alter table public.buildings
  add column if not exists organisation_id uuid references public.organizations(id) on delete cascade;
create index if not exists buildings_organisation_id_idx
  on public.buildings (organisation_id);
alter table public.buildings enable row level security;
revoke all on public.buildings from anon;
grant select, insert, update, delete on public.buildings to authenticated;

drop policy if exists buildings_organization_select on public.buildings;
create policy buildings_organization_select on public.buildings
  for select to authenticated
  using (organisation_id = public.current_user_organization_id());

drop policy if exists buildings_organization_select_guard on public.buildings;
create policy buildings_organization_select_guard on public.buildings
  as restrictive for select to authenticated
  using (organisation_id = public.current_user_organization_id());

drop policy if exists buildings_organization_insert on public.buildings;
create policy buildings_organization_insert on public.buildings
  for insert to authenticated
  with check (
    organisation_id = public.current_user_organization_id()
    and public.is_organization_admin(organisation_id)
  );

drop policy if exists buildings_organization_insert_guard on public.buildings;
create policy buildings_organization_insert_guard on public.buildings
  as restrictive for insert to authenticated
  with check (
    organisation_id = public.current_user_organization_id()
    and public.is_organization_admin(organisation_id)
  );

drop policy if exists buildings_organization_update on public.buildings;
create policy buildings_organization_update on public.buildings
  for update to authenticated
  using (
    organisation_id = public.current_user_organization_id()
    and public.is_organization_admin(organisation_id)
  )
  with check (
    organisation_id = public.current_user_organization_id()
    and public.is_organization_admin(organisation_id)
  );

drop policy if exists buildings_organization_update_guard on public.buildings;
create policy buildings_organization_update_guard on public.buildings
  as restrictive for update to authenticated
  using (
    organisation_id = public.current_user_organization_id()
    and public.is_organization_admin(organisation_id)
  )
  with check (
    organisation_id = public.current_user_organization_id()
    and public.is_organization_admin(organisation_id)
  );

drop policy if exists buildings_organization_delete on public.buildings;
create policy buildings_organization_delete on public.buildings
  for delete to authenticated
  using (
    organisation_id = public.current_user_organization_id()
    and public.is_organization_admin(organisation_id)
  );

drop policy if exists buildings_organization_delete_guard on public.buildings;
create policy buildings_organization_delete_guard on public.buildings
  as restrictive for delete to authenticated
  using (
    organisation_id = public.current_user_organization_id()
    and public.is_organization_admin(organisation_id)
  );
