-- Exam resilience: make live-answer autosaves monotonic and cheap under concurrency.
-- A newer client snapshot can never be overwritten by an older retry.
ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS answers_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS answers_revision bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_exam_attempts_discord_exam
  ON public.exam_attempts(discord_id, exam_id);

CREATE OR REPLACE FUNCTION public.save_exam_attempt_answers(
  p_legacy_id text,
  p_answers jsonb,
  p_answers_updated_at timestamptz,
  p_status text DEFAULT NULL
)
RETURNS TABLE(legacy_id text, answers jsonb, answers_updated_at timestamptz, answers_revision bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.exam_attempts a
     SET answers = COALESCE(p_answers, a.answers),
         answers_updated_at = CASE
           WHEN a.answers_updated_at IS NULL OR p_answers_updated_at >= a.answers_updated_at
             THEN p_answers_updated_at
           ELSE a.answers_updated_at
         END,
         answers_revision = CASE
           WHEN a.answers_updated_at IS NULL OR p_answers_updated_at >= a.answers_updated_at
             THEN a.answers_revision + 1
           ELSE a.answers_revision
         END,
         status = CASE
           WHEN p_status IS NULL THEN a.status
           WHEN a.status = 'submitted' THEN a.status
           ELSE p_status
         END
   WHERE a.legacy_id = p_legacy_id
   RETURNING a.legacy_id, a.answers, a.answers_updated_at, a.answers_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.save_exam_attempt_answers(text,jsonb,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_exam_attempt_answers(text,jsonb,timestamptz,text) TO service_role;
