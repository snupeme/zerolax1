create table mini_games (
 id text primary key check(id in ('addition','subtraction','multiplication','division')),
 enabled boolean not null default true,titles jsonb not null,descriptions jsonb not null,
 illustration_url text not null default '',questions_per_round integer not null default 10 check(questions_per_round between 1 and 30),
 rewards jsonb not null default '{"correct":1,"completion":2,"perfect":3,"dailyCap":100}',updated_at timestamptz not null default now()
);
insert into mini_games(id,titles,descriptions) values
('addition','{"uz":"Yulduzlarni yig‘","ru":"Собери звёзды","en":"Collect the stars"}','{"uz":"Yulduzlarni sana va qo‘shib birlashtir!","ru":"Считай и объединяй звёзды!","en":"Count and combine colorful stars!"}'),
('subtraction','{"uz":"Yo‘qolganlarni top","ru":"Найди оставшиеся","en":"Find what remains"}','{"uz":"Sharlar uchib ketgach, nechtasi qoladi?","ru":"Сколько шариков останется?","en":"How many balloons remain after some fly away?"}'),
('multiplication','{"uz":"Guruhlarni to‘ldir","ru":"Заполни группы","en":"Fill the groups"}','{"uz":"Savatlarni to‘ldir va teng guruhlarni sanab chiq!","ru":"Заполняй корзины и считай равные группы!","en":"Fill baskets and discover equal groups!"}'),
('division','{"uz":"Adolatli taqsimla","ru":"Раздели поровну","en":"Share fairly"}','{"uz":"Shirinliklarni hammaga teng taqsimla!","ru":"Раздели сладости поровну!","en":"Share the sweets equally with everyone!"}');
create table mini_game_levels (
 game_id text not null references mini_games(id),grade integer not null check(grade between 1 and 5),
 config jsonb not null,primary key(game_id,grade)
);
insert into mini_game_levels(game_id,grade,config)
select g.id,n,jsonb_build_object('grade',n,'enabled',true,'minValue',1,'maxValue',case n when 1 then 20 when 2 then 100 when 3 then 500 when 4 then 2000 else 10000 end,
 'maxGroups',case n when 1 then 3 when 2 then 5 when 3 then 10 else 12 end,'maxPerGroup',case n when 1 then 5 when 2 then 5 when 3 then 10 when 4 then 12 else 20 end,
 'multiStep',n>=4,'remainders',n=5,'chooseDifficulty',true)
from mini_games g cross join generate_series(1,5) n;
create table mini_game_sessions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles(id),game_id text not null references mini_games(id),
 grade integer not null check(grade between 1 and 5),difficulty text not null check(difficulty in ('easy','normal','hard')),
 status text not null default 'playing' check(status in ('playing','paused','completed','abandoned')),
 settings jsonb not null,total integer not null check(total between 1 and 30),current_index integer not null default 0,
 correct_count integer not null default 0,answered_count integer not null default 0,score integer not null default 0 check(score between 0 and 100),
 coins_earned integer not null default 0 check(coins_earned>=0),elapsed_ms bigint not null default 0,active_since timestamptz default now(),
 started_at timestamptz not null default now(),finished_at timestamptz,
 check(current_index>=0 and current_index<total),check(answered_count between 0 and total),check(correct_count between 0 and answered_count)
);
create unique index mini_game_one_active on mini_game_sessions(user_id) where status in ('playing','paused');
create index mini_game_sessions_user_date on mini_game_sessions(user_id,started_at desc);
create index mini_game_sessions_analytics on mini_game_sessions(game_id,grade,status,finished_at);
create table mini_game_questions (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references mini_game_sessions(id),position integer not null,
 payload jsonb not null,solution integer not null check(solution>=0),remainder integer not null default 0 check(remainder>=0),
 visual jsonb not null default '{}',answer jsonb,correct boolean,answered_at timestamptz,
 unique(session_id,position),check((answer is null and correct is null and answered_at is null) or (answer is not null and correct is not null and answered_at is not null))
);
create table mini_game_progress (
 user_id uuid not null references profiles(id),game_id text not null references mini_games(id),grade integer not null,difficulty text not null,
 completed_rounds integer not null default 0,correct_answers integer not null default 0,total_answers integer not null default 0,
 best_score integer not null default 0,coins integer not null default 0,updated_at timestamptz not null default now(),
 primary key(user_id,game_id,grade,difficulty)
);
update admin_roles set permissions=permissions||'["games.read","games.write"]'::jsonb where key='content_manager';
update admin_roles set permissions=permissions||'["games.read"]'::jsonb where key in ('analyst','exam_manager');
do $$declare t text;begin foreach t in array array['mini_games','mini_game_levels','mini_game_sessions','mini_game_questions','mini_game_progress'] loop
execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);end loop;end $$;
