create table public.sms_subscribers (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  opted_in_at timestamptz not null,
  opted_out_at timestamptz,
  consent_source text,
  created_at timestamptz not null default now()
);

comment on table public.sms_subscribers is
  'SMS recipients with an explicit opt-in timestamp and opt-out state';

create table public.sms_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.sms_subscribers (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  delivery_type text not null check (delivery_type in ('story', 'followup')),
  status text not null check (
    status in ('queued', 'accepted', 'sent', 'delivered', 'failed', 'skipped_window', 'skipped_opt_out')
  ),
  callback_data uuid not null default gen_random_uuid() unique,
  provider_message_id text unique,
  provider_status text,
  error_code text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz
);

create index sms_deliveries_recent_story_idx
  on public.sms_deliveries (sent_at desc)
  where delivery_type = 'story' and status in ('sent', 'delivered');

create index sms_deliveries_subscriber_story_idx
  on public.sms_deliveries (subscriber_id, story_id, delivery_type);

create unique index sms_one_followup_per_subscriber_story_idx
  on public.sms_deliveries (subscriber_id, story_id)
  where delivery_type = 'followup';

alter table public.sms_subscribers enable row level security;
alter table public.sms_deliveries enable row level security;
revoke all on table public.sms_subscribers from public, anon, authenticated;
revoke all on table public.sms_deliveries from public, anon, authenticated;

create or replace function public.claim_sms_followup_delivery(
  p_subscriber_id uuid,
  p_story_id uuid
)
returns table (delivery_id uuid, callback_data uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with eligible_subscriber as (
    select id
    from public.sms_subscribers
    where id = p_subscriber_id
      and opted_in_at is not null
      and opted_out_at is null
      and phone_number ~ '^\+[1-9][0-9]{7,14}$'
    for update
  ), inserted_delivery as (
    insert into public.sms_deliveries (
      subscriber_id,
      story_id,
      delivery_type,
      status
    )
    select id, p_story_id, 'followup', 'queued'
    from eligible_subscriber
    on conflict (subscriber_id, story_id) where delivery_type = 'followup'
      do nothing
    returning sms_deliveries.id, sms_deliveries.callback_data
  )
  select inserted_delivery.id, inserted_delivery.callback_data
  from inserted_delivery;
end;
$$;

revoke all on function public.claim_sms_followup_delivery(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_sms_followup_delivery(uuid, uuid)
  to service_role;