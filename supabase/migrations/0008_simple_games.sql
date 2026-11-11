-- Retire definitions, never delete sessions, answers, progress or coin ledger entries.
alter table mini_games drop constraint mini_games_id_check;
alter table mini_games add column archived_at timestamptz;
alter table mini_games add constraint mini_games_id_check check(id in
 ('addition','subtraction','multiplication','division','find-answer','what-remains','how-many','share-equally'));
update mini_games set enabled=false,archived_at=now() where id in ('addition','subtraction','multiplication','division');
update mini_game_levels set config=jsonb_set(config,'{enabled}','false'::jsonb) where game_id in ('addition','subtraction','multiplication','division');
update mini_game_sessions set status='abandoned',finished_at=now(),elapsed_ms=elapsed_ms+case when active_since is null then 0 else greatest(0,extract(epoch from now()-active_since)*1000)::bigint end,active_since=null
 where game_id in ('addition','subtraction','multiplication','division') and status in ('playing','paused');
insert into mini_games(id,titles,descriptions) values
('find-answer','{"uz":"Javobni top","ru":"Найди ответ","en":"Find the answer"}', '{"uz":"Olmalarni sanang va javobni bosing.","ru":"Посчитай яблоки и выбери ответ.","en":"Count the apples and tap the answer."}'),
('what-remains','{"uz":"Nechta qoldi?","ru":"Сколько осталось?","en":"How many remain?"}', '{"uz":"Qolgan sharlarni sanang va javobni bosing.","ru":"Посчитай оставшиеся шарики.","en":"Count the balloons that remain."}'),
('how-many','{"uz":"Nechta bo‘ldi?","ru":"Сколько всего?","en":"How many altogether?"}', '{"uz":"Savatlardagi olmalarni sanang.","ru":"Посчитай яблоки в корзинках.","en":"Count the apples in the baskets."}'),
('share-equally','{"uz":"Tenglik taqsimla","ru":"Раздели поровну","en":"Share equally"}', '{"uz":"Har bir savatda nechta konfet bor?","ru":"Сколько конфет в каждой корзинке?","en":"How many sweets in each basket?"}');
insert into mini_game_levels(game_id,grade,config)
select g.id,n,jsonb_build_object('grade',n,'enabled',
 case when g.id='how-many' then n>=2 when g.id='share-equally' then n>=3 else true end,
 'minValue',1,'maxValue',case n when 1 then 20 when 2 then 100 when 3 then 500 when 4 then 2000 else 10000 end,
 'maxGroups',case n when 1 then 3 when 2 then 4 when 3 then 10 else 12 end,
 'maxPerGroup',case n when 1 then 5 when 2 then 5 when 3 then 10 when 4 then 12 else 20 end,
 'multiStep',n>=4 and g.id<>'share-equally','difficulty','normal')
from mini_games g cross join generate_series(1,5) n where g.archived_at is null;
