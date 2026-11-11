create table admin_roles(key text primary key,name text not null,permissions jsonb not null default '[]');
insert into admin_roles values
('superadmin','Super Admin','[]'),('admin','Legacy Admin','[]'),
('content_manager','Content Manager','["content.read","content.write","exams.read"]'),
('exam_manager','Exam Manager','["content.read","exams.read","exams.write","users.read"]'),
('support_manager','Support Manager','["users.read","support.read","support.write"]'),
('finance_manager','Finance Manager','["premium.read","premium.write","payments.read","payments.write","users.read"]'),
('marketing_manager','Marketing Manager','["marketing.read","marketing.write","notifications.read","notifications.write"]'),
('analyst','Analyst','["analytics.read","reports.read","users.read","exams.read","premium.read","payments.read","certificates.read","coins.read"]');
alter table admin_users drop constraint admin_users_role_check;
alter table admin_users add constraint admin_role_fk foreign key(role) references admin_roles(key);
alter table profiles add column age integer check(age between 5 and 120),add column city text,add column district text;
create index profiles_city_idx on profiles(city,district);
create table admin_user_notes(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles(id),admin_id uuid not null references admin_users(id),body text not null,created_at timestamptz not null default now());
create index admin_user_notes_user_idx on admin_user_notes(user_id,created_at desc);
create table content_subjects(slug text primary key,title text not null,description text not null default '',cover_url text not null default '',position integer not null default 0,enabled boolean not null default true,visible boolean not null default true);
insert into content_subjects(slug,title,position) values('algebra','Algebra',1),('geometry','Geometriya',2);
create table content_grades(grade integer primary key check(grade between 5 and 11),enabled boolean not null default true);
insert into content_grades(grade) select generate_series(5,11);
alter table learning_books drop constraint learning_books_subject_check;
alter table learning_books add constraint learning_books_subject_fk foreign key(subject) references content_subjects(slug);
alter table learning_books add column description text not null default '',add column cover_url text not null default '';
alter table learning_topics add column content_format text not null default 'text' check(content_format in ('text','html'));
alter table learning_questions add column difficulty text not null default 'medium' check(difficulty in ('easy','medium','hard')),add column tags jsonb not null default '[]',add column image_url text;
alter table learning_exams add column difficulty_distribution jsonb;
alter table learning_exams add column passing_score integer check(passing_score between 1 and 100),add column max_attempts integer check(max_attempts between 1 and 10);
create or replace function check_learning_attempt_limit() returns trigger language plpgsql as $$
declare allowed integer;used integer;
begin
 perform id from profiles where id=new.user_id for update;
 select coalesce(e.max_attempts,(s.value->>'maxAttempts')::integer) into allowed from learning_exams e cross join learning_settings s where e.id=new.exam_id;
 select allowed+count(*)::integer into allowed from learning_attempt_grants where user_id=new.user_id and exam_id=new.exam_id and revoked_at is null;
 select count(*)::integer into used from learning_attempts where user_id=new.user_id and exam_id=new.exam_id;
 if used>=allowed or new.attempt_number<>used+1 then raise exception 'Learning attempt limit exceeded' using errcode='23514';end if;
 return new;
end $$;
create table media_assets(id uuid primary key default gen_random_uuid(),content bytea not null,mime text not null,width integer not null,height integer not null,created_by uuid not null references admin_users(id),created_at timestamptz not null default now());
create table homepage_banners(id uuid primary key default gen_random_uuid(),title text not null,description text not null default '',image_url text not null default '',destination text not null,placement text not null check(placement in ('home','learning','premium')),starts_at timestamptz not null,ends_at timestamptz not null,priority integer not null default 0,enabled boolean not null default false,created_by uuid not null references admin_users(id),updated_at timestamptz not null default now(),check(ends_at>starts_at));
create index homepage_banners_schedule on homepage_banners(placement,enabled,starts_at,ends_at,priority);
create index learning_attempts_finished_idx on learning_attempts(finished_at,user_id);
create index admin_audit_action_idx on admin_audit_logs(action,created_at desc);
insert into app_settings(key,value) values('platform','{"name":"ZEROLAX","logoUrl":"","faviconUrl":"","languages":["uz","ru","en"],"timezone":"Asia/Tashkent","registrationEnabled":true,"maintenance":false,"supportEmail":"support@zerolax.uz","rewards":{"enabled":true,"easy":1,"medium":2,"hard":3},"applyDifficultyRewards":false}') on conflict do nothing;
do $$ declare t text;begin
 foreach t in array array['admin_roles','admin_user_notes','content_subjects','content_grades','media_assets','homepage_banners'] loop
 execute format('alter table %I enable row level security',t);
 execute format('revoke all on %I from anon,authenticated',t);
 end loop;
end $$;
