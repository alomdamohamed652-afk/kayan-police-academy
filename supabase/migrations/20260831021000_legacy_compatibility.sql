alter table public.application_batches add column if not exists legacy_id text;
alter table public.application_questions add column if not exists legacy_id text;
alter table public.applications add column if not exists legacy_id text;
alter table public.question_bank add column if not exists legacy_id text;
alter table public.exams add column if not exists legacy_id text;
alter table public.exam_questions add column if not exists legacy_id text;
alter table public.exam_attempts add column if not exists legacy_id text;
alter table public.exam_results add column if not exists legacy_id text;
alter table public.evaluations add column if not exists legacy_id text;
alter table public.hierarchy add column if not exists legacy_id text;
create unique index if not exists application_batches_legacy_id_uq on public.application_batches(legacy_id) where legacy_id is not null;
create unique index if not exists application_questions_legacy_id_uq on public.application_questions(legacy_id) where legacy_id is not null;
create unique index if not exists applications_legacy_id_uq on public.applications(legacy_id) where legacy_id is not null;
create unique index if not exists question_bank_legacy_id_uq on public.question_bank(legacy_id) where legacy_id is not null;
create unique index if not exists exams_legacy_id_uq on public.exams(legacy_id) where legacy_id is not null;
create unique index if not exists exam_questions_legacy_id_uq on public.exam_questions(legacy_id) where legacy_id is not null;
create unique index if not exists exam_attempts_legacy_id_uq on public.exam_attempts(legacy_id) where legacy_id is not null;
create unique index if not exists exam_results_legacy_id_uq on public.exam_results(legacy_id) where legacy_id is not null;
create unique index if not exists evaluations_legacy_id_uq on public.evaluations(legacy_id) where legacy_id is not null;
create unique index if not exists hierarchy_legacy_id_uq on public.hierarchy(legacy_id) where legacy_id is not null;
create table if not exists public.application_drafts (
  discord_id text primary key,
  draft jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.role_overrides (
  discord_id text primary key,
  role text not null,
  updated_at timestamptz not null default now()
);
alter table public.application_drafts enable row level security;
alter table public.role_overrides enable row level security;
create index if not exists application_drafts_updated_idx on public.application_drafts(updated_at desc);