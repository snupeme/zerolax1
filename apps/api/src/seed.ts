import {
  addHours,
  addDaysToDateString,
  tashkentDateString,
  tashkentPublishInstant,
  type Difficulty,
} from '@zerolax/shared';
import { createDb, runMigrations, type Db, type Queryable } from '@zerolax/db';
import { loadConfig } from './config';
import { bootstrapAdmin } from './services/admin';

interface Tri {
  uz: string;
  ru: string;
  en: string;
}

interface SeedQuestion {
  text: Tri;
  options: Tri[];
  correct: number;
  difficulty: Difficulty;
  coins: number;
  explanation: Tri;
}

function tri(uz: string, ru: string, en: string): Tri {
  return { uz, ru, en };
}

const option = (value: string): Tri => tri(value, value, value);

const IQ_QUESTIONS: SeedQuestion[] = [
  {
    text: tri(
      'Ketma-ketlikdagi keyingi sonni toping: 2, 6, 12, 20, 30, ?',
      'Найдите следующее число в последовательности: 2, 6, 12, 20, 30, ?',
      'Find the next number in the sequence: 2, 6, 12, 20, 30, ?',
    ),
    options: [option('36'), option('40'), option('42'), option('48')],
    correct: 2,
    difficulty: 'easy',
    coins: 1,
    explanation: tri(
      "Har bir had n × (n + 1) ko'rinishida: 1×2=2, 2×3=6, 3×4=12, 4×5=20, 5×6=30, 6×7=42.",
      'Каждый член имеет вид n × (n + 1): 1×2=2, 2×3=6, 3×4=12, 4×5=20, 5×6=30, 6×7=42.',
      'Each term equals n × (n + 1): 1×2=2, 2×3=6, 3×4=12, 4×5=20, 5×6=30, 6×7=42.',
    ),
  },
  {
    text: tri(
      "5 ta mashina 5 daqiqada 5 ta detal ishlab chiqaradi. 100 ta mashina 100 ta detalni necha daqiqada ishlab chiqaradi?",
      '5 машин производят 5 деталей за 5 минут. За сколько минут 100 машин произведут 100 деталей?',
      '5 machines produce 5 parts in 5 minutes. How many minutes do 100 machines need to produce 100 parts?',
    ),
    options: [option('5'), option('20'), option('100'), option('1')],
    correct: 0,
    difficulty: 'medium',
    coins: 2,
    explanation: tri(
      'Bitta mashina 5 daqiqada bitta detal ishlab chiqaradi. Demak, 100 ta mashina 100 ta detalni ham 5 daqiqada ishlab chiqaradi.',
      'Одна машина делает одну деталь за 5 минут. Значит, 100 машин сделают 100 деталей за те же 5 минут.',
      'One machine makes one part in 5 minutes, so 100 machines make 100 parts in the same 5 minutes.',
    ),
  },
  {
    text: tri(
      'Ketma-ketlikni davom ettiring: 3, 9, 27, 81, ?',
      'Продолжите последовательность: 3, 9, 27, 81, ?',
      'Continue the sequence: 3, 9, 27, 81, ?',
    ),
    options: [option('162'), option('243'), option('324'), option('729')],
    correct: 1,
    difficulty: 'easy',
    coins: 1,
    explanation: tri(
      'Har bir son oldingisidan 3 marta katta: 3×3=9, 9×3=27, 27×3=81, 81×3=243.',
      'Каждое число в 3 раза больше предыдущего: 3×3=9, 9×3=27, 27×3=81, 81×3=243.',
      'Each number is three times the previous one: 3×3=9, 9×3=27, 27×3=81, 81×3=243.',
    ),
  },
  {
    text: tri(
      "100 000 so'mlik ko'ylak avval 20%, so'ngra chegirmali narxdan yana 10% chegirma oldi. Yakuniy narx qancha?",
      'Рубашка за 100 000 сум сначала подешевела на 20%, затем ещё на 10% от новой цены. Какова итоговая цена?',
      'A shirt costing 100,000 soʻm is discounted by 20%, then by another 10% of the discounted price. What is the final price?',
    ),
    options: [option('68 000'), option('70 000'), option('72 000'), option('75 000')],
    correct: 2,
    difficulty: 'medium',
    coins: 2,
    explanation: tri(
      "20% chegirmadan keyin narx 80 000 so'm. 80 000 ning 10% i 8 000, demak yakuniy narx 72 000 so'm.",
      'После скидки 20% цена равна 80 000 сум. 10% от 80 000 — это 8 000, итоговая цена 72 000 сум.',
      'After the 20% discount the price is 80,000. 10% of 80,000 is 8,000, so the final price is 72,000.',
    ),
  },
  {
    text: tri(
      'Yetishmayotgan sonni toping: 1, 4, 9, 16, ?, 36',
      'Найдите пропущенное число: 1, 4, 9, 16, ?, 36',
      'Find the missing number: 1, 4, 9, 16, ?, 36',
    ),
    options: [option('20'), option('24'), option('25'), option('30')],
    correct: 2,
    difficulty: 'easy',
    coins: 1,
    explanation: tri(
      'Bu ketma-ketlik kvadratlardan iborat: 1², 2², 3², 4², 5², 6². Demak, javob 25.',
      'Это последовательность квадратов: 1², 2², 3², 4², 5², 6². Ответ — 25.',
      'These are perfect squares: 1², 2², 3², 4², 5², 6². The answer is 25.',
    ),
  },
  {
    text: tri(
      'Poyezd 240 km masofani 3 soatda bosib o‘tdi. Xuddi shu tezlikda u 5 soatda necha km yuradi?',
      'Поезд прошёл 240 км за 3 часа. Какое расстояние он пройдёт за 5 часов при той же скорости?',
      'A train travels 240 km in 3 hours. At the same speed, how far does it travel in 5 hours?',
    ),
    options: [option('320 km'), option('360 km'), option('400 km'), option('480 km')],
    correct: 2,
    difficulty: 'easy',
    coins: 1,
    explanation: tri(
      'Tezlik 240 ÷ 3 = 80 km/soat. 5 soatda 80 × 5 = 400 km.',
      'Скорость равна 240 ÷ 3 = 80 км/ч. За 5 часов: 80 × 5 = 400 км.',
      'The speed is 240 ÷ 3 = 80 km/h. In 5 hours: 80 × 5 = 400 km.',
    ),
  },
  {
    text: tri(
      "Barcha Zorklar Blin. Hech bir Blin ucha olmaydi. Qaysi xulosa albatta to'g'ri?",
      'Все зорки — блины. Ни один блин не умеет летать. Какой вывод обязательно верен?',
      'All Zorks are Blins. No Blin can fly. Which conclusion must be true?',
    ),
    options: [
      tri('Ba’zi Zorklar ucha oladi', 'Некоторые зорки умеют летать', 'Some Zorks can fly'),
      tri('Hech bir Zork ucha olmaydi', 'Ни один зорк не умеет летать', 'No Zork can fly'),
      tri('Barcha Blinlar Zork', 'Все блины — зорки', 'All Blins are Zorks'),
      tri('Ba’zi Blinlar ucha oladi', 'Некоторые блины умеют летать', 'Some Blins can fly'),
    ],
    correct: 1,
    difficulty: 'medium',
    coins: 2,
    explanation: tri(
      "Zorklar Blinlarning qismi bo'lgani uchun, Blinlarga xos xususiyat (ucha olmaslik) barcha Zorklarga ham tegishli.",
      'Поскольку зорки — подмножество блинов, свойство блинов (не летать) относится и ко всем зоркам.',
      'Because Zorks are a subset of Blins, a property of all Blins (not flying) also applies to every Zork.',
    ),
  },
  {
    text: tri(
      'Harflar ketma-ketligini davom ettiring: A, C, F, J, O, ?',
      'Продолжите последовательность букв: A, C, F, J, O, ?',
      'Continue the letter sequence: A, C, F, J, O, ?',
    ),
    options: [option('T'), option('U'), option('V'), option('W')],
    correct: 1,
    difficulty: 'hard',
    coins: 3,
    explanation: tri(
      "Harflar orasidagi masofa 2, 3, 4, 5, 6 taga oshib boradi: A→C (+2), C→F (+3), F→J (+4), J→O (+5), O→U (+6).",
      'Расстояние между буквами растёт: 2, 3, 4, 5, 6: A→C (+2), C→F (+3), F→J (+4), J→O (+5), O→U (+6).',
      'The gaps grow by 2, 3, 4, 5, 6: A→C (+2), C→F (+3), F→J (+4), J→O (+5), O→U (+6).',
    ),
  },
  {
    text: tri(
      "Barcha yoqlari bo'yalgan kub 27 ta teng kichik kubga bo'lindi. Aynan ikkita yoqi bo'yalgan nechta kichik kub bor?",
      'Куб, окрашенный со всех сторон, разрезали на 27 равных маленьких кубиков. Сколько кубиков имеют ровно две окрашенные грани?',
      'A cube painted on all faces is cut into 27 equal smaller cubes. How many small cubes have exactly two painted faces?',
    ),
    options: [option('6'), option('8'), option('12'), option('24')],
    correct: 2,
    difficulty: 'hard',
    coins: 3,
    explanation: tri(
      "3×3×3 kubda har bir qirraning o'rtasida bittadan kub bor. 12 ta qirra × 1 = 12 ta kub.",
      'В кубе 3×3×3 на каждом ребре есть один средний кубик. 12 рёбер × 1 = 12 кубиков.',
      'In a 3×3×3 cube each edge has one middle cube. 12 edges × 1 = 12 cubes.',
    ),
  },
  {
    text: tri(
      'Bugun chorshanba. 100 kundan keyin haftaning qaysi kuni bo‘ladi?',
      'Сегодня среда. Какой день недели будет через 100 дней?',
      'Today is Wednesday. What day of the week will it be in 100 days?',
    ),
    options: [
      tri('Payshanba', 'Четверг', 'Thursday'),
      tri('Juma', 'Пятница', 'Friday'),
      tri('Shanba', 'Суббота', 'Saturday'),
      tri('Yakshanba', 'Воскресенье', 'Sunday'),
    ],
    correct: 1,
    difficulty: 'medium',
    coins: 2,
    explanation: tri(
      '100 = 14 × 7 + 2. Ikki kun oldinga: chorshanbadan payshanba, keyin juma.',
      '100 = 14 × 7 + 2. Два дня вперёд: со среды на четверг, затем на пятницу.',
      '100 = 14 × 7 + 2. Two days forward from Wednesday: Thursday, then Friday.',
    ),
  },
];

const ENTRANCE_QUESTIONS: SeedQuestion[] = [
  {
    text: tri('2x + 5 = 17 tenglamani yeching.', 'Решите уравнение 2x + 5 = 17.', 'Solve the equation 2x + 5 = 17.'),
    options: [option('4'), option('5'), option('6'), option('7')],
    correct: 2,
    difficulty: 'easy',
    coins: 1,
    explanation: tri('2x = 12, demak x = 6.', '2x = 12, значит x = 6.', '2x = 12, so x = 6.'),
  },
  {
    text: tri('x² − 9 = 0 tenglamaning musbat ildizini toping.', 'Найдите положительный корень уравнения x² − 9 = 0.', 'Find the positive root of x² − 9 = 0.'),
    options: [option('−3'), option('0'), option('3'), option('9')],
    correct: 2,
    difficulty: 'easy',
    coins: 1,
    explanation: tri('x² = 9, musbat ildiz x = 3.', 'x² = 9, положительный корень x = 3.', 'x² = 9, so the positive root is x = 3.'),
  },
  {
    text: tri('(a + b)² − (a − b)² ifodani soddalashtiring.', 'Упростите выражение (a + b)² − (a − b)².', 'Simplify (a + b)² − (a − b)².'),
    options: [option('2ab'), option('4ab'), option('2a² + 2b²'), option('a² − b²')],
    correct: 1,
    difficulty: 'medium',
    coins: 2,
    explanation: tri('(a² + 2ab + b²) − (a² − 2ab + b²) = 4ab.', '(a² + 2ab + b²) − (a² − 2ab + b²) = 4ab.', '(a² + 2ab + b²) − (a² − 2ab + b²) = 4ab.'),
  },
  {
    text: tri('f(x) = 3x − 4 bo‘lsa, f(5) ni toping.', 'Если f(x) = 3x − 4, найдите f(5).', 'If f(x) = 3x − 4, find f(5).'),
    options: [option('7'), option('9'), option('11'), option('15')],
    correct: 2,
    difficulty: 'easy',
    coins: 1,
    explanation: tri('f(5) = 3×5 − 4 = 11.', 'f(5) = 3×5 − 4 = 11.', 'f(5) = 3×5 − 4 = 11.'),
  },
  {
    text: tri('(1, 2) va (3, 8) nuqtalardan o‘tuvchi to‘g‘ri chiziqning burchak koeffitsiyentini toping.', 'Найдите угловой коэффициент прямой, проходящей через точки (1, 2) и (3, 8).', 'Find the slope of the line through (1, 2) and (3, 8).'),
    options: [option('2'), option('3'), option('4'), option('6')],
    correct: 1,
    difficulty: 'medium',
    coins: 2,
    explanation: tri('k = (8 − 2) / (3 − 1) = 6 / 2 = 3.', 'k = (8 − 2) / (3 − 1) = 6 / 2 = 3.', 'm = (8 − 2) / (3 − 1) = 6 / 2 = 3.'),
  },
  {
    text: tri('x² − 5x + 6 = 0 tenglamaning ildizlarini toping.', 'Найдите корни уравнения x² − 5x + 6 = 0.', 'Find the roots of x² − 5x + 6 = 0.'),
    options: [
      tri('−2 va −3', '−2 и −3', '−2 and −3'),
      tri('1 va 6', '1 и 6', '1 and 6'),
      tri('2 va 3', '2 и 3', '2 and 3'),
      tri('−1 va −6', '−1 и −6', '−1 and −6'),
    ],
    correct: 2,
    difficulty: 'easy',
    coins: 1,
    explanation: tri('Viyet teoremasi: yig‘indi 5, ko‘paytma 6. Ildizlar 2 va 3.', 'По теореме Виета сумма 5, произведение 6. Корни 2 и 3.', 'By Vieta, the sum is 5 and the product is 6. The roots are 2 and 3.'),
  },
  {
    text: tri('log₂ 32 ni hisoblang.', 'Вычислите log₂ 32.', 'Evaluate log₂ 32.'),
    options: [option('4'), option('5'), option('6'), option('8')],
    correct: 1,
    difficulty: 'medium',
    coins: 2,
    explanation: tri('2⁵ = 32, demak log₂ 32 = 5.', '2⁵ = 32, значит log₂ 32 = 5.', '2⁵ = 32, so log₂ 32 = 5.'),
  },
  {
    text: tri('Muntazam oltiburchakning ichki burchaklari yig‘indisini toping.', 'Найдите сумму внутренних углов правильного шестиугольника.', 'Find the sum of the interior angles of a regular hexagon.'),
    options: [option('540°'), option('720°'), option('900°'), option('1080°')],
    correct: 1,
    difficulty: 'medium',
    coins: 2,
    explanation: tri('(n − 2) × 180° = (6 − 2) × 180° = 720°.', '(n − 2) × 180° = (6 − 2) × 180° = 720°.', '(n − 2) × 180° = (6 − 2) × 180° = 720°.'),
  },
  {
    text: tri('Asosi 10, balandligi 6 bo‘lgan uchburchakning yuzini toping.', 'Найдите площадь треугольника с основанием 10 и высотой 6.', 'Find the area of a triangle with base 10 and height 6.'),
    options: [option('16'), option('30'), option('60'), option('80')],
    correct: 1,
    difficulty: 'easy',
    coins: 1,
    explanation: tri('S = (1/2) × 10 × 6 = 30.', 'S = (1/2) × 10 × 6 = 30.', 'A = (1/2) × 10 × 6 = 30.'),
  },
  {
    text: tri('Radiusi 7 bo‘lgan aylana uzunligini toping (π ≈ 22/7).', 'Найдите длину окружности радиуса 7 (π ≈ 22/7).', 'Find the circumference of a circle with radius 7 (π ≈ 22/7).'),
    options: [option('22'), option('44'), option('49'), option('154')],
    correct: 1,
    difficulty: 'medium',
    coins: 2,
    explanation: tri('C = 2πr = 2 × (22/7) × 7 = 44.', 'C = 2πr = 2 × (22/7) × 7 = 44.', 'C = 2πr = 2 × (22/7) × 7 = 44.'),
  },
  {
    text: tri('240 ning 3/4 qismini toping.', 'Найдите 3/4 от 240.', 'Find 3/4 of 240.'),
    options: [option('160'), option('180'), option('200'), option('240')],
    correct: 1,
    difficulty: 'easy',
    coins: 1,
    explanation: tri('240 ÷ 4 = 60, 60 × 3 = 180.', '240 ÷ 4 = 60, 60 × 3 = 180.', '240 ÷ 4 = 60, 60 × 3 = 180.'),
  },
  {
    text: tri('2ˣ = 16 bo‘lsa, x ni toping.', 'Если 2ˣ = 16, найдите x.', 'If 2ˣ = 16, find x.'),
    options: [option('2'), option('3'), option('4'), option('8')],
    correct: 2,
    difficulty: 'easy',
    coins: 1,
    explanation: tri('2⁴ = 16, demak x = 4.', '2⁴ = 16, значит x = 4.', '2⁴ = 16, so x = 4.'),
  },
  {
    text: tri('Ketma-ketlikni davom ettiring: 5, 11, 23, 47, ?', 'Продолжите последовательность: 5, 11, 23, 47, ?', 'Continue the sequence: 5, 11, 23, 47, ?'),
    options: [option('71'), option('83'), option('95'), option('99')],
    correct: 2,
    difficulty: 'medium',
    coins: 2,
    explanation: tri('Har bir son oldingisining 2 barobaridan 1 ko‘p: 5×2+1=11, 11×2+1=23, 23×2+1=47, 47×2+1=95.', 'Каждое число равно предыдущему, умноженному на 2, плюс 1: 5×2+1=11, 11×2+1=23, 23×2+1=47, 47×2+1=95.', 'Each term is twice the previous plus one: 5×2+1=11, 11×2+1=23, 23×2+1=47, 47×2+1=95.'),
  },
  {
    text: tri('Adolatli tanga ikki marta tashlandi. Ikki marta ham gerb tushish ehtimoli qanday?', 'Монету подбросили дважды. Какова вероятность, что оба раза выпадет орёл?', 'A fair coin is tossed twice. What is the probability of getting heads both times?'),
    options: [option('1/2'), option('1/3'), option('1/4'), option('3/4')],
    correct: 2,
    difficulty: 'medium',
    coins: 2,
    explanation: tri('Har bir tashlash ehtimoli 1/2. Ikki marta: 1/2 × 1/2 = 1/4.', 'Вероятность каждого броска 1/2. Дважды: 1/2 × 1/2 = 1/4.', 'Each toss has probability 1/2. Twice: 1/2 × 1/2 = 1/4.'),
  },
  {
    text: tri('(x³)² ifodani soddalashtiring.', 'Упростите выражение (x³)².', 'Simplify (x³)².'),
    options: [option('x⁵'), option('x⁶'), option('x⁹'), option('x²')],
    correct: 1,
    difficulty: 'easy',
    coins: 1,
    explanation: tri('Darajani darajaga ko‘tarishda ko‘rsatkichlar ko‘paytiriladi: 3 × 2 = 6.', 'При возведении степени в степень показатели перемножаются: 3 × 2 = 6.', 'When raising a power to a power, multiply the exponents: 3 × 2 = 6.'),
  },
  {
    text: tri('To‘g‘ri to‘rtburchakning perimetri 30, eni 6. Uning bo‘yini toping.', 'Периметр прямоугольника равен 30, ширина 6. Найдите его длину.', 'A rectangle has perimeter 30 and width 6. Find its length.'),
    options: [option('6'), option('8'), option('9'), option('12')],
    correct: 2,
    difficulty: 'medium',
    coins: 2,
    explanation: tri('P = 2(a + b), 30 = 2(a + 6), a + 6 = 15, a = 9.', 'P = 2(a + b), 30 = 2(a + 6), a + 6 = 15, a = 9.', 'P = 2(l + w), 30 = 2(l + 6), l + 6 = 15, l = 9.'),
  },
  {
    text: tri('3, 7, 9, 12, 15 sonlarining medianasini toping.', 'Найдите медиану чисел 3, 7, 9, 12, 15.', 'Find the median of 3, 7, 9, 12, 15.'),
    options: [option('7'), option('9'), option('12'), option('15')],
    correct: 1,
    difficulty: 'easy',
    coins: 1,
    explanation: tri('Tartiblangan qatorda o‘rtadagi son — 9.', 'В упорядоченном ряду среднее число — 9.', 'The middle value of the ordered list is 9.'),
  },
  {
    text: tri('(x + 2)(x − 3) ko‘paytmani oching.', 'Раскройте скобки (x + 2)(x − 3).', 'Expand (x + 2)(x − 3).'),
    options: [option('x² − x − 6'), option('x² + x − 6'), option('x² − 5x − 6'), option('x² − 6')],
    correct: 0,
    difficulty: 'medium',
    coins: 2,
    explanation: tri('x² − 3x + 2x − 6 = x² − x − 6.', 'x² − 3x + 2x − 6 = x² − x − 6.', 'x² − 3x + 2x − 6 = x² − x − 6.'),
  },
  {
    text: tri('48 va 180 sonlarining eng katta umumiy bo‘luvchisini toping.', 'Найдите наибольший общий делитель чисел 48 и 180.', 'Find the greatest common divisor of 48 and 180.'),
    options: [option('6'), option('12'), option('24'), option('36')],
    correct: 1,
    difficulty: 'medium',
    coins: 2,
    explanation: tri('48 = 2⁴×3, 180 = 2²×3²×5. Umumiy qism 2²×3 = 12.', '48 = 2⁴×3, 180 = 2²×3²×5. Общая часть 2²×3 = 12.', '48 = 2⁴×3, 180 = 2²×3²×5. The common part is 2²×3 = 12.'),
  },
  {
    text: tri('Qirrasi 4 bo‘lgan kubning hajmini toping.', 'Найдите объём куба с ребром 4.', 'Find the volume of a cube with edge 4.'),
    options: [option('16'), option('32'), option('64'), option('128')],
    correct: 2,
    difficulty: 'easy',
    coins: 1,
    explanation: tri('V = a³ = 4³ = 64.', 'V = a³ = 4³ = 64.', 'V = a³ = 4³ = 64.'),
  },
];

interface QuestionTableConfig {
  questions: string;
  options: string;
}

const IQ_TABLES: QuestionTableConfig = {
  questions: 'iq_questions',
  options: 'iq_question_options',
};

const ENTRANCE_TABLES: QuestionTableConfig = {
  questions: 'entrance_questions',
  options: 'entrance_question_options',
};

async function insertQuestions(
  tx: Queryable,
  tables: QuestionTableConfig,
  testId: string,
  questions: SeedQuestion[],
): Promise<void> {
  for (let index = 0; index < questions.length; index++) {
    const question = questions[index];
    const inserted = await tx.query<{ id: string }>(
      `insert into ${tables.questions}
        (test_id, position, text_uz, text_ru, text_en,
         explanation_uz, explanation_ru, explanation_en,
         difficulty, coins, correct_option_index)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning id`,
      [
        testId,
        index + 1,
        question.text.uz,
        question.text.ru,
        question.text.en,
        question.explanation.uz,
        question.explanation.ru,
        question.explanation.en,
        question.difficulty,
        question.coins,
        question.correct,
      ],
    );
    const questionId = inserted[0].id;
    for (let optionIndex = 0; optionIndex < question.options.length; optionIndex++) {
      const option = question.options[optionIndex];
      await tx.query(
        `insert into ${tables.options} (question_id, position, text_uz, text_ru, text_en)
         values ($1, $2, $3, $4, $5)`,
        [questionId, optionIndex, option.uz, option.ru, option.en],
      );
    }
  }
}

async function seedAchievements(db: Db): Promise<void> {
  const achievements = [
    {
      code: 'first_test',
      uz: 'Birinchi qadam',
      ru: 'Первый шаг',
      en: 'First step',
      duz: 'Birinchi testingizni yakunladingiz.',
      dru: 'Вы завершили свой первый тест.',
      den: 'You completed your first test.',
      icon: 'sparkles',
      reward: 5,
    },
    {
      code: 'iq_5',
      uz: 'IQ izlanuvchisi',
      ru: 'IQ-исследователь',
      en: 'IQ explorer',
      duz: '5 ta kunlik IQ testini yakunladingiz.',
      dru: 'Вы завершили 5 ежедневных IQ-тестов.',
      den: 'You completed 5 daily IQ tests.',
      icon: 'brain',
      reward: 20,
    },
    {
      code: 'iq_perfect',
      uz: 'Mukammal IQ',
      ru: 'Идеальный IQ',
      en: 'Perfect IQ',
      duz: 'Kunlik IQ testida barcha savollarga to‘g‘ri javob berdingiz.',
      dru: 'Вы ответили правильно на все вопросы ежедневного IQ-теста.',
      den: 'You answered every daily IQ question correctly.',
      icon: 'crown',
      reward: 30,
    },
    {
      code: 'entrance_3',
      uz: 'Sinov ustasi',
      ru: 'Мастер испытаний',
      en: 'Exam master',
      duz: '3 ta kirish testini yakunladingiz.',
      dru: 'Вы завершили 3 вступительных теста.',
      den: 'You completed 3 entrance tests.',
      icon: 'graduation-cap',
      reward: 25,
    },
    {
      code: 'entrance_perfect',
      uz: 'Mukammal natija',
      ru: 'Идеальный результат',
      en: 'Perfect score',
      duz: 'Kirish testida barcha savollarga to‘g‘ri javob berdingiz.',
      dru: 'Вы ответили правильно на все вопросы вступительного теста.',
      den: 'You answered every entrance test question correctly.',
      icon: 'trophy',
      reward: 40,
    },
    {
      code: 'coins_100',
      uz: '100 coin',
      ru: '100 монет',
      en: '100 coins',
      duz: '100 coin ishladingiz.',
      dru: 'Вы заработали 100 монет.',
      den: 'You earned 100 coins.',
      icon: 'coins',
      reward: 10,
    },
  ];

  for (const achievement of achievements) {
    await db.query(
      `insert into achievements
        (code, title_uz, title_ru, title_en, description_uz, description_ru, description_en, icon, coin_reward)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (code) do nothing`,
      [
        achievement.code,
        achievement.uz,
        achievement.ru,
        achievement.en,
        achievement.duz,
        achievement.dru,
        achievement.den,
        achievement.icon,
        achievement.reward,
      ],
    );
  }
}

async function seedGifts(db: Db): Promise<void> {
  const existing = await db.query('select 1 from gifts limit 1');
  if (existing.length > 0) return;

  const gifts = [
    {
      titleUz: 'ZEROLAX stikerlar to‘plami',
      titleRu: 'Набор стикеров ZEROLAX',
      titleEn: 'ZEROLAX sticker pack',
      descUz: 'Telegram uchun eksklyuziv ZEROLAX stikerlari.',
      descRu: 'Эксклюзивные стикеры ZEROLAX для Telegram.',
      descEn: 'Exclusive ZEROLAX stickers for Telegram.',
      price: 150,
    },
    {
      titleUz: 'Premium profil ramkasi',
      titleRu: 'Премиальная рамка профиля',
      titleEn: 'Premium profile frame',
      descUz: 'Profilingizni alohida ko‘rinish bilan ajratib turing.',
      descRu: 'Выделите профиль особым оформлением.',
      descEn: 'Stand out with a distinctive profile frame.',
      price: 400,
    },
    {
      titleUz: 'ZEROLAX sertifikati',
      titleRu: 'Сертификат ZEROLAX',
      titleEn: 'ZEROLAX certificate',
      descUz: 'Faolligingizni tasdiqlovchi raqamli sertifikat.',
      descRu: 'Цифровой сертификат, подтверждающий вашу активность.',
      descEn: 'A digital certificate recognising your activity.',
      price: 1000,
    },
  ];

  for (const gift of gifts) {
    await db.query(
      `insert into gifts (title_uz, title_ru, title_en, description_uz, description_ru, description_en, price)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        gift.titleUz,
        gift.titleRu,
        gift.titleEn,
        gift.descUz,
        gift.descRu,
        gift.descEn,
        gift.price,
      ],
    );
  }
}

async function seedIqTests(db: Db): Promise<void> {
  const now = new Date();
  const today = tashkentDateString(now);
  const yesterday = addDaysToDateString(today, -1);
  const tomorrow = addDaysToDateString(today, 1);
  const dayAfter = addDaysToDateString(today, 2);
  const threeDays = addDaysToDateString(today, 3);
  const todayPublish = tashkentPublishInstant(today);
  const todayIsPublished = now.getTime() >= todayPublish.getTime();

  const plans: Array<{
    date: string;
    status: 'published' | 'scheduled' | 'draft';
    publishedAt: Date | null;
    releaseAt: Date | null;
  }> = [
    {
      date: yesterday,
      status: 'published',
      publishedAt: tashkentPublishInstant(yesterday),
      releaseAt: addHours(tashkentPublishInstant(yesterday), 24),
    },
    {
      date: today,
      status: todayIsPublished ? 'published' : 'scheduled',
      publishedAt: todayIsPublished ? todayPublish : null,
      releaseAt: todayIsPublished ? addHours(todayPublish, 24) : null,
    },
    { date: tomorrow, status: 'scheduled', publishedAt: null, releaseAt: null },
    { date: dayAfter, status: 'draft', publishedAt: null, releaseAt: null },
    { date: threeDays, status: 'draft', publishedAt: null, releaseAt: null },
  ];

  for (const plan of plans) {
    const existing = await db.query<{ id: string }>(
      'select id from daily_iq_tests where test_date = $1',
      [plan.date],
    );
    let testId = existing[0]?.id;

    if (!testId) {
      const inserted = await db.query<{ id: string }>(
        `insert into daily_iq_tests
          (test_date, title_uz, title_ru, title_en, status, publish_at, published_at, release_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          plan.date,
          `Kunlik IQ testi — ${plan.date}`,
          `Ежедневный IQ-тест — ${plan.date}`,
          `Daily IQ Test — ${plan.date}`,
          plan.status,
          tashkentPublishInstant(plan.date).toISOString(),
          plan.publishedAt?.toISOString() ?? null,
          plan.releaseAt?.toISOString() ?? null,
        ],
      );
      testId = inserted[0].id;
    }

    const [count] = await db.query<{ count: number }>(
      'select count(*)::int as count from iq_questions where test_id = $1',
      [testId],
    );
    if (Number(count?.count ?? 0) === 0) {
      await db.transaction(async (tx) => {
        await insertQuestions(tx, IQ_TABLES, testId!, IQ_QUESTIONS);
      });
    }
    console.log(`[seed] IQ test ${plan.date}: ${plan.status}`);
  }
}

async function seedEntranceTests(db: Db): Promise<void> {
  const definitions = [
    {
      slug: 'dtm-matematika-1',
      titleUz: 'DTM matematika — 1-sinov',
      titleRu: 'DTM математика — тест 1',
      titleEn: 'DTM Mathematics — Test 1',
      descUz: 'Algebra va geometriya bo‘yicha DTM uslubidagi 20 savollik sinov.',
      descRu: '20 вопросов в стиле DTM по алгебре и геометрии.',
      descEn: 'A 20-question DTM-style test covering algebra and geometry.',
      duration: 1800,
    },
    {
      slug: 'dtm-matematika-2',
      titleUz: 'DTM matematika — 2-sinov',
      titleRu: 'DTM математика — тест 2',
      titleEn: 'DTM Mathematics — Test 2',
      descUz: 'Murakkabroq savollar bilan 20 savollik kirish sinovi.',
      descRu: 'Вступительный тест из 20 вопросов с более сложными заданиями.',
      descEn: 'A 20-question entrance test with more challenging problems.',
      duration: 2400,
    },
  ];

  for (const definition of definitions) {
    const existing = await db.query<{ id: string }>(
      'select id from entrance_tests where slug = $1',
      [definition.slug],
    );
    let testId = existing[0]?.id;

    if (!testId) {
      const inserted = await db.query<{ id: string }>(
        `insert into entrance_tests
          (slug, title_uz, title_ru, title_en, description_uz, description_ru, description_en,
           subject, difficulty, duration_seconds, status, published_at)
         values ($1, $2, $3, $4, $5, $6, $7, 'Mathematics', 'medium', $8, 'published', now())
         returning id`,
        [
          definition.slug,
          definition.titleUz,
          definition.titleRu,
          definition.titleEn,
          definition.descUz,
          definition.descRu,
          definition.descEn,
          definition.duration,
        ],
      );
      testId = inserted[0].id;
    }

    const [count] = await db.query<{ count: number }>(
      'select count(*)::int as count from entrance_questions where test_id = $1',
      [testId],
    );
    if (Number(count?.count ?? 0) === 0) {
      await db.transaction(async (tx) => {
        await insertQuestions(tx, ENTRANCE_TABLES, testId!, ENTRANCE_QUESTIONS);
      });
    }
    console.log(`[seed] entrance test ${definition.slug}: published`);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await createDb({
    databaseUrl: config.databaseUrl,
    ssl: config.databaseSsl,
    pgliteDir: config.pgliteDir,
  });

  try {
    await runMigrations(db);
    await bootstrapAdmin(db, config);
    await seedAchievements(db);
    await seedGifts(db);
    await seedIqTests(db);
    await seedEntranceTests(db);
    console.log('[seed] completed successfully');
  } finally {
    await db.close();
  }
}

void main().catch((error) => {
  console.error('[seed] failed', error);
  process.exit(1);
});
