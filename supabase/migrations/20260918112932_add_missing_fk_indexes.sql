create index if not exists application_questions_batch_id_idx
  on public.application_questions (batch_id);

create index if not exists attempt_answers_question_id_idx
  on public.attempt_answers (question_id);

create index if not exists exam_events_exam_id_idx
  on public.exam_events (exam_id);

create index if not exists exam_questions_question_bank_id_idx
  on public.exam_questions (question_bank_id);
