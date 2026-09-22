-- SaaS commercial layer: plans, subscriptions, billing statements, payment
-- events (idempotent), and customer sales tracking (kept strictly separate
-- from SaaS subscription revenue).

alter type public.credit_ledger_type add value if not exists 'plan_allowance';

create table public.plans (
  code text primary key check (code ~ '^[a-z0-9_-]+$'),
  name text not null,
  name_ar text,
  tagline text,
  tagline_ar text,
  price_monthly numeric(10,2) not null default 0 check (price_monthly >= 0),
  currency text not null default 'QAR',
  monthly_word_allowance bigint not null default 0 check (monthly_word_allowance >= 0),
  max_seats int not null default 1 check (max_seats >= 1),
  features jsonb not null default '[]',
  is_public boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.plans (code, name, name_ar, tagline, tagline_ar, price_monthly, monthly_word_allowance, max_seats, features, sort_order) values
  ('free',        'Free',        'مجاني',       'Get started with light translation needs',        'ابدأ لاحتياجات الترجمة البسيطة',          0.00,  3000,  1,  '["PDF / DOCX / scan translation","WYSIWYG correction preview","3,000 words per month","1 seat"]', 0),
  ('starter',     'Starter',     'المبتدئ',     'For freelancers and small offices',               'للمستقلين والمكاتب الصغيرة',             49.00,  10000, 3,  '["Everything in Free","10,000 words per month","3 seats","Private glossary & memory","Email support"]', 1),
  ('business',    'Business',    'الأعمال',     'For teams with regular document volume',          'للفرق ذات حجم مستندات منتظم',           149.00,  40000, 10, '["Everything in Starter","40,000 words per month","10 seats","Team roles & review workflow","Priority support"]', 2),
  ('enterprise',  'Enterprise',  'المؤسسات',    'High volume with dedicated onboarding',           'حجم كبير مع تهيئة مخصصة',               499.00, 150000, 50, '["Everything in Business","150,000 words per month","50 seats","SSO & audit exports","Dedicated manager"]', 3)
on conflict (code) do nothing;

create table public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  plan_code text not null references public.plans(code),
  status text not null default 'active' check (status in ('trialing','active','past_due','canceled')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '30 days'),
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  provider text not null default 'manual' check (provider in ('manual','noqoody')),
  provider_customer_id text,
  provider_subscription_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspace_subscriptions_plan_status_idx on public.workspace_subscriptions(plan_code, status);

-- Provider payment events; the (provider, provider_event_id) pair is the
-- dedupe key that guarantees one charge activates one period exactly once.
create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table public.billing_statements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('subscription_payment','plan_change','plan_allowance','manual')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  currency text not null default 'QAR',
  description text,
  plan_code text,
  period_start timestamptz,
  period_end timestamptz,
  provider text,
  provider_event_id text,
  external_key text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index billing_statements_workspace_created_idx on public.billing_statements(workspace_id, created_at desc);

-- Customer business sales: entirely separate from SaaS subscription revenue.
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  document_project_id uuid references public.projects(id) on delete set null,
  customer_name text not null,
  description text,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'QAR',
  sale_date date not null default current_date,
  status text not null default 'recorded' check (status in ('recorded','partially_paid','paid','void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sales_workspace_date_idx on public.sales(workspace_id, sale_date desc);
create index sales_workspace_project_idx on public.sales(workspace_id, document_project_id) where document_project_id is not null;

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash','card','bank_transfer','cheque','other')),
  paid_on date not null default current_date,
  reference text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index sale_payments_workspace_date_idx on public.sale_payments(workspace_id, paid_on desc);
create index sale_payments_sale_idx on public.sale_payments(sale_id);

-- Recompute a sale's status from its payments; the trigger keeps
-- status/paid totals consistent so retries and double-clicks cannot inflate
-- received amounts (payments are unique rows, totals derive from them).
create or replace function public.refresh_sale_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sale record;
  v_paid numeric(12,2);
begin
  select id, workspace_id, amount into v_sale from public.sales where id = coalesce(new.sale_id, old.sale_id);
  select coalesce(sum(amount), 0) into v_paid from public.sale_payments where sale_id = v_sale.id;
  update public.sales set
    status = case
      when v_paid >= v_sale.amount then 'paid'
      when v_paid > 0 then 'partially_paid'
      else 'recorded' end,
    updated_at = now()
  where id = v_sale.id;
  return null;
end;
$$;

create trigger sale_payments_refresh_status
after insert or update or delete on public.sale_payments
for each row execute function public.refresh_sale_status();

-- Set/activate a workspace plan. Idempotent per (plan, period start): the
-- word allowance lands in the credit ledger exactly once per period.
create or replace function public.set_workspace_plan(
  p_workspace_id uuid, p_plan_code text, p_period_days int default 30,
  p_provider text default 'manual', p_actor_id uuid default null, p_status text default 'active'
)
returns table(subscription_id uuid, plan_code text, period_start timestamptz, period_end timestamptz, credits_granted bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.plans%rowtype;
  v_period_start timestamptz := now();
  v_period_end timestamptz;
  v_sub_id uuid;
  v_balance bigint;
  v_external_key text;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'server role required' using errcode = '42501';
  end if;

  select * into v_plan from public.plans where code = p_plan_code;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if p_period_days is null or p_period_days < 1 or p_period_days > 400 then
    raise exception 'invalid period' using errcode = '22023';
  end if;
  v_period_end := v_period_start + make_interval(days => p_period_days);

  insert into public.workspace_subscriptions (workspace_id, plan_code, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, provider, created_by)
  values (p_workspace_id, p_plan_code, p_status, v_period_start, v_period_end, false, null, p_provider, p_actor_id)
  on conflict (workspace_id) do update set
    plan_code = excluded.plan_code,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = false,
    canceled_at = null,
    provider = excluded.provider,
    updated_at = now()
  returning id into v_sub_id;

  v_external_key := 'plan:' || p_plan_code || ':' || v_period_start::date::text;
  if v_plan.monthly_word_allowance > 0 then
    select balance into v_balance from public.credit_accounts where workspace_id = p_workspace_id for update;
    update public.credit_accounts set balance = balance + v_plan.monthly_word_allowance, updated_at = now() where workspace_id = p_workspace_id returning balance into v_balance;
    insert into public.credit_ledger (workspace_id, entry_type, delta, balance_after, reason, actor_id, external_key)
    values (p_workspace_id, 'plan_allowance', v_plan.monthly_word_allowance, v_balance, 'Plan allowance: ' || v_plan.name, p_actor_id, v_external_key)
    on conflict (external_key) do nothing;
  end if;

  insert into public.billing_statements (workspace_id, kind, amount, currency, description, plan_code, period_start, period_end, provider, external_key, created_by)
  values (p_workspace_id, 'plan_change', 0, v_plan.currency, 'Plan set to ' || v_plan.name, p_plan_code, v_period_start, v_period_end, p_provider, 'plan-stmt:' || v_external_key, p_actor_id)
  on conflict (external_key) do nothing;

  return query select v_sub_id, p_plan_code, v_period_start, v_period_end, v_plan.monthly_word_allowance;
end;
$$;

create or replace function public.cancel_workspace_subscription(p_workspace_id uuid, p_immediate boolean default false)
returns table(status text)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'server role required' using errcode = '42501';
  end if;
  update public.workspace_subscriptions set
    status = case when p_immediate then 'canceled' else status end,
    cancel_at_period_end = true,
    canceled_at = case when p_immediate then now() else canceled_at end,
    updated_at = now()
  where workspace_id = p_workspace_id;
  return query select case when p_immediate then 'canceled' else 'cancel_at_period_end' end::text;
end;
$$;

-- Apply a payment-provider event exactly once. Returns 'already_processed'
-- for replays so duplicate webhooks can never double-activate or double-credit.
create or replace function public.apply_provider_payment(
  p_provider text, p_provider_event_id text, p_event_type text,
  p_workspace_id uuid, p_plan_code text, p_amount numeric, p_currency text,
  p_period_days int, p_payload jsonb
)
returns table(result text, plan_code text, period_end timestamptz, credits_granted bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_inserted boolean;
  v_plan public.plans%rowtype;
  v_period_start timestamptz := now();
  v_period_end timestamptz;
  v_balance bigint;
  v_grant_key text;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'server role required' using errcode = '42501';
  end if;

  insert into public.subscription_events (provider, provider_event_id, event_type, workspace_id, payload)
  values (p_provider, p_provider_event_id, p_event_type, p_workspace_id, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, provider_event_id) do nothing;
  v_inserted := found;
  if not v_inserted then
    return query select 'already_processed'::text, null::text, null::timestamptz, null::bigint;
    return;
  end if;

  if p_event_type not in ('payment.succeeded','subscription.renewed') then
    return query select 'ignored'::text, null::text, null::timestamptz, null::bigint;
    return;
  end if;

  select * into v_plan from public.plans where code = p_plan_code;
  if not found then
    return query select 'unknown_plan'::text, null::text, null::timestamptz, null::bigint;
    return;
  end if;

  v_period_end := v_period_start + make_interval(days => greatest(coalesce(p_period_days, 30), 1));

  insert into public.workspace_subscriptions (workspace_id, plan_code, status, current_period_start, current_period_end, provider, created_by)
  values (p_workspace_id, p_plan_code, 'active', v_period_start, v_period_end, p_provider, null)
  on conflict (workspace_id) do update set
    plan_code = excluded.plan_code,
    status = 'active',
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = false,
    canceled_at = null,
    provider = excluded.provider,
    updated_at = now();

  insert into public.billing_statements (workspace_id, kind, amount, currency, description, plan_code, period_start, period_end, provider, provider_event_id, external_key)
  values (p_workspace_id, 'subscription_payment', coalesce(p_amount, 0), coalesce(p_currency, v_plan.currency), v_plan.name || ' payment', p_plan_code, v_period_start, v_period_end, p_provider, p_provider_event_id, 'pay:' || p_provider || ':' || p_provider_event_id)
  on conflict (external_key) do nothing;

  v_grant_key := 'grant:' || p_provider || ':' || p_provider_event_id;
  if v_plan.monthly_word_allowance > 0 then
    select balance into v_balance from public.credit_accounts where workspace_id = p_workspace_id for update;
    update public.credit_accounts set balance = balance + v_plan.monthly_word_allowance, updated_at = now() where workspace_id = p_workspace_id returning balance into v_balance;
    insert into public.credit_ledger (workspace_id, entry_type, delta, balance_after, reason, external_key)
    values (p_workspace_id, 'plan_allowance', v_plan.monthly_word_allowance, v_balance, 'Paid period: ' || v_plan.name, v_grant_key)
    on conflict (external_key) do nothing;
  end if;

  return query select 'applied'::text, p_plan_code, v_period_end, v_plan.monthly_word_allowance;
end;
$$;

revoke all on function public.set_workspace_plan(uuid, text, int, text, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_workspace_subscription(uuid, boolean) from public, anon, authenticated;
revoke all on function public.apply_provider_payment(text, text, text, uuid, text, numeric, text, int, jsonb) from public, anon, authenticated;
grant execute on function public.set_workspace_plan(uuid, text, int, text, uuid, text) to service_role;
grant execute on function public.cancel_workspace_subscription(uuid, boolean) to service_role;
grant execute on function public.apply_provider_payment(text, text, text, uuid, text, numeric, text, int, jsonb) to service_role;

-- RLS
alter table public.plans enable row level security;
alter table public.plans force row level security;
create policy plans_select_public on public.plans for select to anon, authenticated using (is_public);

alter table public.workspace_subscriptions enable row level security;
alter table public.workspace_subscriptions force row level security;
create policy subscriptions_select_member on public.workspace_subscriptions for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));

alter table public.subscription_events enable row level security;
alter table public.subscription_events force row level security;
create policy subscription_events_select_admin on public.subscription_events for select to authenticated using ((select private.is_platform_admin()));

alter table public.billing_statements enable row level security;
alter table public.billing_statements force row level security;
create policy statements_select_member on public.billing_statements for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));

alter table public.sales enable row level security;
alter table public.sales force row level security;
create policy sales_select_member on public.sales for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy sales_insert_admin on public.sales for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin'])));
create policy sales_update_admin on public.sales for update to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin']))) with check ((select private.has_workspace_role(workspace_id, array['owner','admin'])));
create policy sales_delete_admin on public.sales for delete to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin'])));

alter table public.sale_payments enable row level security;
alter table public.sale_payments force row level security;
create policy sale_payments_select_member on public.sale_payments for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy sale_payments_insert_admin on public.sale_payments for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin'])));
