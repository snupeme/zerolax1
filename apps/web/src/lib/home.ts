import { useI18n } from "../i18n/I18nProvider";

/**
 * Copy specific to the redesigned premium homepage and its secondary pages.
 * Kept local to the web app (same pattern as lib/study.ts and lib/learning.ts).
 */
const words = {
  uz: {
    morning: "Xayrli tong",
    day: "Xayrli kun",
    evening: "Xayrli oqshom",
    balance: "ZL",
    premiumTitle: "Barcha kurslarni oching",
    premiumText:
      "Barcha fanlar, testlar tahlili va qo‘shimcha imkoniyatlardan foydalaning.",
    premiumCta: "Premiumga o‘tish",
    premiumActiveTitle: "Premium faol",
    premiumActiveText:
      "Barcha fanlar va qo‘shimcha imkoniyatlar siz uchun ochiq.",
    premiumActiveCta: "Premium sahifasi",
    arcadeTitle: "ZEROLAX Math Arcade",
    arcadeSubtitle: "O‘yin orqali hisoblashni o‘rganing!",
    arcadeCta: "O‘ynashni boshlash",
    iqTitle: "IQ Mashqlari",
    iqText: "Mantiqiy fikrlashni rivojlantiring.",
    examTitle: "Imtihonlar",
    examText: "Bilimingizni sinab ko‘ring.",
    progressTitle: "Taraqqiyot markazi",
    progressText: "Missiyalar, seriya, reyting va tahlil.",
    subjectsTitle: "FANLAR BO‘LIMI",
    subjectsSubtitle: "Sinfingizni tanlab, darslarni davom ettiring.",
    subjectsAll: "Barchasi",
    gradeRange: "5–11 sinf",
    algebra: "Algebra",
    geometry: "Geometriya",
    algebraDesc:
      "Tenglama, funksiya va masalalarni bosqichma-bosqich o‘rganing.",
    geometryDesc:
      "Shakllar, fazo va geometrik fikrlashni rivojlantiring.",
    aiTitle: "AI Tahlilchi",
    aiText: "Xatolaringizni tahlil qiling.",
    certTitle: "Milliy Sertifikat Testlari",
    certText: "Bilimingizni imtihon formatida sinang.",
    resultsTitle: "So‘nggi natijalar",
    resultsAll: "Barchasi",
    noResults: "Hozircha natijalar yo‘q. Birinchi testdan boshlang.",
    pending: "Natija kutilmoqda",
    achievementsTitle: "Yutuqlar",
    accuracy: "Aniqlik",
    completed: "Yakunlangan testlar",
    subjectsPageTitle: "Fanlar bo‘limi",
    subjectsPageText:
      "Algebra yoki geometriyani tanlang, so‘ng sinfingizni belgilang. Har bir sinf uchun kitoblar va mavzular ketma-ket ochiladi.",
    chooseSubject: "Fanni tanlang",
    openGrades: "Sinflarni ko‘rish",
    analysisTitle: "AI Tahlilchi",
    analysisSubtitle: "Natijalaringiz asosidagi shaxsiy tahlil",
    analysisIntro:
      "Tahlil faqat sizning haqiqiy test natijalaringiz asosida hisoblanadi.",
    analysisEmptyTitle: "Hali tahlil uchun ma’lumot yo‘q",
    analysisEmptyText:
      "Kamida bitta IQ yoki imtihon testini yakunlang — shundan so‘ng shu yerda aniqlik, kuchli va yengish kerak bo‘lgan yo‘nalishlar ko‘rinadi.",
    analysisStart: "Birinchi testni boshlash",
    overallAccuracy: "Umumiy aniqlik",
    iqAccuracy: "IQ aniqligi",
    entranceAccuracy: "Imtihon aniqligi",
    totalTests: "Yakunlangan testlar",
    strongest: "Kuchli yo‘nalish",
    weakest: "Rivojlantirish kerak",
    recommendations: "Tavsiyalar",
    recentTrend: "Natijalar dinamikasi",
    iqLabel: "IQ testlari",
    entranceLabel: "Kirish testlari",
    noData: "Ma’lumot yo‘q",
    recommendationEmpty:
      "Ko‘proq test ishlang — tahlil sizga aniq tavsiyalar bera boshlaydi.",
    recIq: "IQ aniqligini oshiring: har kuni 10 savollik mashqni bajaring.",
    recEntrance:
      "Imtihon formatiga o‘rganing: vaqt chegarasi bilan kirish testlarini ishlang.",
    recReview:
      "Xatolaringizni tahlil qiling: natijalar tarixini ochib, qiyin mavzularni takrorlang.",
    recKeep:
      "Natijangiz yaxshi. Har kuni qisqa mashq bilan bilimni mustahkamlab turing.",
    recPremium:
      "Premium bilan barcha fanlar va qo‘shimcha imkoniyatlar ochiladi.",
    recCertificate:
      "Yakuniy imtihonlardan yuqori ball olib, sertifikat olish imkoniyatini tekshiring.",
    goToTests: "Testlarga o‘tish",
    goToHistory: "Natijalar tarixi",
    goToPremium: "Premiumni ko‘rish",
    goToCertificates: "Sertifikatlar",
    analysisDisclaimer:
      "Tahlil deterministik hisoblanadi: foizlar va tavsiyalar faqat bazadagi natijalaringizdan olinadi.",
  },
  ru: {
    morning: "Доброе утро",
    day: "Добрый день",
    evening: "Добрый вечер",
    balance: "ZL",
    premiumTitle: "Откройте все курсы",
    premiumText:
      "Все предметы, анализ тестов и дополнительные возможности в одном месте.",
    premiumCta: "Перейти на Premium",
    premiumActiveTitle: "Premium активен",
    premiumActiveText:
      "Все предметы и дополнительные возможности уже открыты.",
    premiumActiveCta: "Страница Premium",
    arcadeTitle: "ZEROLAX Math Arcade",
    arcadeSubtitle: "Учитесь считать через игру!",
    arcadeCta: "Начать играть",
    iqTitle: "IQ-тренировки",
    iqText: "Развивайте логическое мышление.",
    examTitle: "Экзамены",
    examText: "Проверьте свои знания.",
    progressTitle: "Центр прогресса",
    progressText: "Миссии, серия, рейтинг и анализ.",
    subjectsTitle: "РАЗДЕЛ ПРЕДМЕТОВ",
    subjectsSubtitle: "Выберите класс и продолжайте обучение.",
    subjectsAll: "Все",
    gradeRange: "5–11 класс",
    algebra: "Алгебра",
    geometry: "Геометрия",
    algebraDesc:
      "Уравнения, функции и задачи — шаг за шагом.",
    geometryDesc:
      "Фигуры, пространство и геометрическое мышление.",
    aiTitle: "AI-аналитик",
    aiText: "Разберите свои ошибки.",
    certTitle: "Национальные сертификационные тесты",
    certText: "Проверьте знания в экзаменационном формате.",
    resultsTitle: "Последние результаты",
    resultsAll: "Все",
    noResults: "Результатов пока нет. Начните с первого теста.",
    pending: "Результат ожидается",
    achievementsTitle: "Достижения",
    accuracy: "Точность",
    completed: "Пройдено тестов",
    subjectsPageTitle: "Раздел предметов",
    subjectsPageText:
      "Выберите алгебру или геометрию, затем свой класс. Книги и темы открываются последовательно.",
    chooseSubject: "Выберите предмет",
    openGrades: "Посмотреть классы",
    analysisTitle: "AI-аналитик",
    analysisSubtitle: "Персональный анализ по вашим результатам",
    analysisIntro:
      "Анализ строится только на ваших реальных результатах тестов.",
    analysisEmptyTitle: "Пока нет данных для анализа",
    analysisEmptyText:
      "Завершите хотя бы один IQ-тест или экзамен — здесь появятся точность, сильные стороны и направления для роста.",
    analysisStart: "Начать первый тест",
    overallAccuracy: "Общая точность",
    iqAccuracy: "Точность IQ",
    entranceAccuracy: "Точность экзамена",
    totalTests: "Пройдено тестов",
    strongest: "Сильное направление",
    weakest: "Нужно развивать",
    recommendations: "Рекомендации",
    recentTrend: "Динамика результатов",
    iqLabel: "IQ-тесты",
    entranceLabel: "Вступительные тесты",
    noData: "Нет данных",
    recommendationEmpty:
      "Пройдите больше тестов — анализ начнёт давать конкретные рекомендации.",
    recIq: "Повысьте точность IQ: выполняйте ежедневную практику из 10 вопросов.",
    recEntrance:
      "Привыкайте к экзаменационному формату: решайте вступительные тесты с таймером.",
    recReview:
      "Разберите ошибки: откройте историю результатов и повторите сложные темы.",
    recKeep:
      "Результат хороший. Поддерживайте знания короткой ежедневной практикой.",
    recPremium:
      "С Premium открываются все предметы и дополнительные возможности.",
    recCertificate:
      "Проверьте возможность получить сертификат по итоговым экзаменам.",
    goToTests: "Перейти к тестам",
    goToHistory: "История результатов",
    goToPremium: "Открыть Premium",
    goToCertificates: "Сертификаты",
    analysisDisclaimer:
      "Анализ детерминированный: проценты и рекомендации рассчитываются только по вашим результатам в базе.",
  },
  en: {
    morning: "Good morning",
    day: "Good afternoon",
    evening: "Good evening",
    balance: "ZL",
    premiumTitle: "Unlock every course",
    premiumText:
      "All subjects, test analysis and extra learning tools in one place.",
    premiumCta: "Go Premium",
    premiumActiveTitle: "Premium is active",
    premiumActiveText:
      "Every subject and extra learning tool is already unlocked.",
    premiumActiveCta: "Premium page",
    arcadeTitle: "ZEROLAX Math Arcade",
    arcadeSubtitle: "Learn to calculate through play!",
    arcadeCta: "Start playing",
    iqTitle: "IQ Practice",
    iqText: "Develop logical thinking.",
    examTitle: "Exams",
    examText: "Put your knowledge to the test.",
    progressTitle: "Progress hub",
    progressText: "Missions, streak, ranks and insights.",
    subjectsTitle: "SUBJECTS",
    subjectsSubtitle: "Choose your grade and continue learning.",
    subjectsAll: "All",
    gradeRange: "Grades 5–11",
    algebra: "Algebra",
    geometry: "Geometry",
    algebraDesc:
      "Equations, functions and word problems, step by step.",
    geometryDesc:
      "Shapes, space and geometric reasoning.",
    aiTitle: "AI Analyst",
    aiText: "Understand your mistakes.",
    certTitle: "National Certificate Tests",
    certText: "Test your knowledge in exam format.",
    resultsTitle: "Recent results",
    resultsAll: "All",
    noResults: "No results yet. Start with your first test.",
    pending: "Result pending",
    achievementsTitle: "Achievements",
    accuracy: "Accuracy",
    completed: "Completed tests",
    subjectsPageTitle: "Subjects",
    subjectsPageText:
      "Choose Algebra or Geometry, then your grade. Books and topics unlock in sequence.",
    chooseSubject: "Choose a subject",
    openGrades: "View grades",
    analysisTitle: "AI Analyst",
    analysisSubtitle: "A personal analysis based on your results",
    analysisIntro:
      "This analysis is calculated only from your real test results.",
    analysisEmptyTitle: "No data to analyse yet",
    analysisEmptyText:
      "Complete at least one IQ test or exam. Accuracy, strengths and growth areas will then appear here.",
    analysisStart: "Start your first test",
    overallAccuracy: "Overall accuracy",
    iqAccuracy: "IQ accuracy",
    entranceAccuracy: "Exam accuracy",
    totalTests: "Completed tests",
    strongest: "Strongest area",
    weakest: "Needs improvement",
    recommendations: "Recommendations",
    recentTrend: "Result trend",
    iqLabel: "IQ tests",
    entranceLabel: "Entrance tests",
    noData: "No data",
    recommendationEmpty:
      "Take more tests — the analysis will start giving specific recommendations.",
    recIq: "Improve IQ accuracy: complete the daily 10-question practice.",
    recEntrance:
      "Get used to the exam format: take timed entrance tests.",
    recReview:
      "Review your mistakes: open your result history and repeat difficult topics.",
    recKeep:
      "Your result is strong. Keep it up with a short daily practice.",
    recPremium:
      "Premium unlocks every subject and extra learning tool.",
    recCertificate:
      "Check your certificate eligibility from the final exams.",
    goToTests: "Go to tests",
    goToHistory: "Result history",
    goToPremium: "View Premium",
    goToCertificates: "Certificates",
    analysisDisclaimer:
      "The analysis is deterministic: percentages and recommendations come only from your stored results.",
  },
} as const;

export type HomeWords = (typeof words)["uz"];

export function useHomeWords(): HomeWords {
  const { language } = useI18n();
  return words[language] as HomeWords;
}
