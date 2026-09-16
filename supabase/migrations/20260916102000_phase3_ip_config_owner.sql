create or replace function public.enforce_ip_config_owner()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.company_user_id := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists enforce_ip_config_owner on public.ip_configs;
create trigger enforce_ip_config_owner
  before insert or update on public.ip_configs
  for each row
  execute function public.enforce_ip_config_owner();
