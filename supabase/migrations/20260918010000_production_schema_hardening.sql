begin;

alter table public.exams
  add column if not exists active boolean not null default true;

update public.exams
set active = case
  when jsonb_typeof(legacy_data->'active') = 'boolean'
    then (legacy_data->>'active')::boolean
  else status <> 'closed'
end;

create index if not exists exams_active_idx on public.exams(active);

create or replace function public.clear_application_batch_data(p_batch_legacy_id text)
returns table(cleared_applications bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_apps bigint := 0;
begin
  select id into v_batch_id
  from public.application_batches
  where legacy_id = p_batch_legacy_id
  for update;

  if not found then
    raise exception 'BATCH_NOT_FOUND' using errcode='P0002';
  end if;

  update public.applications
  set answers = '{}'::jsonb,
      legacy_data = jsonb_set(coalesce(legacy_data,'{}'::jsonb),'{answers}','{}'::jsonb,true)
  where batch_id = v_batch_id;

  get diagnostics v_apps = row_count;
  return query select v_apps;
end;
$$;

create or replace function public.clear_exam_answer_data(p_exam_legacy_id text)
returns table(removed_attempt_answers bigint, cleared_attempts bigint, cleared_results bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam_id uuid;
  v_removed bigint := 0;
  v_attempts bigint := 0;
  v_results bigint := 0;
begin
  select id into v_exam_id
  from public.exams
  where legacy_id = p_exam_legacy_id
  for update;

  if not found then
    raise exception 'EXAM_NOT_FOUND' using errcode='P0002';
  end if;

  delete from public.attempt_answers
  where attempt_id in (select id from public.exam_attempts where exam_id = v_exam_id);
  get diagnostics v_removed = row_count;

  update public.exam_attempts
  set answers = '{}'::jsonb,
      answers_updated_at = now(),
      answers_revision = coalesce(answers_revision,0)+1,
      legacy_data = jsonb_set(coalesce(legacy_data,'{}'::jsonb),'{answers}','{}'::jsonb,true),
      updated_at = now()
  where exam_id = v_exam_id;
  get diagnostics v_attempts = row_count;

  update public.exam_results
  set review = '[]'::jsonb,
      legacy_data = jsonb_set(
        jsonb_set(coalesce(legacy_data,'{}'::jsonb),'{answers}','{}'::jsonb,true),
        '{review}','[]'::jsonb,true
      )
  where exam_id = v_exam_id;
  get diagnostics v_results = row_count;

  return query select v_removed, v_attempts, v_results;
end;
$$;

revoke execute on function public.clear_application_batch_data(text) from public, anon, authenticated;
revoke execute on function public.clear_exam_answer_data(text) from public, anon, authenticated;
revoke execute on function public.save_exam_attempt_answer(uuid,text,uuid,jsonb,bigint,timestamptz) from public, anon, authenticated;
revoke execute on function public.submit_exam_attempt(uuid,text,boolean) from public, anon, authenticated;

grant execute on function public.clear_application_batch_data(text) to service_role;
grant execute on function public.clear_exam_answer_data(text) to service_role;
grant execute on function public.save_exam_attempt_answer(uuid,text,uuid,jsonb,bigint,timestamptz) to service_role;
grant execute on function public.submit_exam_attempt(uuid,text,boolean) to service_role;

commit;
