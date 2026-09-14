-- Private reusable image assets. Existing documents Storage policies scope paths
-- by their first workspace UUID; this table uses the same membership boundary.
create table public.workspace_branding (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('letterhead', 'stamp')),
  storage_path text not null,
  sha256 text not null,
  width integer not null check (width > 0 and width <= 20000),
  height integer not null check (height > 0 and height <= 20000),
  placement jsonb not null,
  created_at timestamptz not null default now(),
  unique(workspace_id, kind, sha256),
  check (split_part(storage_path, '/', 1) = workspace_id::text)
);
create index workspace_branding_workspace_idx on public.workspace_branding(workspace_id);
alter table public.workspace_branding enable row level security;
grant select, insert, update, delete on public.workspace_branding to authenticated;
grant all on public.workspace_branding to service_role;
create policy branding_read on public.workspace_branding for select to authenticated
using ((select private.has_workspace_role(workspace_id, null)));
create policy branding_insert on public.workspace_branding for insert to authenticated
with check (created_by = (select auth.uid()) and (select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])));
create policy branding_update on public.workspace_branding for update to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])))
with check ((select private.has_workspace_role(workspace_id, array['owner','admin','translator']::public.workspace_role[])));
create policy branding_delete on public.workspace_branding for delete to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));
alter table public.document_versions add column branding jsonb not null default '[]'::jsonb;
alter table public.exports add column layout_warnings jsonb not null default '[]'::jsonb;
alter table public.exports add column version_id uuid references public.document_versions(id) on delete set null;
