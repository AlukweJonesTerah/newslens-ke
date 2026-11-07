create table public.sms_followup_sends (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table public.sms_followup_sends enable row level security;
revoke all on table public.sms_followup_sends from public, anon, authenticated;

create or replace function public.claim_sms_followup_send()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent_sends integer;
begin
  perform pg_advisory_xact_lock(hashtext('newslens_sms_followup_sends')::bigint);

  select count(*)::integer
  into recent_sends
  from public.sms_followup_sends
  where created_at >= now() - interval '24 hours';

  if recent_sends >= 5 then
    return false;
  end if;

  insert into public.sms_followup_sends default values;
  return true;
end;
$$;

revoke all on function public.claim_sms_followup_send() from public, anon, authenticated;
grant execute on function public.claim_sms_followup_send() to service_role;