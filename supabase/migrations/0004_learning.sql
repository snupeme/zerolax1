-- Learning is separate from daily IQ and entrance attempts: their existing limits remain intact.
create table learning_settings (
  singleton boolean primary key default true check (singleton),
  value jsonb not null
);
insert into learning_settings(value) values ('{"repeatBelow":40,"reviewFrom":50,"unlockFrom":71,"certificateFrom":80,"borderlinePolicy":"pending","topicQuestionCount":10,"maxAttempts":2,"allowPassedRetake":false}');
create table learning_books (
  id uuid primary key default gen_random_uuid(), title text not null,
  subject text not null check(subject in ('algebra','geometry')), grade integer not null check(grade between 5 and 11),
  position integer not null check(position > 0), free_topic_limit integer not null default 3 check(free_topic_limit >= 0),
  published boolean not null default false, unique(subject,grade,position)
);
create table learning_topics (
  id uuid primary key default gen_random_uuid(), book_id uuid not null references learning_books(id),
  title text not null, content text not null default '', position integer not null check(position > 0),
  published boolean not null default false, unique(book_id,position)
);
create table learning_questions (
  id uuid primary key default gen_random_uuid(), topic_id uuid not null references learning_topics(id),
  text text not null, options jsonb not null check(jsonb_array_length(options)=4),
  correct_index integer not null check(correct_index between 0 and 3), explanation text not null default '',
  published boolean not null default true
);
create index learning_questions_topic on learning_questions(topic_id);
create table learning_exams (
  id uuid primary key default gen_random_uuid(), book_id uuid not null references learning_books(id),
  topic_id uuid references learning_topics(id), kind text not null check(kind in ('topic','intermediate','final')),
  block_number integer, duration_seconds integer not null default 1800 check(duration_seconds between 60 and 14400),
  published boolean not null default false,
  check ((kind='topic' and topic_id is not null and block_number is null) or
         (kind='intermediate' and topic_id is null and block_number is not null and block_number > 0) or
         (kind='final' and topic_id is null and block_number is null))
);
create unique index learning_exam_topic on learning_exams(topic_id) where kind='topic';
create unique index learning_exam_block on learning_exams(book_id,block_number) where kind='intermediate';
create unique index learning_exam_final on learning_exams(book_id) where kind='final';
create table learning_attempt_grants (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id),
  exam_id uuid not null references learning_exams(id), admin_id uuid not null references admin_users(id),
  reason text not null, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table learning_attempts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id),
  exam_id uuid not null references learning_exams(id), attempt_number integer not null check(attempt_number>0),
  status text not null default 'in_progress' check(status in ('in_progress','submitted','expired')),
  started_at timestamptz not null default now(), expires_at timestamptz not null, finished_at timestamptz,
  settings jsonb not null, answers jsonb not null default '{}', score numeric(5,2) check(score between 0 and 100), result jsonb,
  unique(user_id,exam_id,attempt_number)
);
create unique index learning_one_active on learning_attempts(user_id,exam_id) where status='in_progress';
create table learning_attempt_questions (
  attempt_id uuid not null references learning_attempts(id), question_id uuid not null references learning_questions(id),
  position integer not null, snapshot jsonb not null,
  primary key(attempt_id,question_id), unique(attempt_id,position)
);
-- A DB trigger also enforces limits for direct writes; serialize all starts for a user.
create function check_learning_attempt_limit() returns trigger language plpgsql as $$
declare allowed integer; used integer;
begin
  perform id from profiles where id=new.user_id for update;
  select (value->>'maxAttempts')::integer into allowed from learning_settings;
  select allowed+count(*)::integer into allowed from learning_attempt_grants
    where user_id=new.user_id and exam_id=new.exam_id and revoked_at is null;
  select count(*)::integer into used from learning_attempts where user_id=new.user_id and exam_id=new.exam_id;
  if used >= allowed or new.attempt_number <> used+1 then
    raise exception 'Learning attempt limit exceeded' using errcode='23514';
  end if;
  return new;
end $$;
create trigger learning_attempt_limit before insert on learning_attempts for each row execute function check_learning_attempt_limit();
create table learning_progress (
  user_id uuid not null references profiles(id), topic_id uuid not null references learning_topics(id),
  completed_at timestamptz not null default now(), primary key(user_id,topic_id)
);
create table learning_book_unlocks (
  user_id uuid not null references profiles(id), book_id uuid not null references learning_books(id),
  attempt_id uuid not null references learning_attempts(id), primary key(user_id,book_id)
);
create table learning_student_details (
  user_id uuid primary key references profiles(id), full_name text not null, grade integer not null check(grade between 5 and 11)
);
create table learning_payments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id), provider text not null,
  provider_transaction_id text, amount_minor bigint not null check(amount_minor>0), currency text not null,
  duration_seconds integer not null check(duration_seconds>0),
  status text not null default 'pending' check(status in ('pending','succeeded','failed','refunded','expired')),
  verified_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(provider,provider_transaction_id)
);
create table learning_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id),
  source text not null check(source in ('admin','payment')), starts_at timestamptz not null, expires_at timestamptz not null,
  revoked_at timestamptz, admin_id uuid references admin_users(id), payment_id uuid unique references learning_payments(id),
  reason text, check(expires_at>starts_at),
  check((source='admin' and admin_id is not null and payment_id is null) or (source='payment' and payment_id is not null))
);
create index learning_subscriptions_user on learning_subscriptions(user_id,expires_at);
create table learning_payment_events (
  provider text not null, event_id text not null, payment_id uuid not null references learning_payments(id),
  status text not null, received_at timestamptz not null default now(), primary key(provider,event_id)
);
create table learning_certificates (
  id uuid primary key default gen_random_uuid(), verification_id uuid not null unique default gen_random_uuid(),
  user_id uuid not null references profiles(id), book_id uuid not null references learning_books(id),
  attempt_id uuid not null unique references learning_attempts(id), student_name text not null, grade integer not null,
  book_title text not null, score numeric(5,2) not null, completed_at timestamptz not null,
  seconds_spent integer not null, pdf bytea, revoked_at timestamptz, unique(user_id,book_id)
);
create table learning_admin_permissions (
  admin_id uuid not null references admin_users(id), permission text not null check(permission in ('content','settings','attempts','premium','payments','certificates','students')),
  primary key(admin_id,permission)
);
create table learning_alerts (
  exam_id uuid primary key references learning_exams(id), message text not null, updated_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['learning_settings','learning_books','learning_topics','learning_questions','learning_exams','learning_attempt_grants','learning_attempts','learning_attempt_questions','learning_progress','learning_book_unlocks','learning_student_details','learning_payments','learning_subscriptions','learning_payment_events','learning_certificates','learning_admin_permissions','learning_alerts'] loop
    execute format('alter table %I enable row level security',t);
    execute format('revoke all on %I from anon, authenticated',t);
  end loop;
end $$;
