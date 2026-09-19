# Dispatch Baseline — 2026-09-19

## Code rollback point

- Repository: kayan-police-academy
- Baseline commit: 6eab0365b6a24b8b5049620068495c6351d41540
- Baseline branch: baseline/pre-dispatch-20260919
- Dispatch implementation branch: feature/dispatch-module
- Production branch: main
- Render auto-deploy: disabled

If Dispatch is removed, restore code to the baseline commit/branch. Database rollback is manual and isolated to supabase/rollback/dispatch_module_down.sql.

## Frontend baseline

React 19 + Vite with internal pathname routing; React Router is not used.

Routes before Dispatch:
- /
- /academy/hierarchy
- /academy/members
- /academy/applications
- /academy/exams
- /admin
- /settings

Admin tabs before Dispatch:
dashboard, activity, applications, exams, questionBank, members, admins, hierarchy, evaluations, settings.

## Backend/auth baseline

- Express production server.
- Discord OAuth.
- JWT in httpOnly kayan_session cookie.
- current(req) resolves session + personnel + admin state.
- Personnel is sourced from the existing police/Google Sheet cache.
- Existing Academy persistence uses saveAcademyData() / loadAcademyData().

## Supabase baseline

Project: stsbibsqqxuynqgenvwu.

Pre-Dispatch public tables:
academy_settings, admins, application_batches, application_drafts, application_questions, applications, attempt_answers, audit_logs, evaluations, exam_attempts, exam_events, exam_questions, exam_results, exams, hierarchy, login_logs, member_images, member_settings, question_bank, role_overrides.

No dispatch_* tables existed at the baseline.

## Dispatch isolation rule

Dispatch never writes through saveAcademyData() and never adds data.dispatch* to Academy state.

Shared:
- Authentication
- Discord identity
- Personnel lookup
- Admin/Super Admin permission infrastructure
- Supabase project
- Existing application shell

Isolated:
- Dispatch tables
- Dispatch store/service/routes/validation
- Dispatch UI/map
- Dispatch audit
- Dispatch snapshots

## DB rollback

The rollback script drops only Dispatch tables/functions and is not applied automatically.
