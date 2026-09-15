-- Release credit reservations that can no longer be committed or released by
-- their own workflow run: expired reservations on terminal jobs, and
-- reservations of jobs whose run stalled in an active stage.

create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active constant public.job_stage[] := array[
    'queued','validating','extracting','ocr_review','reserving_credits',
    'retrieving_context','translating','quality_check','reconstructing'
  ]::public.job_stage[];
  v_released integer := 0;
  v_job record;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'server role required' using errcode = '42501';
  end if;

  -- Expired reservations whose job already reached a terminal stage. Jobs
  -- still running keep their reservation even past expiry, because
  -- commit_credits would otherwise double-decrement the reserved counter.
  for v_job in
    select r.job_id
    from public.credit_reservations r
    join public.translation_jobs j on j.id = r.job_id
    where r.status = 'active'
      and r.expires_at < now()
      and j.stage in ('completed','failed','cancelled')
  loop
    perform public.release_credits(v_job.job_id, 'Reservation expired');
    v_released := v_released + 1;
  end loop;

  -- Runs stuck in an active stage for over two hours are dead; fail them and
  -- return their credits. The stage guard in the update prevents racing a run
  -- that advances between the select and the update.
  for v_job in
    select r.job_id
    from public.credit_reservations r
    join public.translation_jobs j on j.id = r.job_id
    where r.status = 'active'
      and j.stage = any(v_active)
      and j.updated_at < now() - interval '2 hours'
  loop
    perform public.release_credits(v_job.job_id, 'Job stalled — reservation released');
    update public.translation_jobs
    set stage = 'failed', error_code = 'stalled',
        error_message = 'The translation run stopped responding and was closed automatically.',
        completed_at = now()
    where id = v_job.job_id and stage = any(v_active);
    v_released := v_released + 1;
  end loop;

  return v_released;
end;
$$;

revoke all on function public.release_expired_reservations() from public, anon, authenticated;
grant execute on function public.release_expired_reservations() to service_role;
