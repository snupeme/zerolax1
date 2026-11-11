-- ===========================================================================
-- ZEROLAX — Row Level Security hardening
--
-- The API connects with a trusted role and performs its own authorization.
-- These policies are defence-in-depth for any direct Supabase client access.
-- The current user id is expected in:  set_config('app.user_id', '<uuid>', true)
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

create or replace function app_current_user_id() returns uuid
language sql stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

-- Profiles: a user can read and update only their own profile.
alter table profiles enable row level security;
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select to authenticated
  using (id = app_current_user_id());
drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update to authenticated
  using (id = app_current_user_id())
  with check (id = app_current_user_id() and status = 'active');

-- Never expose the phone column through direct client reads.
revoke all on profiles from anon;
grant select (id, telegram_id, telegram_username, first_name, last_name, nickname, language, avatar_url,
  coins_balance, status, notification_prefs, registered_at)
  on profiles to authenticated;

alter table coin_transactions enable row level security;
drop policy if exists coin_transactions_select_own on coin_transactions;
create policy coin_transactions_select_own on coin_transactions
  for select to authenticated
  using (user_id = app_current_user_id());

alter table user_notifications enable row level security;
drop policy if exists user_notifications_select_own on user_notifications;
create policy user_notifications_select_own on user_notifications
  for select to authenticated
  using (user_id = app_current_user_id());
drop policy if exists user_notifications_update_own on user_notifications;
create policy user_notifications_update_own on user_notifications
  for update to authenticated
  using (user_id = app_current_user_id())
  with check (user_id = app_current_user_id());

alter table support_requests enable row level security;
drop policy if exists support_requests_select_own on support_requests;
create policy support_requests_select_own on support_requests
  for select to authenticated
  using (user_id = app_current_user_id());
drop policy if exists support_requests_insert_own on support_requests;
create policy support_requests_insert_own on support_requests
  for insert to authenticated
  with check (user_id = app_current_user_id());

alter table user_achievements enable row level security;
drop policy if exists user_achievements_select_own on user_achievements;
create policy user_achievements_select_own on user_achievements
  for select to authenticated
  using (user_id = app_current_user_id());

-- Test content and answers must never be readable directly from the client.
alter table iq_questions enable row level security;
alter table iq_question_options enable row level security;
alter table iq_attempts enable row level security;
alter table iq_user_answers enable row level security;
alter table entrance_questions enable row level security;
alter table entrance_question_options enable row level security;
alter table entrance_attempts enable row level security;
alter table entrance_user_answers enable row level security;
alter table user_sessions enable row level security;
alter table admin_users enable row level security;
alter table admin_audit_logs enable row level security;
alter table bot_registration_states enable row level security;
alter table notifications enable row level security;
alter table telegram_notification_logs enable row level security;

-- Public read-only catalogues.
alter table gifts enable row level security;
drop policy if exists gifts_public_read on gifts;
create policy gifts_public_read on gifts
  for select to anon, authenticated
  using (status = 'active');

alter table achievements enable row level security;
drop policy if exists achievements_public_read on achievements;
create policy achievements_public_read on achievements
  for select to anon, authenticated
  using (true);

alter table app_settings enable row level security;
