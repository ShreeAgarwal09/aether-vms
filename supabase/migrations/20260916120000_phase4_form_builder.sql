-- Phase 4: company-owned vendor form templates and fields.
-- Does not implement the public vendor form, submissions, or integrations.

alter table public.vendor_form_templates
  drop constraint if exists vendor_form_templates_company_user_id_key;

drop index if exists vendor_form_templates_company_user_id_key;

alter table public.vendor_form_templates
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists is_active boolean not null default true,
  add column if not exists version integer not null default 1;

update public.vendor_form_templates
set name = coalesce(nullif(btrim(name), ''), 'Untitled template')
where name is null or btrim(name) = '';

alter table public.vendor_form_templates
  alter column name set not null;

create unique index if not exists vendor_form_templates_company_name_idx
  on public.vendor_form_templates (company_user_id, lower(name));

create unique index if not exists vendor_form_templates_one_active_idx
  on public.vendor_form_templates (company_user_id)
  where is_active = true;

create index if not exists vendor_form_templates_company_updated_idx
  on public.vendor_form_templates (company_user_id, updated_at desc);

create or replace function public.touch_vendor_form_template()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vendor_form_template_updated_at on public.vendor_form_templates;
create trigger vendor_form_template_updated_at
  before update on public.vendor_form_templates
  for each row
  execute function public.touch_vendor_form_template();

create or replace function public.enforce_form_template_owner()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.company_user_id := auth.uid();
  elsif tg_op = 'UPDATE' and auth.uid() is not null then
    new.company_user_id := old.company_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_form_template_owner on public.vendor_form_templates;
create trigger enforce_form_template_owner
  before insert or update on public.vendor_form_templates
  for each row
  execute function public.enforce_form_template_owner();

create table if not exists public.vendor_form_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.vendor_form_templates (id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null,
  placeholder text,
  help_text text,
  is_required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  validation_rules jsonb not null default '{}'::jsonb,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_form_fields_type_check check (
    field_type in ('text', 'email', 'integer', 'datetime', 'dropdown', 'radio', 'checkbox')
  ),
  constraint vendor_form_fields_key_format check (field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint vendor_form_fields_sort_nonneg check (sort_order >= 0)
);

create unique index if not exists vendor_form_fields_template_key_idx
  on public.vendor_form_fields (template_id, field_key);

create index if not exists vendor_form_fields_template_sort_idx
  on public.vendor_form_fields (template_id, sort_order);

create or replace function public.touch_vendor_form_field()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vendor_form_field_updated_at on public.vendor_form_fields;
create trigger vendor_form_field_updated_at
  before update on public.vendor_form_fields
  for each row
  execute function public.touch_vendor_form_field();

create or replace function public.enforce_form_field_template_owner()
returns trigger
language plpgsql
as $$
declare
  owner uuid;
begin
  if auth.uid() is null then
    return new;
  end if;
  select company_user_id into owner
  from public.vendor_form_templates
  where id = new.template_id;
  if owner is distinct from auth.uid() then
    raise exception 'Cannot attach fields to another company template';
  end if;
  if tg_op = 'UPDATE' then
    new.template_id := old.template_id;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_form_field_template_owner on public.vendor_form_fields;
create trigger enforce_form_field_template_owner
  before insert or update on public.vendor_form_fields
  for each row
  execute function public.enforce_form_field_template_owner();

alter table public.vendor_form_templates enable row level security;
alter table public.vendor_form_fields enable row level security;

drop policy if exists "Company users manage their own form template" on public.vendor_form_templates;
drop policy if exists "Companies select own form templates" on public.vendor_form_templates;
drop policy if exists "Companies insert own form templates" on public.vendor_form_templates;
drop policy if exists "Companies update own form templates" on public.vendor_form_templates;
drop policy if exists "Companies delete own form templates" on public.vendor_form_templates;

create policy "Companies select own form templates"
  on public.vendor_form_templates for select to authenticated
  using (company_user_id = auth.uid() and public.is_active_company());

create policy "Companies insert own form templates"
  on public.vendor_form_templates for insert to authenticated
  with check (company_user_id = auth.uid() and public.is_active_company());

create policy "Companies update own form templates"
  on public.vendor_form_templates for update to authenticated
  using (company_user_id = auth.uid() and public.is_active_company())
  with check (company_user_id = auth.uid() and public.is_active_company());

create policy "Companies delete own form templates"
  on public.vendor_form_templates for delete to authenticated
  using (company_user_id = auth.uid() and public.is_active_company());

drop policy if exists "Companies select own form fields" on public.vendor_form_fields;
drop policy if exists "Companies insert own form fields" on public.vendor_form_fields;
drop policy if exists "Companies update own form fields" on public.vendor_form_fields;
drop policy if exists "Companies delete own form fields" on public.vendor_form_fields;

create policy "Companies select own form fields"
  on public.vendor_form_fields for select to authenticated
  using (
    public.is_active_company()
    and exists (
      select 1 from public.vendor_form_templates t
      where t.id = vendor_form_fields.template_id
        and t.company_user_id = auth.uid()
    )
  );

create policy "Companies insert own form fields"
  on public.vendor_form_fields for insert to authenticated
  with check (
    public.is_active_company()
    and exists (
      select 1 from public.vendor_form_templates t
      where t.id = vendor_form_fields.template_id
        and t.company_user_id = auth.uid()
    )
  );

create policy "Companies update own form fields"
  on public.vendor_form_fields for update to authenticated
  using (
    public.is_active_company()
    and exists (
      select 1 from public.vendor_form_templates t
      where t.id = vendor_form_fields.template_id
        and t.company_user_id = auth.uid()
    )
  )
  with check (
    public.is_active_company()
    and exists (
      select 1 from public.vendor_form_templates t
      where t.id = vendor_form_fields.template_id
        and t.company_user_id = auth.uid()
    )
  );

create policy "Companies delete own form fields"
  on public.vendor_form_fields for delete to authenticated
  using (
    public.is_active_company()
    and exists (
      select 1 from public.vendor_form_templates t
      where t.id = vendor_form_fields.template_id
        and t.company_user_id = auth.uid()
    )
  );

revoke all on public.vendor_form_templates from anon;
revoke all on public.vendor_form_fields from anon;
grant select, insert, update, delete on public.vendor_form_templates to authenticated;
grant select, insert, update, delete on public.vendor_form_fields to authenticated;

create or replace function public.activate_vendor_form_template(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_active_company() then
    raise exception 'Active company access required';
  end if;

  update public.vendor_form_templates
  set is_active = false
  where company_user_id = auth.uid()
    and id <> p_id
    and is_active = true;

  update public.vendor_form_templates
  set is_active = true
  where id = p_id
    and company_user_id = auth.uid();

  if not found then
    raise exception 'Template not found';
  end if;
end;
$$;

revoke all on function public.activate_vendor_form_template(uuid) from public;
grant execute on function public.activate_vendor_form_template(uuid) to authenticated;

comment on table public.vendor_form_templates is 'Company-owned vendor form templates. company_user_id is forced from auth.uid(). Admins cannot read these rows.';
comment on table public.vendor_form_fields is 'Fields for a company form template. Cascades on template delete. Public vendor rendering is Phase 5.';
