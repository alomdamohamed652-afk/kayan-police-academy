create extension if not exists pgcrypto;

create table if not exists public.academy_settings (
  id smallint primary key default 1 check (id = 1),
  academy_name text not null default 'أكاديمية شرطة كيان',
  applications_title text not null default 'التقديم الأولي للشرطة',
  applications_description text not null default 'نموذج التقديم الرسمي للانضمام إلى شرطة كيان.',
  passing_score integer not null default 60 check (passing_score between 0 and 100),
  logo_url text,
  accepted_message text,
  rejected_message text,
  accepted_discord_url text,
  evaluation_trainer_ranks text[] not null default '{}',
  evaluation_trainee_ranks text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.application_batches (
  id uuid primary key default gen_random_uuid(), name text not null, description text,
  status text not null default 'open' check (status in ('open','closed','draft')),
  start_at timestamptz, end_at timestamptz, closed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create table if not exists public.application_questions (
  id uuid primary key default gen_random_uuid(), batch_id uuid references public.application_batches(id) on delete cascade,
  question_bank_id uuid, text text not null, type text not null check (type in ('text','choice','yesno')),
  options jsonb not null default '[]'::jsonb, correct text, required boolean not null default true,
  points numeric(8,2) not null default 1, position integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.application_batches(id) on delete restrict,
  discord_id text not null, discord_username text, applicant_name text, submitted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','waitlist')),
  review_note text, reviewed_at timestamptz, reviewed_by text, answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists applications_batch_discord_unique on public.applications(batch_id, discord_id);
create index if not exists applications_discord_idx on public.applications(discord_id);
create index if not exists applications_status_idx on public.applications(status);

create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(), text text not null,
  type text not null check (type in ('text','choice','yesno')), options jsonb not null default '[]'::jsonb,
  correct text, required boolean not null default true, points numeric(8,2) not null default 1,
  tags text[] not null default '{}', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(), title text not null, description text, stage text,
  status text not null default 'open' check (status in ('draft','open','closed')),
  start_at timestamptz, end_at timestamptz, duration_minutes integer not null default 30 check (duration_minutes > 0),
  passing_score integer not null default 60 check (passing_score between 0 and 100),
  attempts_allowed integer not null default 1 check (attempts_allowed > 0),
  access_type text not null default 'all' check (access_type in ('all','specific','invite')),
  access_users text[] not null default '{}', invite_token_hash text, publish_results boolean not null default false,
  show_answers boolean not null default false, resume_enabled boolean not null default true, resume_minutes integer,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists exams_dates_idx on public.exams(start_at, end_at);
create index if not exists exams_status_idx on public.exams(status);

create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(), exam_id uuid not null references public.exams(id) on delete cascade,
  question_bank_id uuid references public.question_bank(id) on delete set null, text text not null,
  type text not null check (type in ('text','choice','yesno')), options jsonb not null default '[]'::jsonb,
  correct text, required boolean not null default true, points numeric(8,2) not null default 1, position integer not null default 0
);
create unique index if not exists exam_questions_position_unique on public.exam_questions(exam_id, position);
create index if not exists exam_questions_exam_idx on public.exam_questions(exam_id);

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(), exam_id uuid not null references public.exams(id) on delete cascade,
  discord_id text not null, started_at timestamptz not null default now(), expires_at timestamptz not null,
  submitted_at timestamptz, resume_at timestamptz, resume_until timestamptz, resume_duration_minutes integer,
  answers jsonb not null default '{}'::jsonb, question_order uuid[] not null default '{}',
  status text not null default 'in_progress' check (status in ('in_progress','submitted','expired','cancelled')),
  auto_submitted boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists exam_attempts_user_idx on public.exam_attempts(discord_id);
create index if not exists exam_attempts_exam_idx on public.exam_attempts(exam_id);
create unique index if not exists one_active_exam_attempt_per_user on public.exam_attempts(exam_id, discord_id) where status = 'in_progress';

create table if not exists public.exam_results (
  id uuid primary key default gen_random_uuid(), attempt_id uuid not null unique references public.exam_attempts(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade, discord_id text not null,
  score numeric(8,2) not null default 0, passed boolean not null default false, duration_seconds integer,
  submitted_at timestamptz not null default now(), published_at timestamptz, review jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists exam_results_user_idx on public.exam_results(discord_id);
create index if not exists exam_results_exam_idx on public.exam_results(exam_id);

create table if not exists public.admins (
  discord_id text primary key, name text, permissions text[] not null default '{}', enabled boolean not null default true,
  source text not null default 'manual', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create table if not exists public.hierarchy (
  id uuid primary key default gen_random_uuid(), level integer not null default 1, position integer not null default 1,
  title text not null, discord_id text, name_snapshot text, image_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists hierarchy_level_position_unique on public.hierarchy(level, position);
create table if not exists public.member_settings (discord_id text primary key, show_profile_button boolean not null default true, updated_at timestamptz not null default now());
create table if not exists public.member_images (discord_id text primary key, image_url text, updated_at timestamptz not null default now());

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(), evaluator_discord_id text not null,
  evaluator_role text not null check (evaluator_role in ('trainer','trainee')), target_discord_id text not null,
  target_name_snapshot text, target_rank_snapshot text, hours numeric(8,2), ratings jsonb not null default '{}'::jsonb,
  overall_rating numeric(4,2), same_trainer boolean, notes text, complaint text, created_at timestamptz not null default now(),
  reviewed_at timestamptz, reviewed_by text, review_note text,
  status text not null default 'pending' check (status in ('pending','reviewed','archived')),
  check (evaluator_discord_id <> target_discord_id)
);
create index if not exists evaluations_target_idx on public.evaluations(target_discord_id);
create index if not exists evaluations_evaluator_idx on public.evaluations(evaluator_discord_id);

create table if not exists public.audit_logs (
  id bigint generated by default as identity primary key, actor_discord_id text, actor_name text, action text not null,
  entity_type text, entity_id text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_discord_id);
create table if not exists public.login_logs (
  id bigint generated by default as identity primary key, discord_id text, username text, success boolean not null default true,
  reason text, ip_hash text, user_agent text, created_at timestamptz not null default now()
);
create index if not exists login_logs_created_idx on public.login_logs(created_at desc);
create index if not exists login_logs_discord_idx on public.login_logs(discord_id);

insert into public.academy_settings(id) values (1) on conflict (id) do nothing;

alter table public.academy_settings enable row level security;
alter table public.application_batches enable row level security;
alter table public.application_questions enable row level security;
alter table public.applications enable row level security;
alter table public.question_bank enable row level security;
alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_results enable row level security;
alter table public.admins enable row level security;
alter table public.hierarchy enable row level security;
alter table public.member_settings enable row level security;
alter table public.member_images enable row level security;
alter table public.evaluations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.login_logs enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists academy_settings_updated_at on public.academy_settings;
create trigger academy_settings_updated_at before update on public.academy_settings for each row execute function public.set_updated_at();
drop trigger if exists batches_updated_at on public.application_batches;
create trigger batches_updated_at before update on public.application_batches for each row execute function public.set_updated_at();
drop trigger if exists applications_updated_at on public.applications;
create trigger applications_updated_at before update on public.applications for each row execute function public.set_updated_at();
drop trigger if exists question_bank_updated_at on public.question_bank;
create trigger question_bank_updated_at before update on public.question_bank for each row execute function public.set_updated_at();
drop trigger if exists exams_updated_at on public.exams;
create trigger exams_updated_at before update on public.exams for each row execute function public.set_updated_at();
drop trigger if exists attempts_updated_at on public.exam_attempts;
create trigger attempts_updated_at before update on public.exam_attempts for each row execute function public.set_updated_at();
drop trigger if exists admins_updated_at on public.admins;
create trigger admins_updated_at before update on public.admins for each row execute function public.set_updated_at();
drop trigger if exists hierarchy_updated_at on public.hierarchy;
create trigger hierarchy_updated_at before update on public.hierarchy for each row execute function public.set_updated_at();
drop trigger if exists evaluations_updated_at on public.evaluations;
create trigger evaluations_updated_at before update on public.evaluations for each row execute function public.set_updated_at();