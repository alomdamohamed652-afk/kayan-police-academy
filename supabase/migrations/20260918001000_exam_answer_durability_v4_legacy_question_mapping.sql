-- Normalize legacy q-* answer keys to canonical exam_questions UUIDs.
insert into public.attempt_answers (attempt_id, question_id, answer, revision, client_updated_at, updated_at, created_at)
select a.id, q.id, e.value,
       greatest(coalesce(a.answers_revision,0),1),
       a.answers_updated_at,
       coalesce(a.answers_updated_at,a.updated_at,now()),
       coalesce(a.created_at,now())
from public.exam_attempts a
cross join lateral jsonb_each(coalesce(a.answers,'{}'::jsonb)) e
join public.exam_questions q on q.legacy_id=e.key
on conflict(attempt_id,question_id) do update
set answer=excluded.answer,
    revision=greatest(public.attempt_answers.revision,excluded.revision),
    client_updated_at=coalesce(excluded.client_updated_at,public.attempt_answers.client_updated_at),
    updated_at=excluded.updated_at;

create or replace function public.save_exam_attempt_answers(
  p_legacy_id text,
  p_answers jsonb,
  p_answers_updated_at timestamptz,
  p_status text default 'in_progress'
)
returns table(id uuid, legacy_id text, exam_id uuid, discord_id text, started_at timestamptz, expires_at timestamptz, submitted_at timestamptz, resume_at timestamptz, resume_until timestamptz, resume_duration_minutes integer, answers jsonb, question_order uuid[], status text, auto_submitted boolean, created_at timestamptz, updated_at timestamptz, answers_updated_at timestamptz, answers_revision bigint)
language plpgsql security definer set search_path=public
as $$
declare
  v_id uuid;
  v_current_updated timestamptz;
  v_current_status text;
  v_revision bigint;
  v_incoming timestamptz := coalesce(p_answers_updated_at,now());
  v_new_status text := coalesce(p_status,'in_progress');
  v_next_revision bigint;
begin
  select a.id,a.answers_updated_at,a.status,a.answers_revision into v_id,v_current_updated,v_current_status,v_revision
  from public.exam_attempts a where a.legacy_id=p_legacy_id for update;
  if not found then raise exception 'EXAM_ATTEMPT_NOT_FOUND' using errcode='P0002'; end if;

  if v_current_status='submitted' then
    return query select a.id,a.legacy_id,a.exam_id,a.discord_id,a.started_at,a.expires_at,a.submitted_at,a.resume_at,a.resume_until,a.resume_duration_minutes,a.answers,a.question_order,a.status,a.auto_submitted,a.created_at,a.updated_at,a.answers_updated_at,a.answers_revision from public.exam_attempts a where a.id=v_id;
    return;
  end if;

  if v_current_updated is null or v_incoming>=v_current_updated then
    v_next_revision:=greatest(coalesce(v_revision,0)+1,1);
    update public.exam_attempts a set
      answers=coalesce(p_answers,a.answers),
      answers_updated_at=v_incoming,
      answers_revision=v_next_revision,
      status=case when v_new_status='submitted' then 'submitted' else coalesce(a.status,'in_progress') end,
      submitted_at=case when v_new_status='submitted' and a.submitted_at is null then now() else a.submitted_at end,
      updated_at=now()
    where a.id=v_id;

    if jsonb_typeof(coalesce(p_answers,'{}'::jsonb))='object' then
      insert into public.attempt_answers(attempt_id,question_id,answer,revision,client_updated_at,updated_at,created_at)
      select v_id,q.id,e.value,v_next_revision,v_incoming,now(),now()
      from jsonb_each(coalesce(p_answers,'{}'::jsonb)) e
      join public.exam_questions q on q.legacy_id=e.key
      on conflict(attempt_id,question_id) do update set
        answer=excluded.answer,
        revision=greatest(public.attempt_answers.revision,excluded.revision),
        client_updated_at=excluded.client_updated_at,
        updated_at=now();
    end if;

    insert into public.exam_events(attempt_id,exam_id,discord_id,event_type,metadata)
    select v_id,a.exam_id,a.discord_id,
      case when v_new_status='submitted' then 'EXAM_SUBMIT_SUCCESS' else 'ANSWER_SAVED' end,
      jsonb_build_object('source','snapshot_sync','revision',v_next_revision)
    from public.exam_attempts a where a.id=v_id;
  end if;

  return query select a.id,a.legacy_id,a.exam_id,a.discord_id,a.started_at,a.expires_at,a.submitted_at,a.resume_at,a.resume_until,a.resume_duration_minutes,a.answers,a.question_order,a.status,a.auto_submitted,a.created_at,a.updated_at,a.answers_updated_at,a.answers_revision from public.exam_attempts a where a.id=v_id;
end;
$$;
revoke all on function public.save_exam_attempt_answers(text,jsonb,timestamptz,text) from public,anon,authenticated;
grant execute on function public.save_exam_attempt_answers(text,jsonb,timestamptz,text) to service_role;
