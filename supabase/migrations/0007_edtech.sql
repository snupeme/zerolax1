-- ===========================================================================
-- ZEROLAX — EdTech upgrade
-- Daily missions, streaks, leaderboards, flashcards with spaced repetition,
-- smart error notebook, learning analytics, weekly reports, achievements,
-- recommendations and admin configuration.
--
-- Compatible with PostgreSQL and PGlite. No extensions beyond gen_random_uuid().
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Settings & profile privacy
-- ---------------------------------------------------------------------------
create table if not exists edtech_settings (
  id integer primary key default 1 check (id = 1),
  intervals jsonb not null default '{"again":0,"hard":1,"good":3,"easy":7}',
  leaderboard_weights jsonb not null default '{"correct":1,"test":5}',
  streak_rewards jsonb not null default '{"3":10,"7":25,"14":50,"30":100,"60":250}',
  updated_at timestamptz not null default now()
);
insert into edtech_settings (id) values (1) on conflict (id) do nothing;

alter table profiles add column if not exists leaderboard_visible boolean not null default true;

-- ---------------------------------------------------------------------------
-- Daily missions & streaks
-- ---------------------------------------------------------------------------
create table if not exists daily_missions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  metric text not null check (metric in (
    'questions_answered','algebra_topic','geometry_practice',
    'flashcards_reviewed','mistakes_reviewed','daily_test'
  )),
  target integer not null default 1 check (target > 0),
  reward_coins integer not null default 0 check (reward_coins >= 0),
  titles jsonb not null,
  descriptions jsonb not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 0,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists daily_missions_active on daily_missions (active, sort_order);

create table if not exists user_daily_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  mission_id uuid not null references daily_missions(id) on delete cascade,
  mission_date date not null,
  progress integer not null default 0 check (progress >= 0),
  target integer not null check (target > 0),
  completed_at timestamptz,
  reward_credited_at timestamptz,
  unique (user_id, mission_id, mission_date)
);
create index if not exists user_daily_missions_date on user_daily_missions (user_id, mission_date);

create table if not exists user_streaks (
  user_id uuid primary key references profiles(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_activity_date date,
  updated_at timestamptz not null default now()
);

create table if not exists user_streak_rewards (
  user_id uuid not null references profiles(id) on delete cascade,
  milestone integer not null check (milestone > 0),
  claimed_at timestamptz not null default now(),
  primary key (user_id, milestone)
);

-- ---------------------------------------------------------------------------
-- Activity log (single source of truth for leaderboards, reports, analytics)
-- ---------------------------------------------------------------------------
create table if not exists learning_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in (
    'question','test','topic','flashcard','mistake_review','game'
  )),
  subject text not null default 'general',
  topic_key text not null default 'general',
  topic text not null default '',
  question_ref text,
  correct boolean,
  score numeric(5,2),
  source_type text,
  source_id text,
  activity_date date not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);
create index if not exists learning_activity_user_date on learning_activity (user_id, activity_date);
create index if not exists learning_activity_period on learning_activity (activity_date, subject, user_id);
create index if not exists learning_activity_kind on learning_activity (user_id, kind, activity_date);

-- ---------------------------------------------------------------------------
-- Leaderboard snapshots
-- ---------------------------------------------------------------------------
create table if not exists leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period in ('weekly','monthly','all')),
  subject text not null default 'all',
  period_start date not null,
  period_end date not null,
  user_id uuid not null references profiles(id) on delete cascade,
  rank integer not null check (rank > 0),
  score integer not null default 0,
  questions integer not null default 0,
  created_at timestamptz not null default now(),
  unique (period, subject, period_start, user_id)
);
create index if not exists leaderboard_snapshots_period on leaderboard_snapshots (period, subject, period_start, rank);

-- ---------------------------------------------------------------------------
-- Flashcards & spaced repetition
-- ---------------------------------------------------------------------------
create table if not exists flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (subject in ('algebra','geometry','dtm','sat','english')),
  grade integer check (grade between 1 and 11),
  titles jsonb not null,
  descriptions jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','published')),
  position integer not null default 0,
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flashcard_decks_subject on flashcard_decks (subject, status, position);

create table if not exists flashcards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references flashcard_decks(id) on delete cascade,
  front jsonb not null,
  back jsonb not null,
  explanation jsonb not null default '{}',
  example jsonb not null default '{}',
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  position integer not null default 0,
  status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flashcards_deck on flashcards (deck_id, position);

create table if not exists user_flashcard_progress (
  user_id uuid not null references profiles(id) on delete cascade,
  flashcard_id uuid not null references flashcards(id) on delete cascade,
  box integer not null default 0 check (box >= 0),
  due_at timestamptz not null default now(),
  last_rating text check (last_rating in ('again','hard','good','easy')),
  last_reviewed_at timestamptz,
  review_count integer not null default 0,
  correct_count integer not null default 0,
  lapses integer not null default 0,
  primary key (user_id, flashcard_id)
);
create index if not exists user_flashcard_due on user_flashcard_progress (user_id, due_at);

create table if not exists user_flashcard_favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  flashcard_id uuid not null references flashcards(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, flashcard_id)
);

-- ---------------------------------------------------------------------------
-- Smart error notebook
-- ---------------------------------------------------------------------------
create table if not exists user_mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  source text not null check (source in ('iq','entrance','learning','games')),
  source_question_id text not null,
  subject text not null default 'general',
  topic_key text not null default 'general',
  topic text not null default '',
  question jsonb not null,
  selected_answer text,
  correct_answer text,
  explanation text not null default '',
  difficulty text not null default 'medium',
  times_wrong integer not null default 1 check (times_wrong > 0),
  times_correct integer not null default 0 check (times_correct >= 0),
  resolved boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, source, source_question_id)
);
create index if not exists user_mistakes_user on user_mistakes (user_id, resolved, last_seen_at desc);
create index if not exists user_mistakes_topic on user_mistakes (user_id, subject, topic_key);

create table if not exists mistake_review_history (
  id uuid primary key default gen_random_uuid(),
  mistake_id uuid not null references user_mistakes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  correct boolean not null,
  answered_at timestamptz not null default now()
);
create index if not exists mistake_review_history_user on mistake_review_history (user_id, answered_at desc);

-- ---------------------------------------------------------------------------
-- Learning analytics map
-- ---------------------------------------------------------------------------
create table if not exists learning_analytics (
  user_id uuid not null references profiles(id) on delete cascade,
  subject text not null,
  topic_key text not null default 'general',
  topic text not null default '',
  status text not null default 'not_started' check (status in (
    'not_started','in_progress','mastered','needs_review'
  )),
  attempts integer not null default 0,
  correct_count integer not null default 0,
  total_count integer not null default 0,
  last_activity_at timestamptz not null default now(),
  primary key (user_id, subject, topic_key)
);

-- ---------------------------------------------------------------------------
-- Weekly reports & recommendations
-- ---------------------------------------------------------------------------
create table if not exists weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists recommendation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  ref_id text,
  title jsonb not null default '{}',
  reason jsonb not null default '{}',
  href text not null default '/',
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);
create index if not exists recommendation_history_user on recommendation_history (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Achievements extension (existing tables are reused)
-- ---------------------------------------------------------------------------
alter table achievements add column if not exists criteria jsonb not null default '{}';
alter table achievements add column if not exists active boolean not null default true;
alter table achievements add column if not exists sort_order integer not null default 0;

-- ---------------------------------------------------------------------------
-- Default daily missions
-- ---------------------------------------------------------------------------
insert into daily_missions (code, metric, target, reward_coins, titles, descriptions, sort_order) values
('daily_10_questions','questions_answered',10,5,
 '{"uz":"10 ta savol yechish","ru":"Решить 10 вопросов","en":"Answer 10 questions"}',
 '{"uz":"Har qanday test yoki mashqdan 10 ta savolga javob bering.","ru":"Ответьте на 10 вопросов в любом тесте или практике.","en":"Answer 10 questions in any test or practice."}',10),
('daily_algebra_topic','algebra_topic',1,10,
 '{"uz":"Algebra mavzusini tugatish","ru":"Завершить тему по алгебре","en":"Complete an algebra topic"}',
 '{"uz":"Algebra fanidan bitta mavzu testini muvaffaqiyatli yakunlang.","ru":"Успешно завершите тест по одной теме алгебры.","en":"Pass one algebra topic test."}',20),
('daily_geometry_practice','geometry_practice',1,10,
 '{"uz":"Geometriya mashqi","ru":"Практика по геометрии","en":"Geometry practice"}',
 '{"uz":"Geometriya fanidan kamida bitta savolga javob bering.","ru":"Ответьте хотя бы на один вопрос по геометрии.","en":"Answer at least one geometry question."}',30),
('daily_flashcards','flashcards_reviewed',10,5,
 '{"uz":"10 ta flashcard takrorlash","ru":"Повторить 10 карточек","en":"Review 10 flashcards"}',
 '{"uz":"Bilim kartochkalaridan 10 tasini takrorlang.","ru":"Повторите 10 обучающих карточек.","en":"Review 10 learning flashcards."}',40),
('daily_mistakes','mistakes_reviewed',5,5,
 '{"uz":"5 ta xatoni qayta ishlash","ru":"Проработать 5 ошибок","en":"Review 5 mistakes"}',
 '{"uz":"Xatolar daftaridagi 5 ta savolni qayta yeching.","ru":"Повторно решите 5 вопросов из тетради ошибок.","en":"Re-solve 5 questions from the error notebook."}',50),
('daily_test','daily_test',1,10,
 '{"uz":"Kunlik test yoki IQ mashqi","ru":"Ежедневный тест или IQ","en":"Daily test or IQ practice"}',
 '{"uz":"Kunlik IQ testi, kirish imtihoni yoki mavzu testini yakunlang.","ru":"Завершите ежедневный IQ-тест, вступительный или тематический тест.","en":"Finish a daily IQ, entrance or topic test."}',60)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Achievement catalogue (new codes; old codes keep their existing rules)
-- ---------------------------------------------------------------------------
insert into achievements (code, title_uz, title_ru, title_en, description_uz, description_ru, description_en, icon, coin_reward, criteria, sort_order) values
('questions_100','100 savol','100 вопросов','100 questions','100 ta savolga javob berdingiz.','Вы ответили на 100 вопросов.','You answered 100 questions.','target',20,'{"type":"questions","value":100}',100),
('streak_7','7 kunlik seriya','Серия 7 дней','7-day streak','7 kun ketma-ket faol bo‘ldingiz.','Вы были активны 7 дней подряд.','You were active 7 days in a row.','flame',25,'{"type":"streak","value":7}',110),
('knowledge_master','Bilim ustasi','Мастер знаний','Knowledge master','10 ta mavzuni o‘zlashtirdingiz.','Вы освоили 10 тем.','You mastered 10 topics.','graduation-cap',40,'{"type":"topics","value":10}',120),
('mistake_fighter','Xatolar ustasi','Борец с ошибками','Mistake fighter','20 ta xatoni to‘g‘ri qayta ishladingiz.','Вы правильно проработали 20 ошибок.','You correctly reworked 20 mistakes.','shield-check',30,'{"type":"mistake_reviews","value":20}',130),
('flashcard_master','Flashcard ustasi','Мастер карточек','Flashcard master','100 ta kartani o‘zlashtirdingiz.','Вы освоили 100 карточек.','You mastered 100 flashcards.','layers',30,'{"type":"flashcards","value":100}',140),
('missions_30','30 kunlik intizom','Дисциплина 30 дней','30-day discipline','30 ta kunlik vazifani bajardingiz.','Вы выполнили 30 ежедневных заданий.','You completed 30 daily missions.','calendar-check',50,'{"type":"missions","value":30}',150),
('leaderboard_top3','Reyting g‘olibi','Призёр рейтинга','Leaderboard top 3','Haftalik reytingda TOP 3 ga kirdingiz.','Вы вошли в ТОП-3 недельного рейтинга.','You reached the weekly top 3.','trophy',60,'{"type":"rank","value":3}',160)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Starter flashcard decks with real formulas and definitions
-- ---------------------------------------------------------------------------
insert into flashcard_decks (subject, grade, titles, descriptions, status, position) values
('algebra',7,'{"uz":"Qisqa ko‘paytirish formulalari","ru":"Формулы сокращённого умножения","en":"Short multiplication formulas"}','{"uz":"Algebraning asosiy formulalari.","ru":"Основные формулы алгебры.","en":"Core algebra formulas."}','published',10),
('geometry',7,'{"uz":"Asosiy geometriya formulalari","ru":"Основные формулы геометрии","en":"Core geometry formulas"}','{"uz":"Perimetr, yuza va hajmlar.","ru":"Периметр, площадь и объём.","en":"Perimeter, area and volume."}','published',20),
('dtm',null,'{"uz":"DTM matematika tayanch qoidalari","ru":"Опорные правила математики DTM","en":"DTM math essentials"}','{"uz":"DTM uchun eng kerakli qoidalar.","ru":"Ключевые правила для DTM.","en":"Key rules for DTM."}','published',30),
('sat',null,'{"uz":"SAT Math formulalari","ru":"Формулы SAT Math","en":"SAT Math formulas"}','{"uz":"SAT Math bo‘limi uchun formulalar.","ru":"Формулы для раздела SAT Math.","en":"Formulas for SAT Math."}','published',40),
('english',null,'{"uz":"Ingliz tili: foydali iboralar","ru":"Английский: полезные фразы","en":"English: useful phrases"}','{"uz":"Kundalik ingliz tili iboralari.","ru":"Повседневные английские фразы.","en":"Everyday English phrases."}','published',50);

insert into flashcards (deck_id, front, back, explanation, example, difficulty, position)
select d.id, v.front::jsonb, v.back::jsonb, v.explanation::jsonb, v.example::jsonb, v.difficulty, v.position
from flashcard_decks d
join (values
  ('algebra',1,'{"uz":"(a + b)² = ?","ru":"(a + b)² = ?","en":"(a + b)² = ?"}','{"uz":"a² + 2ab + b²","ru":"a² + 2ab + b²","en":"a² + 2ab + b²"}','{"uz":"Yig‘indining kvadrati: birinchi had kvadrati, ikkilangan ko‘paytma va ikkinchi had kvadrati.","ru":"Квадрат суммы: квадрат первого, удвоенное произведение и квадрат второго.","en":"Square of a sum: first squared, twice the product, second squared."}','{"uz":"(x + 3)² = x² + 6x + 9","ru":"(x + 3)² = x² + 6x + 9","en":"(x + 3)² = x² + 6x + 9"}','easy',1),
  ('algebra',2,'{"uz":"(a − b)² = ?","ru":"(a − b)² = ?","en":"(a − b)² = ?"}','{"uz":"a² − 2ab + b²","ru":"a² − 2ab + b²","en":"a² − 2ab + b²"}','{"uz":"Ayirmaning kvadrati: o‘rta had manfiy bo‘ladi.","ru":"Квадрат разности: средний член отрицательный.","en":"Square of a difference: the middle term is negative."}','{"uz":"(x − 5)² = x² − 10x + 25","ru":"(x − 5)² = x² − 10x + 25","en":"(x − 5)² = x² − 10x + 25"}','easy',2),
  ('algebra',3,'{"uz":"a² − b² = ?","ru":"a² − b² = ?","en":"a² − b² = ?"}','{"uz":"(a − b)(a + b)","ru":"(a − b)(a + b)","en":"(a − b)(a + b)"}','{"uz":"Kvadratlar ayirmasi ko‘paytuvchilarga ajraladi.","ru":"Разность квадратов раскладывается на множители.","en":"Difference of squares factors into two binomials."}','{"uz":"9 − x² = (3 − x)(3 + x)","ru":"9 − x² = (3 − x)(3 + x)","en":"9 − x² = (3 − x)(3 + x)"}','easy',3),
  ('algebra',4,'{"uz":"a³ + b³ = ?","ru":"a³ + b³ = ?","en":"a³ + b³ = ?"}','{"uz":"(a + b)(a² − ab + b²)","ru":"(a + b)(a² − ab + b²)","en":"(a + b)(a² − ab + b²)"}','{"uz":"Kublar yig‘indisi formulasi.","ru":"Формула суммы кубов.","en":"Sum of cubes formula."}','{"uz":"x³ + 8 = (x + 2)(x² − 2x + 4)","ru":"x³ + 8 = (x + 2)(x² − 2x + 4)","en":"x³ + 8 = (x + 2)(x² − 2x + 4)"}','medium',4),
  ('algebra',5,'{"uz":"Kvadrat tenglama ildizlari formulasi","ru":"Формула корней квадратного уравнения","en":"Quadratic formula"}','{"uz":"x = (−b ± √(b² − 4ac)) / 2a","ru":"x = (−b ± √(b² − 4ac)) / 2a","en":"x = (−b ± √(b² − 4ac)) / 2a"}','{"uz":"Diskriminant D = b² − 4ac. D > 0 bo‘lsa ikkita haqiqiy ildiz bor.","ru":"Дискриминант D = b² − 4ac. При D > 0 два действительных корня.","en":"Discriminant D = b² − 4ac. If D > 0 there are two real roots."}','{"uz":"x² − 3x + 2 = 0 → x = 1, 2","ru":"x² − 3x + 2 = 0 → x = 1, 2","en":"x² − 3x + 2 = 0 → x = 1, 2"}','medium',5),
  ('algebra',6,'{"uz":"Viyet teoremasi","ru":"Теорема Виета","en":"Vieta''s theorem"}','{"uz":"x₁ + x₂ = −b/a, x₁·x₂ = c/a","ru":"x₁ + x₂ = −b/a, x₁·x₂ = c/a","en":"x₁ + x₂ = −b/a, x₁·x₂ = c/a"}','{"uz":"Keltirilgan x² + px + q = 0 tenglama uchun yig‘indi −p, ko‘paytma q.","ru":"Для x² + px + q = 0 сумма равна −p, произведение q.","en":"For x² + px + q = 0 the sum is −p and the product is q."}','{"uz":"x² − 5x + 6 = 0 → 2 + 3 = 5, 2·3 = 6","ru":"x² − 5x + 6 = 0 → 2 + 3 = 5, 2·3 = 6","en":"x² − 5x + 6 = 0 → 2 + 3 = 5, 2·3 = 6"}','medium',6),
  ('algebra',7,'{"uz":"Daraja xossalari","ru":"Свойства степеней","en":"Exponent rules"}','{"uz":"aᵐ·aⁿ = aᵐ⁺ⁿ, aᵐ/aⁿ = aᵐ⁻ⁿ, (aᵐ)ⁿ = aᵐⁿ","ru":"aᵐ·aⁿ = aᵐ⁺ⁿ, aᵐ/aⁿ = aᵐ⁻ⁿ, (aᵐ)ⁿ = aᵐⁿ","en":"aᵐ·aⁿ = aᵐ⁺ⁿ, aᵐ/aⁿ = aᵐ⁻ⁿ, (aᵐ)ⁿ = aᵐⁿ"}','{"uz":"Asoslar bir xil bo‘lsa, ko‘paytirishda darajalar qo‘shiladi.","ru":"При одинаковых основаниях показатели складываются.","en":"With equal bases, exponents add when multiplying."}','{"uz":"2³·2⁴ = 2⁷ = 128","ru":"2³·2⁴ = 2⁷ = 128","en":"2³·2⁴ = 2⁷ = 128"}','easy',7),
  ('algebra',8,'{"uz":"Foiz formulasi","ru":"Формула процента","en":"Percent formula"}','{"uz":"qism = butun · foiz / 100","ru":"часть = целое · процент / 100","en":"part = whole · percent / 100"}','{"uz":"Foizni topish uchun butunni foizga ko‘paytirib 100 ga bo‘lamiz.","ru":"Умножьте целое на процент и разделите на 100.","en":"Multiply the whole by the percent and divide by 100."}','{"uz":"300 ning 15% i = 45","ru":"15% от 300 = 45","en":"15% of 300 = 45"}','easy',8),

  ('geometry',1,'{"uz":"To‘g‘ri to‘rtburchak yuzi","ru":"Площадь прямоугольника","en":"Rectangle area"}','{"uz":"S = a · b","ru":"S = a · b","en":"S = a · b"}','{"uz":"Qo‘shni tomonlar ko‘paytmasi.","ru":"Произведение смежных сторон.","en":"Product of adjacent sides."}','{"uz":"a = 4, b = 6 → S = 24","ru":"a = 4, b = 6 → S = 24","en":"a = 4, b = 6 → S = 24"}','easy',1),
  ('geometry',2,'{"uz":"Uchburchak yuzi","ru":"Площадь треугольника","en":"Triangle area"}','{"uz":"S = ½ · a · h","ru":"S = ½ · a · h","en":"S = ½ · a · h"}','{"uz":"Asos va unga tushirilgan balandlik ko‘paytmasining yarmi.","ru":"Половина произведения основания на высоту.","en":"Half the product of a base and its height."}','{"uz":"a = 8, h = 5 → S = 20","ru":"a = 8, h = 5 → S = 20","en":"a = 8, h = 5 → S = 20"}','easy',2),
  ('geometry',3,'{"uz":"Aylana uzunligi","ru":"Длина окружности","en":"Circumference"}','{"uz":"C = 2πr","ru":"C = 2πr","en":"C = 2πr"}','{"uz":"Radius orqali aylana uzunligi.","ru":"Длина окружности через радиус.","en":"Circumference using the radius."}','{"uz":"r = 3 → C = 6π","ru":"r = 3 → C = 6π","en":"r = 3 → C = 6π"}','easy',3),
  ('geometry',4,'{"uz":"Doira yuzi","ru":"Площадь круга","en":"Circle area"}','{"uz":"S = πr²","ru":"S = πr²","en":"S = πr²"}','{"uz":"Radius kvadrati π ga ko‘paytiriladi.","ru":"Квадрат радиуса умножается на π.","en":"The squared radius multiplied by π."}','{"uz":"r = 2 → S = 4π","ru":"r = 2 → S = 4π","en":"r = 2 → S = 4π"}','easy',4),
  ('geometry',5,'{"uz":"Pifagor teoremasi","ru":"Теорема Пифагора","en":"Pythagorean theorem"}','{"uz":"c² = a² + b²","ru":"c² = a² + b²","en":"c² = a² + b²"}','{"uz":"To‘g‘ri burchakli uchburchakda gipotenuza kvadrati katetlar kvadratlari yig‘indisiga teng.","ru":"В прямоугольном треугольнике квадрат гипотенузы равен сумме квадратов катетов.","en":"In a right triangle the hypotenuse squared equals the sum of the leg squares."}','{"uz":"3² + 4² = 5²","ru":"3² + 4² = 5²","en":"3² + 4² = 5²"}','easy',5),
  ('geometry',6,'{"uz":"Kub hajmi","ru":"Объём куба","en":"Cube volume"}','{"uz":"V = a³","ru":"V = a³","en":"V = a³"}','{"uz":"Qirra uzunligining kubi.","ru":"Куб длины ребра.","en":"Cube of the edge length."}','{"uz":"a = 3 → V = 27","ru":"a = 3 → V = 27","en":"a = 3 → V = 27"}','easy',6),
  ('geometry',7,'{"uz":"Silindr hajmi","ru":"Объём цилиндра","en":"Cylinder volume"}','{"uz":"V = πr²h","ru":"V = πr²h","en":"V = πr²h"}','{"uz":"Asos yuzi radius orqali topiladi va balandlikka ko‘paytiriladi.","ru":"Площадь основания умножается на высоту.","en":"Base area multiplied by height."}','{"uz":"r = 2, h = 5 → V = 20π","ru":"r = 2, h = 5 → V = 20π","en":"r = 2, h = 5 → V = 20π"}','medium',7),
  ('geometry',8,'{"uz":"To‘rtburchakli parallelepiped hajmi","ru":"Объём прямоугольного параллелепипеда","en":"Cuboid volume"}','{"uz":"V = a · b · c","ru":"V = a · b · c","en":"V = a · b · c"}','{"uz":"Uch o‘lcham ko‘paytmasi.","ru":"Произведение трёх измерений.","en":"Product of the three dimensions."}','{"uz":"2 · 3 · 4 = 24","ru":"2 · 3 · 4 = 24","en":"2 · 3 · 4 = 24"}','easy',8),

  ('dtm',1,'{"uz":"O‘rta arifmetik","ru":"Среднее арифметическое","en":"Arithmetic mean"}','{"uz":"(a₁ + a₂ + … + aₙ) / n","ru":"(a₁ + a₂ + … + aₙ) / n","en":"(a₁ + a₂ + … + aₙ) / n"}','{"uz":"Yig‘indini sonlar soniga bo‘ling.","ru":"Разделите сумму на количество чисел.","en":"Divide the sum by the count."}','{"uz":"2, 4, 9 → 15/3 = 5","ru":"2, 4, 9 → 15/3 = 5","en":"2, 4, 9 → 15/3 = 5"}','easy',1),
  ('dtm',2,'{"uz":"Foiz o‘zgarishi","ru":"Изменение в процентах","en":"Percent change"}','{"uz":"((yangi − eski) / eski) · 100%","ru":"((новое − старое) / старое) · 100%","en":"((new − old) / old) · 100%"}','{"uz":"O‘sish musbat, kamayish manfiy bo‘ladi.","ru":"Рост положительный, снижение отрицательное.","en":"Growth is positive, decline is negative."}','{"uz":"80 → 100: +25%","ru":"80 → 100: +25%","en":"80 → 100: +25%"}','medium',2),
  ('dtm',3,'{"uz":"Arifmetik progressiya hadi","ru":"Член арифметической прогрессии","en":"Arithmetic sequence term"}','{"uz":"aₙ = a₁ + (n − 1)d","ru":"aₙ = a₁ + (n − 1)d","en":"aₙ = a₁ + (n − 1)d"}','{"uz":"Har bir had oldingisidan d ga farq qiladi.","ru":"Каждый член отличается от предыдущего на d.","en":"Each term differs from the previous by d."}','{"uz":"a₁ = 3, d = 4 → a₅ = 19","ru":"a₁ = 3, d = 4 → a₅ = 19","en":"a₁ = 3, d = 4 → a₅ = 19"}','medium',3),
  ('dtm',4,'{"uz":"Geometrik progressiya hadi","ru":"Член геометрической прогрессии","en":"Geometric sequence term"}','{"uz":"bₙ = b₁ · qⁿ⁻¹","ru":"bₙ = b₁ · qⁿ⁻¹","en":"bₙ = b₁ · qⁿ⁻¹"}','{"uz":"Har bir had oldingisidan q marta katta.","ru":"Каждый член в q раз больше предыдущего.","en":"Each term is q times the previous."}','{"uz":"b₁ = 2, q = 3 → b₄ = 54","ru":"b₁ = 2, q = 3 → b₄ = 54","en":"b₁ = 2, q = 3 → b₄ = 54"}','medium',4),
  ('dtm',5,'{"uz":"Ehtimollik","ru":"Вероятность","en":"Probability"}','{"uz":"P = qulay natijalar / barcha natijalar","ru":"P = благоприятные / все исходы","en":"P = favorable / total outcomes"}','{"uz":"Barcha natijalar teng imkoniyatli bo‘lishi kerak.","ru":"Все исходы должны быть равновозможными.","en":"All outcomes must be equally likely."}','{"uz":"Kubda juft son: 3/6 = 0,5","ru":"Чётное на кубике: 3/6 = 0,5","en":"Even on a die: 3/6 = 0.5"}','medium',5),

  ('sat',1,'{"uz":"Chiziqli funksiya","ru":"Линейная функция","en":"Linear function"}','{"uz":"y = mx + b","ru":"y = mx + b","en":"y = mx + b"}','{"uz":"m — qiyalik, b — y o‘qidagi kesishma.","ru":"m — наклон, b — пересечение с осью y.","en":"m is the slope, b is the y-intercept."}','{"uz":"y = 2x + 1 → qiyalik 2","ru":"y = 2x + 1 → наклон 2","en":"y = 2x + 1 → slope 2"}','easy',1),
  ('sat',2,'{"uz":"Qiyalik formulasi","ru":"Формула наклона","en":"Slope formula"}','{"uz":"m = (y₂ − y₁) / (x₂ − x₁)","ru":"m = (y₂ − y₁) / (x₂ − x₁)","en":"m = (y₂ − y₁) / (x₂ − x₁)"}','{"uz":"Ikki nuqta orqali o‘tuvchi to‘g‘ri chiziq qiyaligi.","ru":"Наклон прямой через две точки.","en":"Slope of the line through two points."}','{"uz":"(1,2) va (3,6) → m = 2","ru":"(1,2) и (3,6) → m = 2","en":"(1,2) and (3,6) → m = 2"}','easy',2),
  ('sat',3,'{"uz":"Kvadrat funksiya uchi","ru":"Вершина параболы","en":"Parabola vertex"}','{"uz":"x = −b / 2a","ru":"x = −b / 2a","en":"x = −b / 2a"}','{"uz":"y = ax² + bx + c parabola uchi abssissasi.","ru":"Абсцисса вершины y = ax² + bx + c.","en":"The x-coordinate of the vertex of y = ax² + bx + c."}','{"uz":"y = x² − 4x → x = 2","ru":"y = x² − 4x → x = 2","en":"y = x² − 4x → x = 2"}','medium',3),
  ('sat',4,'{"uz":"Aylana tenglamasi","ru":"Уравнение окружности","en":"Circle equation"}','{"uz":"(x − h)² + (y − k)² = r²","ru":"(x − h)² + (y − k)² = r²","en":"(x − h)² + (y − k)² = r²"}','{"uz":"Markaz (h, k), radius r.","ru":"Центр (h, k), радиус r.","en":"Center (h, k), radius r."}','{"uz":"(x − 1)² + y² = 9 → r = 3","ru":"(x − 1)² + y² = 9 → r = 3","en":"(x − 1)² + y² = 9 → r = 3"}','medium',4),
  ('sat',5,'{"uz":"Foizdan kasrga o‘tish","ru":"Процент в дробь","en":"Percent to fraction"}','{"uz":"p% = p / 100","ru":"p% = p / 100","en":"p% = p / 100"}','{"uz":"25% = 0,25 = 1/4.","ru":"25% = 0,25 = 1/4.","en":"25% = 0.25 = 1/4."}','{"uz":"40% = 0,4 = 2/5","ru":"40% = 0,4 = 2/5","en":"40% = 0.4 = 2/5"}','easy',5),

  ('english',1,'{"uz":"“Improve” so‘zining ma’nosi","ru":"Значение слова “improve”","en":"Meaning of “improve”"}','{"uz":"yaxshilash, rivojlantirish","ru":"улучшать, совершенствовать","en":"to make better"}','{"uz":"Fe’l sifatida sifatni oshirishni bildiradi.","ru":"Глагол, означающий повышение качества.","en":"A verb meaning to raise quality."}','{"uz":"Practice improves your score.","ru":"Практика улучшает результат.","en":"Practice improves your score."}','easy',1),
  ('english',2,'{"uz":"“In spite of” qanday qo‘llanadi?","ru":"Как используется “in spite of”?","en":"How is “in spite of” used?"}','{"uz":"Ot yoki gerund bilan: in spite of the rain","ru":"С существительным или герундием: in spite of the rain","en":"With a noun or gerund: in spite of the rain"}','{"uz":"Ma’no jihatidan “although” ga yaqin, lekin grammatikasi farq qiladi.","ru":"По смыслу близко к “although”, но грамматика отличается.","en":"Similar in meaning to “although”, but the grammar differs."}','{"uz":"In spite of the rain, we studied.","ru":"In spite of the rain, we studied.","en":"In spite of the rain, we studied."}','medium',2),
  ('english',3,'{"uz":"Present Perfect qachon ishlatiladi?","ru":"Когда используется Present Perfect?","en":"When is Present Perfect used?"}','{"uz":"O‘tmishda boshlanib, hozirga aloqador holatlar uchun","ru":"Для действий, связанных с настоящим","en":"For past actions connected to the present"}','{"uz":"Shakli: have/has + V3.","ru":"Форма: have/has + V3.","en":"Form: have/has + past participle."}','{"uz":"I have finished my homework.","ru":"I have finished my homework.","en":"I have finished my homework."}','medium',3),
  ('english',4,'{"uz":"“Advice” va “advise” farqi","ru":"Разница между “advice” и “advise”","en":"Difference between “advice” and “advise”"}','{"uz":"advice — ot, advise — fe’l","ru":"advice — существительное, advise — глагол","en":"advice is a noun, advise is a verb"}','{"uz":"Talaffuzi ham farq qiladi: /ədˈvaɪs/ va /ədˈvaɪz/.","ru":"Произношение тоже отличается: /ədˈvaɪs/ и /ədˈvaɪz/.","en":"Pronunciation differs too: /ədˈvaɪs/ and /ədˈvaɪz/."}','{"uz":"She gave me good advice.","ru":"She gave me good advice.","en":"She gave me good advice."}','easy',4),
  ('english',5,'{"uz":"“Used to” nimani bildiradi?","ru":"Что означает “used to”?","en":"What does “used to” mean?"}','{"uz":"O‘tmishdagi odat yoki holat","ru":"Привычка или состояние в прошлом","en":"A past habit or state"}','{"uz":"Hozir davom etmayotgan o‘tmish odati.","ru":"Привычка в прошлом, не продолжающаяся сейчас.","en":"A past habit that no longer continues."}','{"uz":"I used to walk to school.","ru":"I used to walk to school.","en":"I used to walk to school."}','medium',5)
) as v(subject, position, front, back, explanation, example, difficulty, unused)
  on d.subject = v.subject
where d.status = 'published'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Admin permissions & row level security
-- ---------------------------------------------------------------------------
update admin_roles set permissions = permissions || '["edtech.read","edtech.write"]'::jsonb where key = 'content_manager';
update admin_roles set permissions = permissions || '["edtech.read"]'::jsonb where key in ('analyst','exam_manager');

do $$
declare t text;
begin
  foreach t in array array[
    'edtech_settings','daily_missions','user_daily_missions','user_streaks',
    'user_streak_rewards','learning_activity','leaderboard_snapshots',
    'flashcard_decks','flashcards','user_flashcard_progress',
    'user_flashcard_favorites','user_mistakes','mistake_review_history',
    'learning_analytics','weekly_reports','recommendation_history'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon,authenticated', t);
  end loop;
end $$;
