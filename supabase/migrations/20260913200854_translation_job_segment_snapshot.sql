alter table public.translation_jobs
  add column segment_ids uuid[] not null default '{}';

create unique index translation_jobs_one_active_project_idx
  on public.translation_jobs (project_id)
  where stage in (
    'queued', 'validating', 'extracting', 'ocr_review',
    'reserving_credits', 'retrieving_context', 'translating',
    'quality_check', 'reconstructing'
  );

comment on column public.translation_jobs.segment_ids is
  'Immutable segment snapshot for deterministic retries and exact credit accounting.';
