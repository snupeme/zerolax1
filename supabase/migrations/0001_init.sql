-- ===========================================================================
-- ZEROLAX — initial schema
-- PostgreSQL 15+ / Supabase. All timestamps are stored with time zone (UTC).
-- ===========================================================================

-- Profiles ------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  telegram_username text,
  first_name text,
  last_name text,
  nickname text not null,
  language text not null default 'uz' check (language in ('uz', 'ru', 'en')),
  phone text,
  avatar_url text,
  coins_balance integer not null default 0 check (coins_balance >= 0),
  status text not null default 'active' check (status in ('active', 'blocked')),
  notification_prefs jsonb not null default '{"dailyIq": true, "results": true, "announcements": true}'::jsonb,
  is_dev boolean not null default false,
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_nickname_lower_idx on profiles (lower(nickname));
create index if not exists profiles_registered_at_idx on profiles (registered_at desc);
create index if not exists profiles_status_idx on profiles (status);

-- Sessions -------------------------------------------------------------------
create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  refresh_token_hash text not null unique,
  user_agent text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists user_sessions_user_idx on user_sessions (user_id);

-- Daily activity (DAU) -------------------------------------------------------
create table if not exists user_activity (
  user_id uuid not null references profiles(id) on delete cascade,
  activity_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);
create index if not exists user_activity_date_idx on user_activity (activity_date);

-- Daily IQ tests --------------------------------------------------------------
create table if not exists daily_iq_tests (
  id uuid primary key default gen_random_uuid(),
  test_date date not null unique,
  title_uz text not null,
  title_ru text not null,
  title_en text not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  publish_at timestamptz not null,
  published_at timestamptz,
  release_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists daily_iq_tests_status_idx on daily_iq_tests (status, release_at);

create table if not exists iq_questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references daily_iq_tests(id) on delete cascade,
  position integer not null check (position between 1 and 100),
  text_uz text not null,
  text_ru text not null,
  text_en text not null,
  explanation_uz text,
  explanation_ru text,
  explanation_en text,
  difficulty text not null default 'easy' check (difficulty in ('easy', 'medium', 'hard')),
  coins integer not null default 1 check (coins >= 0),
  image_url text,
  correct_option_index integer not null check (correct_option_index between 0 and 3),
  created_at timestamptz not null default now(),
  unique (test_id, position)
);
create index if not exists iq_questions_test_idx on iq_questions (test_id, position);

create table if not exists iq_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references iq_questions(id) on delete cascade,
  position integer not null check (position between 0 and 3),
  text_uz text not null,
  text_ru text not null,
  text_en text not null,
  unique (question_id, position)
);
create index if not exists iq_question_options_question_idx on iq_question_options (question_id, position);

create table if not exists iq_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  test_id uuid not null references daily_iq_tests(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'scored')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  scored_at timestamptz,
  correct_count integer not null default 0,
  incorrect_count integer not null default 0,
  unanswered_count integer not null default 0,
  total_questions integer not null default 10,
  coins_earned integer not null default 0,
  reward_status text not null default 'pending' check (reward_status in ('pending', 'credited')),
  result_notified_at timestamptz,
  unique (user_id, test_id)
);
create index if not exists iq_attempts_user_idx on iq_attempts (user_id, started_at desc);
create index if not exists iq_attempts_test_idx on iq_attempts (test_id, status);

create table if not exists iq_user_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references iq_attempts(id) on delete cascade,
  question_id uuid not null references iq_questions(id) on delete cascade,
  selected_option_id uuid not null references iq_question_options(id) on delete cascade,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- University entrance tests ----------------------------------------------------
create table if not exists entrance_tests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title_uz text not null,
  title_ru text not null,
  title_en text not null,
  description_uz text,
  description_ru text,
  description_en text,
  subject text not null,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  duration_seconds integer not null default 1800 check (duration_seconds between 60 and 7200),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists entrance_tests_status_idx on entrance_tests (status);

create table if not exists entrance_questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references entrance_tests(id) on delete cascade,
  position integer not null check (position between 1 and 200),
  text_uz text not null,
  text_ru text not null,
  text_en text not null,
  explanation_uz text,
  explanation_ru text,
  explanation_en text,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  coins integer not null default 1 check (coins >= 0),
  image_url text,
  correct_option_index integer not null check (correct_option_index between 0 and 3),
  created_at timestamptz not null default now(),
  unique (test_id, position)
);
create index if not exists entrance_questions_test_idx on entrance_questions (test_id, position);

create table if not exists entrance_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references entrance_questions(id) on delete cascade,
  position integer not null check (position between 0 and 3),
  text_uz text not null,
  text_ru text not null,
  text_en text not null,
  unique (question_id, position)
);
create index if not exists entrance_question_options_question_idx on entrance_question_options (question_id, position);

create table if not exists entrance_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  test_id uuid not null references entrance_tests(id) on delete cascade,
  attempt_date date not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  correct_count integer not null default 0,
  incorrect_count integer not null default 0,
  unanswered_count integer not null default 0,
  total_questions integer not null default 20,
  score_percent numeric(5, 2) not null default 0,
  coins_earned integer not null default 0,
  reward_status text not null default 'pending' check (reward_status in ('pending', 'credited')),
  -- One attempt per user per Tashkent calendar day, regardless of the test.
  unique (user_id, attempt_date)
);
create index if not exists entrance_attempts_user_idx on entrance_attempts (user_id, started_at desc);
create index if not exists entrance_attempts_date_idx on entrance_attempts (attempt_date);

create table if not exists entrance_user_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references entrance_attempts(id) on delete cascade,
  question_id uuid not null references entrance_questions(id) on delete cascade,
  selected_option_id uuid not null references entrance_question_options(id) on delete cascade,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- Coin ledger ------------------------------------------------------------------
create table if not exists coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount integer not null,
  type text not null,
  source_type text,
  source_id text,
  idempotency_key text not null unique,
  description text,
  balance_after integer,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists coin_transactions_user_idx on coin_transactions (user_id, created_at desc);
create index if not exists coin_transactions_type_idx on coin_transactions (type);

-- Achievements -----------------------------------------------------------------
create table if not exists achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title_uz text not null,
  title_ru text not null,
  title_en text not null,
  description_uz text,
  description_ru text,
  description_en text,
  icon text not null default 'award',
  coin_reward integer not null default 0 check (coin_reward >= 0),
  created_at timestamptz not null default now()
);

create table if not exists user_achievements (
  user_id uuid not null references profiles(id) on delete cascade,
  achievement_id uuid not null references achievements(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- Gifts ------------------------------------------------------------------------
create table if not exists gifts (
  id uuid primary key default gen_random_uuid(),
  title_uz text not null,
  title_ru text not null,
  title_en text not null,
  description_uz text,
  description_ru text,
  description_en text,
  price integer not null check (price >= 0),
  image_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

-- Notifications ----------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  title_uz text not null,
  title_ru text not null,
  title_en text not null,
  body_uz text not null,
  body_ru text not null,
  body_en text not null,
  target text not null default 'all' check (target in ('all', 'active', 'user')),
  target_user_id uuid references profiles(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists notifications_status_idx on notifications (status, scheduled_at);

create table if not exists user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  notification_id uuid references notifications(id) on delete set null,
  dedupe_key text unique,
  title text not null,
  body text not null,
  kind text not null default 'announcement',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists user_notifications_user_idx on user_notifications (user_id, created_at desc);

create table if not exists telegram_notification_logs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references notifications(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  telegram_id bigint not null,
  kind text not null default 'system',
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists telegram_notification_logs_created_idx on telegram_notification_logs (created_at desc);

-- Support ----------------------------------------------------------------------
create table if not exists support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  admin_reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_requests_user_idx on support_requests (user_id, created_at desc);
create index if not exists support_requests_status_idx on support_requests (status, created_at desc);

-- Admin ------------------------------------------------------------------------
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null default 'Admin',
  password_hash text not null,
  role text not null default 'admin' check (role in ('admin', 'superadmin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists admin_users_email_lower_idx on admin_users (lower(email));

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references admin_users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_idx on admin_audit_logs (created_at desc);

-- Platform settings -------------------------------------------------------------
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Bot registration state --------------------------------------------------------
create table if not exists bot_registration_states (
  telegram_id bigint primary key,
  step text not null default 'language' check (step in ('language', 'nickname', 'phone')),
  language text check (language in ('uz', 'ru', 'en')),
  nickname text,
  updated_at timestamptz not null default now()
);
