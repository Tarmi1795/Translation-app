-- English Arabic Translate AI — free beta schema
-- Tenant isolation, review workflow, private learning, and transactional credits.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.workspace_role as enum ('owner', 'admin', 'translator', 'reviewer');
create type public.workspace_kind as enum ('personal', 'organization');
create type public.language_direction as enum ('en-ar', 'ar-en');
create type public.project_state as enum ('draft', 'estimating', 'ready', 'translating', 'review', 'approved', 'failed', 'cancelled');
create type public.job_stage as enum ('queued', 'validating', 'extracting', 'ocr_review', 'reserving_credits', 'retrieving_context', 'translating', 'quality_check', 'reconstructing', 'completed', 'failed', 'cancelled');
create type public.input_kind as enum ('text', 'docx', 'pdf', 'image', 'scan', 'camera');
create type public.export_format as enum ('docx', 'pdf', 'txt');
create type public.credit_ledger_type as enum ('beta_grant', 'admin_grant', 'translation_usage', 'reversal');
create type public.credit_reservation_status as enum ('active', 'committed', 'released', 'expired');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  kind public.workspace_kind not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_owner_profile_fkey foreign key (owner_id) references public.profiles(id) on delete restrict
);
create unique index workspaces_one_personal_per_owner_idx on public.workspaces(owner_id) where kind = 'personal';
create index workspaces_owner_id_idx on public.workspaces(owner_id);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint workspace_members_user_profile_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);
create index workspace_members_user_id_idx on public.workspace_members(user_id, workspace_id);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.workspace_role not null check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index workspace_invites_workspace_id_idx on public.workspace_invites(workspace_id, created_at desc);
create index workspace_invites_email_active_idx on public.workspace_invites(lower(email)) where accepted_at is null and revoked_at is null;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 240),
  direction public.language_direction not null,
  state public.project_state not null default 'draft',
  source_word_count bigint not null default 0 check (source_word_count >= 0),
  current_document_id uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_workspace_updated_idx on public.projects(workspace_id, updated_at desc) where deleted_at is null;
create index projects_created_by_idx on public.projects(created_by);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 52428800),
  input_kind public.input_kind not null,
  storage_path text,
  sha256 text,
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'validated', 'rejected', 'deleted')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_workspace_project_idx on public.documents(workspace_id, project_id, created_at desc);
create index documents_uploaded_by_idx on public.documents(uploaded_by);
alter table public.projects add constraint projects_current_document_id_fkey foreign key (current_document_id) references public.documents(id) on delete set null;
create index projects_current_document_id_idx on public.projects(current_document_id) where current_document_id is not null;

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  version_number bigint not null check (version_number > 0),
  canonical_tree jsonb not null default '{}'::jsonb,
  layout_warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(layout_warnings) = 'array'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);
create index document_versions_workspace_project_idx on public.document_versions(workspace_id, project_id, version_number desc);
create index document_versions_document_id_idx on public.document_versions(document_id) where document_id is not null;

create table public.document_nodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_id uuid not null references public.document_versions(id) on delete cascade,
  node_key text not null,
  node_type text not null,
  page_number integer not null default 1 check (page_number > 0),
  node_order integer not null check (node_order >= 0),
  source_text text not null default '',
  translated_text text,
  confidence numeric(5,4) check (confidence between 0 and 1),
  bounds jsonb,
  style jsonb,
  metadata jsonb not null default '{}'::jsonb,
  unique (version_id, node_key)
);
create index document_nodes_version_order_idx on public.document_nodes(version_id, node_order);
create index document_nodes_workspace_project_idx on public.document_nodes(workspace_id, project_id);

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_id uuid not null references public.document_versions(id) on delete cascade,
  node_id uuid references public.document_nodes(id) on delete set null,
  segment_order integer not null check (segment_order >= 0),
  source_text text not null,
  translated_text text,
  status text not null default 'pending' check (status in ('pending', 'translated', 'edited', 'approved', 'failed')),
  source_confidence numeric(5,4) check (source_confidence between 0 and 1),
  quality_flags text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version_id, segment_order)
);
create index segments_project_order_idx on public.segments(project_id, segment_order);
create index segments_workspace_status_idx on public.segments(workspace_id, status);
create index segments_node_id_idx on public.segments(node_id) where node_id is not null;

create table public.segment_revisions (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  segment_id uuid not null references public.segments(id) on delete cascade,
  editor_id uuid not null references auth.users(id) on delete restrict,
  field_name text not null check (field_name in ('source_text', 'translated_text')),
  old_value text,
  new_value text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index segment_revisions_segment_created_idx on public.segment_revisions(segment_id, created_at desc);
create index segment_revisions_workspace_project_idx on public.segment_revisions(workspace_id, project_id);

create table public.translation_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  version_id uuid references public.document_versions(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  stage public.job_stage not null default 'queued',
  progress numeric(5,2) not null default 0 check (progress between 0 and 100),
  total_segments integer not null default 0 check (total_segments >= 0),
  completed_segments integer not null default 0 check (completed_segments >= 0 and completed_segments <= total_segments),
  source_word_count bigint not null default 0 check (source_word_count >= 0),
  workflow_run_id text,
  error_code text,
  error_message text,
  cancellation_requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);
create index translation_jobs_project_created_idx on public.translation_jobs(project_id, created_at desc);
create index translation_jobs_workspace_stage_idx on public.translation_jobs(workspace_id, stage, created_at desc);
create index translation_jobs_document_id_idx on public.translation_jobs(document_id) where document_id is not null;
create index translation_jobs_version_id_idx on public.translation_jobs(version_id) where version_id is not null;

create table public.job_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid not null references public.translation_jobs(id) on delete cascade,
  stage public.job_stage not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index job_events_job_created_idx on public.job_events(job_id, created_at);
create index job_events_workspace_id_idx on public.job_events(workspace_id);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  format public.export_format not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed', 'expired')),
  storage_path text,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  error_message text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index exports_workspace_project_idx on public.exports(workspace_id, project_id, created_at desc);
create index exports_requested_by_idx on public.exports(requested_by);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  assignee_id uuid not null references auth.users(id) on delete cascade,
  assignment_type text not null check (assignment_type in ('translation', 'review')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, assignee_id, assignment_type)
);
create index assignments_workspace_assignee_idx on public.assignments(workspace_id, assignee_id, status);
create index assignments_project_id_idx on public.assignments(project_id);

create table public.review_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  segment_id uuid references public.segments(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 5000),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index review_comments_project_created_idx on public.review_comments(project_id, created_at);
create index review_comments_segment_id_idx on public.review_comments(segment_id) where segment_id is not null;
create index review_comments_workspace_id_idx on public.review_comments(workspace_id);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('submitted', 'changes_requested', 'approved')),
  owner_override boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);
create index approvals_project_created_idx on public.approvals(project_id, created_at desc);
create index approvals_workspace_reviewer_idx on public.approvals(workspace_id, reviewer_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index audit_logs_workspace_created_idx on public.audit_logs(workspace_id, created_at desc);
create index audit_logs_actor_id_idx on public.audit_logs(actor_id, created_at desc);

create table public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  direction public.language_direction not null,
  source_term text not null,
  target_term text not null,
  notes text,
  case_sensitive boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index glossary_terms_unique_normalized_idx on public.glossary_terms(workspace_id, direction, lower(source_term));
create index glossary_terms_workspace_id_idx on public.glossary_terms(workspace_id);

create table public.translation_memory (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  direction public.language_direction not null,
  source_text text not null,
  target_text text not null,
  source_hash text not null,
  approved boolean not null default false,
  origin text not null check (origin in ('seed', 'approved_correction')),
  source_segment_id uuid references public.segments(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, direction, source_hash)
);
create index translation_memory_workspace_approved_idx on public.translation_memory(workspace_id, direction, approved) where approved = true;
create index translation_memory_source_segment_id_idx on public.translation_memory(source_segment_id) where source_segment_id is not null;

-- Manually approved seed examples are globally retrievable by the server only.
-- Evaluation rows are deliberately stored separately and never loaded at runtime.
create table public.global_translation_memory (
  id uuid primary key default gen_random_uuid(),
  direction public.language_direction not null,
  source_text text not null,
  target_text text not null,
  source_hash text not null,
  corpus_name text not null,
  created_at timestamptz not null default now(),
  unique (direction, source_hash)
);
create index global_translation_memory_direction_created_idx on public.global_translation_memory(direction, created_at desc);

create table public.evaluation_segments (
  id uuid primary key default gen_random_uuid(),
  direction public.language_direction not null,
  source_text text not null,
  target_text text not null,
  source_hash text not null,
  corpus_name text not null,
  created_at timestamptz not null default now(),
  unique (direction, source_hash)
);
create index evaluation_segments_corpus_idx on public.evaluation_segments(corpus_name, direction);

create table public.correction_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  segment_id uuid not null references public.segments(id) on delete cascade,
  editor_id uuid not null references auth.users(id) on delete restrict,
  before_text text,
  after_text text not null,
  approved boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index correction_events_workspace_approved_idx on public.correction_events(workspace_id, approved, created_at desc);
create index correction_events_project_id_idx on public.correction_events(project_id);
create index correction_events_segment_id_idx on public.correction_events(segment_id);

create table public.training_consents (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  global_learning boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.training_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  correction_event_id uuid not null unique references public.correction_events(id) on delete cascade,
  direction public.language_direction not null,
  source_text text not null,
  target_text text not null,
  deidentified boolean not null default false,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected', 'evaluation_holdout')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index training_candidates_status_created_idx on public.training_candidates(approval_status, created_at);
create index training_candidates_workspace_id_idx on public.training_candidates(workspace_id);

create table public.credit_accounts (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  reserved bigint not null default 0 check (reserved >= 0 and reserved <= balance),
  updated_at timestamptz not null default now()
);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entry_type public.credit_ledger_type not null,
  delta bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reason text,
  actor_id uuid references auth.users(id) on delete set null,
  job_id uuid references public.translation_jobs(id) on delete set null,
  external_key text unique,
  created_at timestamptz not null default now()
);
create index credit_ledger_workspace_created_idx on public.credit_ledger(workspace_id, created_at desc);
create index credit_ledger_job_id_idx on public.credit_ledger(job_id) where job_id is not null;

create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid not null unique references public.translation_jobs(id) on delete cascade,
  amount bigint not null check (amount > 0),
  committed_amount bigint not null default 0 check (committed_amount >= 0 and committed_amount <= amount),
  status public.credit_reservation_status not null default 'active',
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index credit_reservations_workspace_status_idx on public.credit_reservations(workspace_id, status, expires_at);

create table public.admin_credit_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  amount bigint not null check (amount > 0),
  reason text not null check (char_length(reason) between 8 and 1000),
  granted_by uuid not null references auth.users(id) on delete restrict,
  ledger_id bigint not null unique references public.credit_ledger(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index admin_credit_grants_workspace_created_idx on public.admin_credit_grants(workspace_id, created_at desc);
create index admin_credit_grants_granted_by_idx on public.admin_credit_grants(granted_by, created_at desc);

create table public.rate_limit_events (
  identity_hash text not null,
  action text not null,
  window_start timestamptz not null,
  hits integer not null default 1 check (hits > 0),
  updated_at timestamptz not null default now(),
  primary key (identity_hash, action, window_start)
);
create index rate_limit_events_expiry_idx on public.rate_limit_events(window_start);

-- Security helpers live outside the exposed schema and always verify the caller.
create or replace function private.has_workspace_role(p_workspace_id uuid, p_roles public.workspace_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
      and (p_roles is null or wm.role = any(p_roles))
  );
$$;

create or replace function private.shares_workspace(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_other_user_id
  );
$$;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_platform_admin = true
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.has_workspace_role(uuid, public.workspace_role[]) to authenticated;
grant execute on function private.shares_workspace(uuid) to authenticated;
grant execute on function private.is_platform_admin() to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger workspaces_set_updated_at before update on public.workspaces for each row execute function private.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function private.set_updated_at();
create trigger documents_set_updated_at before update on public.documents for each row execute function private.set_updated_at();
create trigger segments_set_updated_at before update on public.segments for each row execute function private.set_updated_at();
create trigger jobs_set_updated_at before update on public.translation_jobs for each row execute function private.set_updated_at();
create trigger exports_set_updated_at before update on public.exports for each row execute function private.set_updated_at();
create trigger comments_set_updated_at before update on public.review_comments for each row execute function private.set_updated_at();
create trigger glossary_set_updated_at before update on public.glossary_terms for each row execute function private.set_updated_at();
create trigger reservations_set_updated_at before update on public.credit_reservations for each row execute function private.set_updated_at();

-- New users receive a personal workspace immediately and the one-time grant only after verification.
create or replace function private.provision_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users%rowtype;
  v_workspace_id uuid;
  v_balance bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('provision-user:' || p_user_id::text, 0));
  select * into v_user from auth.users where id = p_user_id;
  if not found then return; end if;

  insert into public.profiles (id, email, display_name)
  values (
    v_user.id,
    coalesce(v_user.email, v_user.id::text || '@pending.local'),
    coalesce(v_user.raw_user_meta_data ->> 'full_name', v_user.raw_user_meta_data ->> 'name', split_part(coalesce(v_user.email, 'User'), '@', 1))
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name);

  select id into v_workspace_id from public.workspaces where owner_id = v_user.id and kind = 'personal';
  if v_workspace_id is null then
    insert into public.workspaces (owner_id, name, kind)
    values (v_user.id, coalesce(split_part(v_user.email, '@', 1), 'My') || '''s workspace', 'personal')
    returning id into v_workspace_id;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, created_by)
  values (v_workspace_id, v_user.id, 'owner', v_user.id)
  on conflict (workspace_id, user_id) do nothing;
  insert into public.training_consents (workspace_id, global_learning, updated_by)
  values (v_workspace_id, false, v_user.id)
  on conflict (workspace_id) do nothing;
  insert into public.credit_accounts (workspace_id) values (v_workspace_id)
  on conflict (workspace_id) do nothing;

  if v_user.email_confirmed_at is not null and not exists (
    select 1 from public.credit_ledger where external_key = 'beta-grant:' || v_user.id::text
  ) then
    update public.credit_accounts
    set balance = balance + 5000, updated_at = now()
    where workspace_id = v_workspace_id
    returning balance into v_balance;
    insert into public.credit_ledger (workspace_id, entry_type, delta, balance_after, reason, actor_id, external_key)
    values (v_workspace_id, 'beta_grant', 5000, v_balance, 'One-time verified-account beta grant', v_user.id, 'beta-grant:' || v_user.id::text)
    on conflict (external_key) do nothing;
  end if;
end;
$$;

create or replace function private.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.provision_user(new.id);
  return new;
end;
$$;

create trigger on_auth_user_change
after insert or update of email, email_confirmed_at, raw_user_meta_data on auth.users
for each row execute function private.handle_auth_user_change();

select private.provision_user(id) from auth.users;

-- Transactional credit reservation. Members can reserve; only the server secret can settle it.
create or replace function public.reserve_credits(p_workspace_id uuid, p_job_id uuid, p_amount bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.credit_accounts%rowtype;
  v_reservation public.credit_reservations%rowtype;
begin
  if p_amount <= 0 then raise exception 'credit amount must be positive' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = (select auth.uid())
      and role = any(array['owner','admin','translator']::public.workspace_role[])
  ) then raise exception 'workspace permission denied' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.translation_jobs
    where id = p_job_id and workspace_id = p_workspace_id and created_by = (select auth.uid())
  ) then raise exception 'job not found' using errcode = 'P0002'; end if;

  select * into v_reservation from public.credit_reservations where job_id = p_job_id;
  if found then
    if v_reservation.amount <> p_amount then raise exception 'reservation amount mismatch' using errcode = '22023'; end if;
    return v_reservation.id;
  end if;

  select * into v_account from public.credit_accounts where workspace_id = p_workspace_id for update;
  if not found then raise exception 'credit account not found' using errcode = 'P0002'; end if;
  if v_account.balance - v_account.reserved < p_amount then raise exception 'insufficient credits' using errcode = 'P0001'; end if;

  insert into public.credit_reservations (workspace_id, job_id, amount)
  values (p_workspace_id, p_job_id, p_amount)
  returning * into v_reservation;
  update public.credit_accounts set reserved = reserved + p_amount, updated_at = now() where workspace_id = p_workspace_id;
  return v_reservation.id;
end;
$$;

create or replace function public.commit_credits(p_job_id uuid, p_successful_words bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.credit_reservations%rowtype;
  v_balance bigint;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then raise exception 'server role required' using errcode = '42501'; end if;
  select * into v_reservation from public.credit_reservations where job_id = p_job_id for update;
  if not found then raise exception 'reservation not found' using errcode = 'P0002'; end if;
  if v_reservation.status = 'committed' then
    select balance into v_balance from public.credit_accounts where workspace_id = v_reservation.workspace_id;
    return v_balance;
  end if;
  if v_reservation.status <> 'active' then raise exception 'reservation is not active' using errcode = 'P0001'; end if;
  if p_successful_words < 0 or p_successful_words > v_reservation.amount then raise exception 'invalid committed amount' using errcode = '22023'; end if;

  update public.credit_accounts
  set balance = balance - p_successful_words,
      reserved = reserved - v_reservation.amount,
      updated_at = now()
  where workspace_id = v_reservation.workspace_id
  returning balance into v_balance;
  update public.credit_reservations set status = 'committed', committed_amount = p_successful_words, updated_at = now() where id = v_reservation.id;
  if p_successful_words > 0 then
    insert into public.credit_ledger (workspace_id, entry_type, delta, balance_after, reason, job_id, external_key)
    values (v_reservation.workspace_id, 'translation_usage', -p_successful_words, v_balance, 'Successfully translated source words', p_job_id, 'usage:' || p_job_id::text);
  end if;
  return v_balance;
end;
$$;

create or replace function public.release_credits(p_job_id uuid, p_reason text default 'Job failed or cancelled')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.credit_reservations%rowtype;
  v_balance bigint;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then raise exception 'server role required' using errcode = '42501'; end if;
  select * into v_reservation from public.credit_reservations where job_id = p_job_id for update;
  if not found then return null; end if;
  if v_reservation.status <> 'active' then
    select balance into v_balance from public.credit_accounts where workspace_id = v_reservation.workspace_id;
    return v_balance;
  end if;
  update public.credit_accounts set reserved = reserved - v_reservation.amount, updated_at = now() where workspace_id = v_reservation.workspace_id returning balance into v_balance;
  update public.credit_reservations set status = 'released', updated_at = now() where id = v_reservation.id;
  insert into public.audit_logs (workspace_id, action, target_type, target_id, metadata)
  values (v_reservation.workspace_id, 'credits.released', 'translation_job', p_job_id::text, jsonb_build_object('amount', v_reservation.amount, 'reason', p_reason));
  return v_balance;
end;
$$;

create or replace function public.grant_admin_credits(p_workspace_id uuid, p_target_user_id uuid, p_amount bigint, p_reason text, p_actor_id uuid)
returns table(grant_id uuid, ledger_id bigint, balance_after bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
  v_ledger_id bigint;
  v_grant_id uuid;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then raise exception 'server role required' using errcode = '42501'; end if;
  if p_amount <= 0 or p_amount > 1000000 then raise exception 'invalid grant amount' using errcode = '22023'; end if;
  if char_length(trim(p_reason)) < 8 then raise exception 'grant reason is required' using errcode = '22023'; end if;
  update public.credit_accounts set balance = balance + p_amount, updated_at = now() where workspace_id = p_workspace_id returning balance into v_balance;
  if not found then raise exception 'credit account not found' using errcode = 'P0002'; end if;
  insert into public.credit_ledger (workspace_id, entry_type, delta, balance_after, reason, actor_id)
  values (p_workspace_id, 'admin_grant', p_amount, v_balance, trim(p_reason), p_actor_id) returning id into v_ledger_id;
  insert into public.admin_credit_grants (workspace_id, target_user_id, amount, reason, granted_by, ledger_id)
  values (p_workspace_id, p_target_user_id, p_amount, trim(p_reason), p_actor_id, v_ledger_id) returning id into v_grant_id;
  insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
  values (p_workspace_id, p_actor_id, 'credits.admin_grant', 'credit_account', p_workspace_id::text, jsonb_build_object('amount', p_amount, 'reason', trim(p_reason), 'ledger_id', v_ledger_id));
  return query select v_grant_id, v_ledger_id, v_balance;
end;
$$;

create or replace function public.consume_rate_limit(p_identity_hash text, p_action text, p_max_hits integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then raise exception 'server role required' using errcode = '42501'; end if;
  if p_max_hits < 1 or p_window_seconds < 1 then raise exception 'invalid rate limit' using errcode = '22023'; end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_events (identity_hash, action, window_start, hits)
  values (p_identity_hash, p_action, v_window, 1)
  on conflict (identity_hash, action, window_start)
  do update set hits = public.rate_limit_events.hits + 1, updated_at = now()
  returning hits into v_hits;
  return v_hits <= p_max_hits;
end;
$$;

revoke all on function public.reserve_credits(uuid, uuid, bigint) from public, anon;
grant execute on function public.reserve_credits(uuid, uuid, bigint) to authenticated;
revoke all on function public.commit_credits(uuid, bigint) from public, anon, authenticated;
revoke all on function public.release_credits(uuid, text) from public, anon, authenticated;
revoke all on function public.grant_admin_credits(uuid, uuid, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.commit_credits(uuid, bigint) to service_role;
grant execute on function public.release_credits(uuid, text) to service_role;
grant execute on function public.grant_admin_credits(uuid, uuid, bigint, text, uuid) to service_role;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;

-- RLS is enabled on every exposed table. Anonymous clients receive no table grants.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','workspaces','workspace_members','workspace_invites','projects','documents','document_versions','document_nodes','segments','segment_revisions','translation_jobs','job_events','exports','assignments','review_comments','approvals','audit_logs','glossary_terms','translation_memory','global_translation_memory','evaluation_segments','correction_events','training_consents','training_candidates','credit_accounts','credit_ledger','credit_reservations','admin_credit_grants','rate_limit_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

create policy profiles_select_shared on public.profiles for select to authenticated
using ((select auth.uid()) = id or (select private.shares_workspace(id)));
create policy profiles_update_self on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy workspaces_select_member on public.workspaces for select to authenticated using ((select private.has_workspace_role(id, null)));
create policy workspaces_insert_owner on public.workspaces for insert to authenticated with check ((select auth.uid()) = owner_id and kind = 'organization');
create policy workspaces_update_admin on public.workspaces for update to authenticated using ((select private.has_workspace_role(id, array['owner','admin']::public.workspace_role[]))) with check ((select private.has_workspace_role(id, array['owner','admin']::public.workspace_role[])));
create policy workspaces_delete_owner on public.workspaces for delete to authenticated using ((select private.has_workspace_role(id, array['owner']::public.workspace_role[])) and kind = 'organization');

create policy workspace_members_select_member on public.workspace_members for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy workspace_members_insert_admin on public.workspace_members for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));
create policy workspace_members_update_admin on public.workspace_members for update to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[]))) with check ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));
create policy workspace_members_delete_admin on public.workspace_members for delete to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])) and role <> 'owner');

create policy workspace_invites_select_admin on public.workspace_invites for select to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));
create policy workspace_invites_insert_admin on public.workspace_invites for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])) and invited_by = (select auth.uid()));
create policy workspace_invites_update_admin on public.workspace_invites for update to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[]))) with check ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));

-- Reusable tenant policies are created per table so Postgres can use workspace indexes.
create policy projects_select_member on public.projects for select to authenticated using ((select private.has_workspace_role(workspace_id, null)) and deleted_at is null);
create policy projects_insert_worker on public.projects for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])) and created_by = (select auth.uid()));
create policy projects_update_worker on public.projects for update to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin','translator','reviewer']::public.workspace_role[]))) with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator','reviewer']::public.workspace_role[])));
create policy projects_delete_admin on public.projects for delete to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])) or created_by = (select auth.uid()));

create policy documents_select_member on public.documents for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy documents_insert_worker on public.documents for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])) and uploaded_by = (select auth.uid()));
create policy documents_update_worker on public.documents for update to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[]))) with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])));
create policy documents_delete_worker on public.documents for delete to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])));

create policy document_versions_select_member on public.document_versions for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy document_versions_insert_worker on public.document_versions for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])) and created_by = (select auth.uid()));
create policy document_nodes_select_member on public.document_nodes for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy document_nodes_insert_worker on public.document_nodes for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])));
create policy document_nodes_update_worker on public.document_nodes for update to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[]))) with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])));

create policy segments_select_member on public.segments for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy segments_insert_worker on public.segments for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])) and created_by = (select auth.uid()));
create policy segments_update_team on public.segments for update to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin','translator','reviewer']::public.workspace_role[]))) with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator','reviewer']::public.workspace_role[])));
create policy segment_revisions_select_member on public.segment_revisions for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy segment_revisions_insert_editor on public.segment_revisions for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator','reviewer']::public.workspace_role[])) and editor_id = (select auth.uid()));

create policy translation_jobs_select_member on public.translation_jobs for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy translation_jobs_insert_worker on public.translation_jobs for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])) and created_by = (select auth.uid()));
create policy translation_jobs_update_worker on public.translation_jobs for update to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[]))) with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])));
create policy job_events_select_member on public.job_events for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));

create policy exports_select_member on public.exports for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy exports_insert_member on public.exports for insert to authenticated with check ((select private.has_workspace_role(workspace_id, null)) and requested_by = (select auth.uid()));
create policy exports_update_requester on public.exports for update to authenticated using (requested_by = (select auth.uid())) with check (requested_by = (select auth.uid()));

create policy assignments_select_member on public.assignments for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy assignments_insert_admin on public.assignments for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));
create policy assignments_update_admin on public.assignments for update to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[]))) with check ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));
create policy assignments_delete_admin on public.assignments for delete to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));
create policy review_comments_select_member on public.review_comments for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy review_comments_insert_member on public.review_comments for insert to authenticated with check ((select private.has_workspace_role(workspace_id, null)) and author_id = (select auth.uid()));
create policy review_comments_update_author on public.review_comments for update to authenticated using (author_id = (select auth.uid()) or (select private.has_workspace_role(workspace_id, array['owner','admin','reviewer']::public.workspace_role[]))) with check ((select private.has_workspace_role(workspace_id, null)));
create policy approvals_select_member on public.approvals for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy approvals_insert_reviewer on public.approvals for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin','reviewer','translator']::public.workspace_role[])) and reviewer_id = (select auth.uid()));
create policy audit_logs_select_admin on public.audit_logs for select to authenticated using (workspace_id is not null and (select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));

create policy glossary_select_member on public.glossary_terms for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy glossary_insert_worker on public.glossary_terms for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])) and created_by = (select auth.uid()));
create policy glossary_update_worker on public.glossary_terms for update to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[]))) with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])));
create policy glossary_delete_worker on public.glossary_terms for delete to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])));
create policy memory_select_member on public.translation_memory for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy corrections_select_member on public.correction_events for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy corrections_insert_editor on public.correction_events for insert to authenticated with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator','reviewer']::public.workspace_role[])) and editor_id = (select auth.uid()));
create policy consents_select_member on public.training_consents for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy consents_update_admin on public.training_consents for update to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[]))) with check ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])) and updated_by = (select auth.uid()));
create policy candidates_select_admin on public.training_candidates for select to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));

create policy credit_accounts_select_member on public.credit_accounts for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy credit_ledger_select_member on public.credit_ledger for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy credit_reservations_select_member on public.credit_reservations for select to authenticated using ((select private.has_workspace_role(workspace_id, null)));
create policy admin_grants_select_member on public.admin_credit_grants for select to authenticated using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])) or (select private.is_platform_admin()));

revoke all on all tables in schema public from anon, authenticated;
grant select, update (display_name, locale) on public.profiles to authenticated;
grant select, insert, update, delete on public.workspaces, public.workspace_members to authenticated;
grant select, insert, update on public.workspace_invites to authenticated;
grant select, insert, update, delete on public.projects, public.documents to authenticated;
grant select, insert on public.document_versions to authenticated;
grant select, insert, update on public.document_nodes, public.segments to authenticated;
grant select, insert on public.segment_revisions to authenticated;
grant select, insert, update on public.translation_jobs to authenticated;
grant select on public.job_events to authenticated;
grant select, insert, update on public.exports to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;
grant select, insert, update on public.review_comments to authenticated;
grant select, insert on public.approvals to authenticated;
grant select on public.audit_logs to authenticated;
grant select, insert, update, delete on public.glossary_terms to authenticated;
grant select on public.translation_memory to authenticated;
grant select, insert on public.correction_events to authenticated;
grant select, update on public.training_consents to authenticated;
grant select on public.training_candidates, public.credit_accounts, public.credit_ledger, public.credit_reservations, public.admin_credit_grants to authenticated;
grant usage, select on sequence public.segment_revisions_id_seq, public.job_events_id_seq, public.audit_logs_id_seq to authenticated;

-- The server secret bypasses RLS but still requires ordinary Postgres privileges.
-- This role powers workflows, settlement, admin controls, exports, and corpus import.
grant usage on schema public, private to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public, private to service_role;

-- Private object storage. Paths are always <workspace-id>/<project-id>/<object>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/jpeg','image/png']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.storage_workspace_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare v_part text;
begin
  v_part := split_part(p_name, '/', 1);
  if v_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return v_part::uuid; end if;
  return null;
end;
$$;

grant execute on function private.storage_workspace_id(text) to authenticated;
create policy documents_storage_select on storage.objects for select to authenticated using (bucket_id = 'documents' and (select private.has_workspace_role(private.storage_workspace_id(name), null)));
create policy documents_storage_insert on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (select private.has_workspace_role(private.storage_workspace_id(name), array['owner','admin','translator']::public.workspace_role[])));
create policy documents_storage_update on storage.objects for update to authenticated using (bucket_id = 'documents' and (select private.has_workspace_role(private.storage_workspace_id(name), array['owner','admin','translator']::public.workspace_role[]))) with check (bucket_id = 'documents' and (select private.has_workspace_role(private.storage_workspace_id(name), array['owner','admin','translator']::public.workspace_role[])));
create policy documents_storage_delete on storage.objects for delete to authenticated using (bucket_id = 'documents' and (select private.has_workspace_role(private.storage_workspace_id(name), array['owner','admin']::public.workspace_role[])));
