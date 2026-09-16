revoke execute on function public.is_admin() from anon, public;
revoke execute on function public.is_active_company() from anon, public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_company() to authenticated;
revoke execute on function public.handle_new_user() from anon, public;
