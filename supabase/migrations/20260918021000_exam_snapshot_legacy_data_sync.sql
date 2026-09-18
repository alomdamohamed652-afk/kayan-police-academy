-- Keep the legacy mirror in sync with the durable exam-answer snapshot.
-- This prevents a restart/reload from rehydrating stale answers from legacy_data.

create or replace function public.save_exam_attempt_answers(
  p_legacy_id text,
  p_answers jsonb,
  p_answers_updated_at timestamptz,
  p_status text,
  p_client_revision bigint default 0
)
returns table(
  id uuid,
  legacy_id text,
  answers jsonb,
  answers_updated_at timestamptz,
  answers_revision bigint,
  status text,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_attempt public.exam_attempts%rowtype;
  v_revision bigint;
  v_updated timestamptz;
  v_status text;
  v_key text;
  v_value jsonb;
  v_question_id uuid;
begin
  select * into v_attempt from public.exam_attempts
  where legacy_id=p_legacy_id for update;

  if not found then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND' using errcode='P0002';
  end if;

  if v_attempt.status='submitted' or v_attempt.submitted_at is not null then
    return query select v_attempt.id,v_attempt.legacy_id,v_attempt.answers,
      v_attempt.answers_updated_at,v_attempt.answers_revision,
      v_attempt.status,v_attempt.submitted_at;
    return;
  end if;

  if coalesce(p_client_revision,0)>0
     and coalesce(p_client_revision,0)<=coalesce(v_attempt.answers_revision,0) then
    return query select v_attempt.id,v_attempt.legacy_id,v_attempt.answers,
      v_attempt.answers_updated_at,v_attempt.answers_revision,
      v_attempt.status,v_attempt.submitted_at;
    return;
  end if;

  if p_answers_updated_at is not null
     and v_attempt.answers_updated_at is not null
     and p_answers_updated_at < v_attempt.answers_updated_at then
    return query select v_attempt.id,v_attempt.legacy_id,v_attempt.answers,
      v_attempt.answers_updated_at,v_attempt.answers_revision,
      v_attempt.status,v_attempt.submitted_at;
    return;
  end if;

  v_revision := greatest(
    coalesce(v_attempt.answers_revision,0)+1,
    coalesce(p_client_revision,0)
  );
  v_updated := greatest(
    coalesce(p_answers_updated_at,now()),
    coalesce(v_attempt.answers_updated_at,now())
  );
  v_status := case
    when p_status in ('submitted','expired','cancelled','in_progress')
      then p_status
    else 'in_progress'
  end;

  update public.exam_attempts
  set answers=coalesce(p_answers,'{}'::jsonb),
      answers_updated_at=v_updated,
      answers_revision=v_revision,
      status=case when v_status='submitted' then 'submitted' else status end,
      legacy_data=jsonb_set(
        coalesce(legacy_data,'{}'::jsonb),
        '{"answers"}',
        coalesce(p_answers,'{}'::jsonb),
        true
      ),
      updated_at=now()
  where id=v_attempt.id
  returning * into v_attempt;

  for v_key,v_value in
    select key,value from jsonb_each(coalesce(p_answers,'{}'::jsonb))
  loop
    select q.id into v_question_id
    from public.exam_questions q
    where q.exam_id=v_attempt.exam_id and q.legacy_id=v_key
    limit 1;

    if v_question_id is not null then
      insert into public.attempt_answers(
        attempt_id,question_id,answer,revision,client_updated_at,updated_at
      )
      values(
        v_attempt.id,v_question_id,v_value,v_revision,p_answers_updated_at,now()
      )
      on conflict (attempt_id,question_id) do update
      set answer=excluded.answer,
          revision=excluded.revision,
          client_updated_at=excluded.client_updated_at,
          updated_at=excluded.updated_at
      where public.attempt_answers.revision<=excluded.revision;
    end if;
  end loop;

  insert into public.exam_events(
    attempt_id,exam_id,discord_id,event_type,metadata
  )
  values(
    v_attempt.id,v_attempt.exam_id,v_attempt.discord_id,
    'ANSWER_SNAPSHOT_SAVED',
    jsonb_build_object(
      'revision',v_revision,
      'answer_count',
      jsonb_object_length(coalesce(p_answers,'{}'::jsonb))
    )
  );

  return query select v_attempt.id,v_attempt.legacy_id,v_attempt.answers,
    v_attempt.answers_updated_at,v_attempt.answers_revision,
    v_attempt.status,v_attempt.submitted_at;
end;
$function$;

revoke all on function public.save_exam_attempt_answers(
  text,jsonb,timestamptz,text,bigint
) from public, anon, authenticated;
grant execute on function public.save_exam_attempt_answers(
  text,jsonb,timestamptz,text,bigint
) to service_role;

update public.exam_attempts
set legacy_data=jsonb_set(
  coalesce(legacy_data,'{}'::jsonb),
  '{"answers"}',
  coalesce(answers,'{}'::jsonb),
  true
)
where coalesce(legacy_data->'answers','null'::jsonb)
      is distinct from coalesce(answers,'{}'::jsonb);

create or replace function public.clear_exam_answer_data(p_exam_legacy_id text)
returns table(
  removed_attempt_answers bigint,
  cleared_attempts bigint,
  cleared_results bigint
)
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_exam_id uuid;
  v_attempt_ids uuid[];
  v_removed bigint:=0;
  v_attempts bigint:=0;
  v_results bigint:=0;
begin
  select id into v_exam_id from public.exams
  where legacy_id=trim(p_exam_legacy_id);

  if v_exam_id is null then
    raise exception 'EXAM_NOT_FOUND' using errcode='P0002';
  end if;

  select coalesce(array_agg(id),'{}'::uuid[])
  into v_attempt_ids
  from public.exam_attempts
  where exam_id=v_exam_id;

  if coalesce(array_length(v_attempt_ids,1),0)>0 then
    delete from public.attempt_answers
    where attempt_id=any(v_attempt_ids);
    get diagnostics v_removed=row_count;
  end if;

  update public.exam_attempts
  set answers='{}'::jsonb,
      legacy_data=jsonb_set(
        coalesce(legacy_data,'{}'::jsonb),
        '{"answers"}','{}'::jsonb,true
      ),
      answers_updated_at=now(),
      answers_revision=coalesce(answers_revision,0)+1,
      updated_at=now()
  where exam_id=v_exam_id;
  get diagnostics v_attempts=row_count;

  update public.exam_results
  set review='[]'::jsonb,
      legacy_data=jsonb_set(
        jsonb_set(
          coalesce(legacy_data,'{}'::jsonb),
          '{"answers"}','{}'::jsonb,true
        ),
        '{"review"}','[]'::jsonb,true
      )
  where exam_id=v_exam_id;
  get diagnostics v_results=row_count;

  return query select v_removed,v_attempts,v_results;
end;
$function$;

revoke all on function public.clear_exam_answer_data(text)
from public, anon, authenticated;
grant execute on function public.clear_exam_answer_data(text) to service_role;