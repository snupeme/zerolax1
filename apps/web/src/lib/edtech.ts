import { useQuery } from "@tanstack/react-query";
import { getStoredAdminSession, getStoredSession, request } from "./api";
import { useI18n } from "../i18n/I18nProvider";

// ---------------------------------------------------------------------------
// Types mirrored from apps/api/src/services/edtech.ts
// ---------------------------------------------------------------------------
export type LeaderboardPeriod = "weekly" | "monthly" | "all";
export type FlashcardRating = "again" | "hard" | "good" | "easy";

export interface StreakInfo {
  current: number;
  longest: number;
  lastActivityDate: string | null;
  nextMilestone: number | null;
  milestones: Array<{ milestone: number; reward: number; claimed: boolean; reached: boolean }>;
}

export interface MissionView {
  id: string;
  code: string;
  metric: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  rewardCoins: number;
  completed: boolean;
  rewardCredited: boolean;
  completedAt: string | null;
}

export interface MissionsResponse {
  date: string;
  missions: MissionView[];
  completed: number;
  total: number;
}

export interface AchievementView {
  code: string;
  title: string;
  description: string;
  icon: string;
  coinReward: number;
  criteria: Record<string, unknown>;
  unlocked: boolean;
  awardedAt: string | null;
}

export interface AchievementsResponse {
  achievements: AchievementView[];
  unlocked: number;
  total: number;
}

export interface LeaderboardRow {
  rank: number | null;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  score: number;
  questions: number;
  growth: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResult {
  period: LeaderboardPeriod;
  subject: string;
  range: { start: string; end: string };
  rows: LeaderboardRow[];
  currentUser: LeaderboardRow | null;
  hidden: boolean;
  participants: number;
}

export interface FlashcardDeckView {
  id: string;
  subject: string;
  grade: number | null;
  title: string;
  description: string;
  cardCount: number;
  dueCount: number;
  masteredCount: number;
}

export interface FlashcardView {
  id: string;
  front: string;
  back: string;
  explanation: string;
  example: string;
  difficulty: string;
  position: number;
  favorite: boolean;
  box: number;
  dueAt: string | null;
  reviewCount: number;
  lastRating: string | null;
}

export interface FlashcardStats {
  totalCards: number;
  dueNow: number;
  mastered: number;
  favorites: number;
  reviewed: number;
}

export interface MistakeQuestionSnapshot {
  text: string;
  options: string[];
  correctIndex: number;
  imageUrl?: string | null;
}

export interface MistakeView {
  id: string;
  source: string;
  subject: string;
  topic: string;
  question: MistakeQuestionSnapshot;
  selectedAnswer: string | null;
  correctAnswer: string | null;
  explanation: string;
  difficulty: string;
  timesWrong: number;
  timesCorrect: number;
  resolved: boolean;
  lastSeenAt: string;
}

export interface MistakeList {
  mistakes: MistakeView[];
  total: number;
  open: number;
}

export interface WeaknessAnalysis {
  subjects: Array<{ subject: string; wrong: number; reviewed: number; accuracy: number }>;
  topics: Array<{ subject: string; topic: string; wrong: number; repeated: number }>;
  topQuestions: Array<{ id: string; subject: string; topic: string; text: string; timesWrong: number }>;
  weakestSubject: string | null;
  weakestTopic: string | null;
  advice: { uz: string; ru: string; en: string } | null;
}

export interface LearningMapTopic {
  topicKey: string;
  topic: string;
  status: string;
  attempts: number;
  correct: number;
  total: number;
  accuracy: number;
  lastActivityAt: string;
}

export interface LearningMapSubject {
  subject: string;
  mastered: number;
  needsReview: number;
  inProgress: number;
  accuracy: number;
  topics: LearningMapTopic[];
}

export interface Recommendation {
  key: string;
  kind: string;
  refId: string;
  title: string;
  reason: string;
  href: string;
  tone: "primary" | "gold" | "danger";
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  daysActive: number;
  questions: number;
  correct: number;
  accuracy: number;
  topicsLearned: number;
  mistakes: number;
  mistakesReviewed: number;
  flashcards: number;
  rank: number | null;
  previousRank: number | null;
  rankChange: number | null;
  score: number;
  previousScore: number;
  growth: number;
  subjects: Array<{ subject: string; correct: number; total: number; accuracy: number }>;
  daily: Array<{ date: string; questions: number; correct: number }>;
}

export interface Dashboard {
  streak: StreakInfo;
  missions: MissionsResponse;
  achievements: { unlocked: number; total: number; recent: AchievementView[] };
  leaderboard: LeaderboardResult;
  flashcards: FlashcardStats;
  mistakes: { open: number; total: number; weakestTopic: string | null };
  recommendations: Recommendation[];
  map: { subjects: LearningMapSubject[] };
  weeklyReport: WeeklyReport;
  activityTotals: { questions: number; correct: number; tests: number };
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
export const edtechRequest = <T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown } = {},
) => request<T>(`/api/edtech${path}`, { ...options, auth: "user" });

export const edtechAdminRequest = <T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown } = {},
) => request<T>(`/api/admin/edtech${path}`, { ...options, auth: "admin" });

export function downloadEdtechCsv(path: string, filename: string, auth: "user" | "admin" = "user") {
  const session = auth === "admin" ? getStoredAdminSession() : getStoredSession();
  return fetch(`${import.meta.env.VITE_API_URL ?? ""}${path}`, {
    headers: { authorization: `Bearer ${session?.accessToken}` },
  }).then(async (response) => {
    if (!response.ok) throw new Error("Download failed");
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
export function useEdtechDashboard() {
  return useQuery({ queryKey: ["edtech-dashboard"], queryFn: () => edtechRequest<Dashboard>("/dashboard") });
}
export function useMissions() {
  return useQuery({ queryKey: ["edtech-missions"], queryFn: () => edtechRequest<MissionsResponse>("/missions") });
}
export function useStreak() {
  return useQuery({ queryKey: ["edtech-streak"], queryFn: () => edtechRequest<StreakInfo>("/streak") });
}
export function useLeaderboard(period: LeaderboardPeriod, subject: string) {
  return useQuery({
    queryKey: ["edtech-leaderboard", period, subject],
    queryFn: () =>
      edtechRequest<LeaderboardResult>(`/leaderboard?period=${period}&subject=${encodeURIComponent(subject)}`),
  });
}
export function useFlashcardDecks(subject: string, grade: number | null) {
  return useQuery({
    queryKey: ["edtech-decks", subject, grade],
    queryFn: () => {
      const params = new URLSearchParams();
      if (subject) params.set("subject", subject);
      if (grade) params.set("grade", String(grade));
      return edtechRequest<{ decks: FlashcardDeckView[]; stats: FlashcardStats }>(
        `/flashcards${params.size ? `?${params}` : ""}`,
      );
    },
  });
}
export function useFlashcardDeck(deckId: string, dueOnly: boolean, favorites: boolean) {
  return useQuery({
    queryKey: ["edtech-deck", deckId, dueOnly, favorites],
    queryFn: () =>
      edtechRequest<{ deck: FlashcardDeckView; cards: FlashcardView[] }>(
        `/flashcards/${deckId}?dueOnly=${dueOnly}&favorites=${favorites}`,
      ),
    enabled: Boolean(deckId),
  });
}
export function useMistakes(filters: { subject?: string; resolved?: string; search?: string }) {
  return useQuery({
    queryKey: ["edtech-mistakes", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.subject) params.set("subject", filters.subject);
      if (filters.resolved) params.set("resolved", filters.resolved);
      if (filters.search) params.set("search", filters.search);
      return edtechRequest<MistakeList>(`/mistakes${params.size ? `?${params}` : ""}`);
    },
  });
}
export function useMistakeAnalysis() {
  return useQuery({ queryKey: ["edtech-mistake-analysis"], queryFn: () => edtechRequest<WeaknessAnalysis>("/mistakes/analysis") });
}
export function useLearningMap() {
  return useQuery({ queryKey: ["edtech-map"], queryFn: () => edtechRequest<{ subjects: LearningMapSubject[] }>("/analytics") });
}
export function useRecommendations() {
  return useQuery({ queryKey: ["edtech-recommendations"], queryFn: () => edtechRequest<Recommendation[]>("/recommendations") });
}
export function useWeeklyReport() {
  return useQuery({ queryKey: ["edtech-weekly"], queryFn: () => edtechRequest<WeeklyReport>("/reports/weekly") });
}
export function useAchievements() {
  return useQuery({ queryKey: ["edtech-achievements"], queryFn: () => edtechRequest<AchievementsResponse>("/achievements") });
}

// ---------------------------------------------------------------------------
// UI copy (same pattern as lib/learning.ts and lib/games.ts)
// ---------------------------------------------------------------------------
const words = {
  uz: {
    title: "O‘quv markazi",
    subtitle: "Kunlik missiyalar, seriya va shaxsiy tahlil",
    missions: "Kunlik missiyalar",
    missionsShort: "Missiyalar",
    streak: "Seriya",
    streakDays: "kun",
    longest: "Eng uzun",
    nextMilestone: "Keyingi mukofot",
    claimed: "Olingan",
    leaderboard: "Reyting",
    leaderboardShort: "Reyting",
    weekly: "Haftalik",
    monthly: "Oylik",
    allTime: "Umumiy",
    subject: "Fan",
    allSubjects: "Barcha fanlar",
    rank: "O‘rin",
    score: "Ball",
    questions: "Savollar",
    growth: "O‘sish",
    you: "Siz",
    participants: "Ishtirokchilar",
    hiddenNotice: "Reytingda ko‘rinmaslik yoqilgan. Faqat o‘z natijangiz ko‘rsatiladi.",
    flashcards: "Fleshkartalar",
    flashcardsShort: "Kartalar",
    decks: "To‘plamlar",
    cards: "karta",
    due: "Takrorlash kerak",
    mastered: "O‘zlashtirilgan",
    favorites: "Sevimlilar",
    reviewed: "Ko‘rilgan",
    review: "Takrorlash",
    again: "Qayta",
    hard: "Qiyin",
    good: "Yaxshi",
    easy: "Oson",
    showAnswer: "Javobni ko‘rish",
    favorite: "Sevimlilarga",
    unfavorite: "Sevimlilardan olib tashlash",
    noCards: "Bu to‘plamda hozircha karta yo‘q.",
    mistakes: "Xatolar daftari",
    mistakesShort: "Xatolar",
    openMistakes: "Ochiq xatolar",
    resolved: "Hal qilingan",
    allMistakes: "Barchasi",
    retryMistake: "Qayta ishlash",
    wrongTimes: "marta xato",
    correctAnswer: "To‘g‘ri javob",
    yourAnswer: "Sizning javobingiz",
    explanation: "Izoh",
    weakness: "Zaif mavzular",
    advice: "Tavsiya",
    noMistakes: "Xatolar daftari bo‘sh. Davom eting!",
    achievements: "Yutuqlar",
    achievementsShort: "Yutuqlar",
    unlocked: "Ochilgan",
    locked: "Qulflangan",
    reward: "Mukofot",
    reports: "Haftalik hisobot",
    reportsShort: "Hisobot",
    accuracy: "Aniqlik",
    daysActive: "Faol kunlar",
    topicsLearned: "O‘rganilgan mavzular",
    flashcardsReviewed: "Ko‘rilgan kartalar",
    mistakesReviewed: "Tahlil qilingan xatolar",
    rankChange: "O‘rin o‘zgarishi",
    analytics: "O‘quv xaritasi",
    analyticsShort: "Xarita",
    needsReview: "Takrorlash kerak",
    inProgress: "Jarayonda",
    topics: "Mavzular",
    noAnalytics: "Hozircha xarita uchun ma’lumot yo‘q. Testlarni boshlang.",
    recommendations: "Siz uchun tavsiyalar",
    open: "Ochish",
    empty: "Ma’lumot topilmadi",
    search: "Qidirish",
    correct: "To‘g‘ri",
    incorrect: "Xato",
    example: "Misol",
    medium: "O‘rta",
    user: "Foydalanuvchi",
    loading: "Yuklanmoqda...",
    error: "Ma’lumotni yuklab bo‘lmadi.",
    retry: "Qayta urinish",
    progress: "Taraqqiyot",
    progressShort: "Taraqqiyot",
    today: "Bugun",
    total: "Jami",
    back: "Orqaga",
    privacy: "Maxfiylik",
    showInLeaderboard: "Reytingda ko‘rinish",
    saved: "Saqlandi",
    progressHubText: "Missiyalar, reyting, kartalar va tahlil bir joyda.",
    go: "Ochish",
    admin: "EdTech boshqaruvi",
    adminSubtitle: "Missiyalar, kartalar, yutuqlar va sozlamalar",
    overview: "Umumiy ko‘rinish",
    mission: "Missiya",
    deck: "To‘plam",
    card: "Karta",
    achievement: "Yutuq",
    settings: "Sozlamalar",
    activity: "Faoliyat",
    create: "Yaratish",
    edit: "Tahrirlash",
    delete: "O‘chirish",
    save: "Saqlash",
    cancel: "Bekor qilish",
    active: "Faol",
    status: "Holat",
    target: "Maqsad",
    rewardCoins: "Mukofot (coin)",
    metric: "Ko‘rsatkich",
    code: "Kod",
    titles: "Sarlavha",
    descriptions: "Tavsif",
    sortOrder: "Tartib",
    startDate: "Boshlanish sanasi",
    endDate: "Tugash sanasi",
    front: "Old tomon",
    backSide: "Orqa tomon",
    difficulty: "Qiyinlik",
    published: "Nashr qilingan",
    draft: "Qoralama",
    interval: "Interval (kun)",
    weight: "Ball og‘irligi",
    export: "CSV yuklash",
    snapshot: "Reyting nusxasi",
    completions: "Bajarilgan",
    awarded: "Berilgan",
    cardCount: "Kartalar",
    confirmDelete: "O‘chirishni tasdiqlaysizmi?",
    noRows: "Yozuvlar yo‘q.",
  },
  ru: {
    title: "Учебный центр",
    subtitle: "Ежедневные миссии, серия и персональный анализ",
    missions: "Ежедневные миссии",
    missionsShort: "Миссии",
    streak: "Серия",
    streakDays: "дн.",
    longest: "Самая длинная",
    nextMilestone: "Следующая награда",
    claimed: "Получено",
    leaderboard: "Рейтинг",
    leaderboardShort: "Рейтинг",
    weekly: "Неделя",
    monthly: "Месяц",
    allTime: "Всё время",
    subject: "Предмет",
    allSubjects: "Все предметы",
    rank: "Место",
    score: "Баллы",
    questions: "Вопросы",
    growth: "Рост",
    you: "Вы",
    participants: "Участники",
    hiddenNotice: "Скрытие в рейтинге включено. Показывается только ваш результат.",
    flashcards: "Флешкарты",
    flashcardsShort: "Карты",
    decks: "Колоды",
    cards: "карточек",
    due: "Пора повторить",
    mastered: "Освоено",
    favorites: "Избранное",
    reviewed: "Просмотрено",
    review: "Повторить",
    again: "Снова",
    hard: "Сложно",
    good: "Хорошо",
    easy: "Легко",
    showAnswer: "Показать ответ",
    favorite: "В избранное",
    unfavorite: "Убрать из избранного",
    noCards: "В этой колоде пока нет карточек.",
    mistakes: "Тетрадь ошибок",
    mistakesShort: "Ошибки",
    openMistakes: "Открытые ошибки",
    resolved: "Решено",
    allMistakes: "Все",
    retryMistake: "Проработать",
    wrongTimes: "раз ошибка",
    correctAnswer: "Правильный ответ",
    yourAnswer: "Ваш ответ",
    explanation: "Объяснение",
    weakness: "Слабые темы",
    advice: "Рекомендация",
    noMistakes: "Тетрадь ошибок пуста. Продолжайте!",
    achievements: "Достижения",
    achievementsShort: "Достижения",
    unlocked: "Открыто",
    locked: "Закрыто",
    reward: "Награда",
    reports: "Недельный отчёт",
    reportsShort: "Отчёт",
    accuracy: "Точность",
    daysActive: "Активных дней",
    topicsLearned: "Изучено тем",
    flashcardsReviewed: "Просмотрено карточек",
    mistakesReviewed: "Проработано ошибок",
    rankChange: "Изменение места",
    analytics: "Карта обучения",
    analyticsShort: "Карта",
    needsReview: "Повторить",
    inProgress: "В процессе",
    topics: "Темы",
    noAnalytics: "Пока нет данных для карты. Начните тесты.",
    recommendations: "Рекомендации для вас",
    open: "Открыть",
    empty: "Данные не найдены",
    search: "Поиск",
    correct: "Верно",
    incorrect: "Неверно",
    example: "Пример",
    medium: "Средне",
    user: "Пользователь",
    loading: "Загрузка...",
    error: "Не удалось загрузить данные.",
    retry: "Повторить",
    progress: "Прогресс",
    progressShort: "Прогресс",
    today: "Сегодня",
    total: "Всего",
    back: "Назад",
    privacy: "Приватность",
    showInLeaderboard: "Показывать в рейтинге",
    saved: "Сохранено",
    progressHubText: "Миссии, рейтинг, карточки и анализ в одном месте.",
    go: "Открыть",
    admin: "Управление EdTech",
    adminSubtitle: "Миссии, карточки, достижения и настройки",
    overview: "Обзор",
    mission: "Миссия",
    deck: "Колода",
    card: "Карточка",
    achievement: "Достижение",
    settings: "Настройки",
    activity: "Активность",
    create: "Создать",
    edit: "Изменить",
    delete: "Удалить",
    save: "Сохранить",
    cancel: "Отмена",
    active: "Активна",
    status: "Статус",
    target: "Цель",
    rewardCoins: "Награда (coin)",
    metric: "Метрика",
    code: "Код",
    titles: "Заголовок",
    descriptions: "Описание",
    sortOrder: "Порядок",
    startDate: "Дата начала",
    endDate: "Дата окончания",
    front: "Лицевая сторона",
    backSide: "Обратная сторона",
    difficulty: "Сложность",
    published: "Опубликовано",
    draft: "Черновик",
    interval: "Интервал (дни)",
    weight: "Вес баллов",
    export: "Скачать CSV",
    snapshot: "Снимок рейтинга",
    completions: "Выполнено",
    awarded: "Выдано",
    cardCount: "Карточки",
    confirmDelete: "Подтвердить удаление?",
    noRows: "Записей нет.",
  },
  en: {
    title: "Learning hub",
    subtitle: "Daily missions, streaks and personal insights",
    missions: "Daily missions",
    missionsShort: "Missions",
    streak: "Streak",
    streakDays: "days",
    longest: "Longest",
    nextMilestone: "Next reward",
    claimed: "Claimed",
    leaderboard: "Leaderboard",
    leaderboardShort: "Ranks",
    weekly: "Weekly",
    monthly: "Monthly",
    allTime: "All time",
    subject: "Subject",
    allSubjects: "All subjects",
    rank: "Rank",
    score: "Score",
    questions: "Questions",
    growth: "Growth",
    you: "You",
    participants: "Participants",
    hiddenNotice: "Leaderboard visibility is off. Only your own score is shown.",
    flashcards: "Flashcards",
    flashcardsShort: "Cards",
    decks: "Decks",
    cards: "cards",
    due: "Due now",
    mastered: "Mastered",
    favorites: "Favorites",
    reviewed: "Reviewed",
    review: "Review",
    again: "Again",
    hard: "Hard",
    good: "Good",
    easy: "Easy",
    showAnswer: "Show answer",
    favorite: "Add to favorites",
    unfavorite: "Remove from favorites",
    noCards: "This deck has no cards yet.",
    mistakes: "Error notebook",
    mistakesShort: "Mistakes",
    openMistakes: "Open mistakes",
    resolved: "Resolved",
    allMistakes: "All",
    retryMistake: "Practice",
    wrongTimes: "times wrong",
    correctAnswer: "Correct answer",
    yourAnswer: "Your answer",
    explanation: "Explanation",
    weakness: "Weak topics",
    advice: "Advice",
    noMistakes: "Your error notebook is empty. Keep going!",
    achievements: "Achievements",
    achievementsShort: "Awards",
    unlocked: "Unlocked",
    locked: "Locked",
    reward: "Reward",
    reports: "Weekly report",
    reportsShort: "Report",
    accuracy: "Accuracy",
    daysActive: "Active days",
    topicsLearned: "Topics learned",
    flashcardsReviewed: "Cards reviewed",
    mistakesReviewed: "Mistakes reviewed",
    rankChange: "Rank change",
    analytics: "Learning map",
    analyticsShort: "Map",
    needsReview: "Needs review",
    inProgress: "In progress",
    topics: "Topics",
    noAnalytics: "No map data yet. Start a test.",
    recommendations: "Recommended for you",
    open: "Open",
    empty: "No data found",
    search: "Search",
    correct: "Correct",
    incorrect: "Wrong",
    example: "Example",
    medium: "Medium",
    user: "User",
    loading: "Loading...",
    error: "Unable to load data.",
    retry: "Retry",
    progress: "Progress",
    progressShort: "Progress",
    today: "Today",
    total: "Total",
    back: "Back",
    privacy: "Privacy",
    showInLeaderboard: "Show in leaderboard",
    saved: "Saved",
    progressHubText: "Missions, ranks, cards and insights in one place.",
    go: "Open",
    admin: "EdTech management",
    adminSubtitle: "Missions, cards, achievements and settings",
    overview: "Overview",
    mission: "Mission",
    deck: "Deck",
    card: "Card",
    achievement: "Achievement",
    settings: "Settings",
    activity: "Activity",
    create: "Create",
    edit: "Edit",
    delete: "Delete",
    save: "Save",
    cancel: "Cancel",
    active: "Active",
    status: "Status",
    target: "Target",
    rewardCoins: "Reward (coins)",
    metric: "Metric",
    code: "Code",
    titles: "Title",
    descriptions: "Description",
    sortOrder: "Order",
    startDate: "Start date",
    endDate: "End date",
    front: "Front",
    backSide: "Back",
    difficulty: "Difficulty",
    published: "Published",
    draft: "Draft",
    interval: "Interval (days)",
    weight: "Score weight",
    export: "Export CSV",
    snapshot: "Leaderboard snapshot",
    completions: "Completed",
    awarded: "Awarded",
    cardCount: "Cards",
    confirmDelete: "Confirm deletion?",
    noRows: "No records.",
  },
};

export type EdtechWords = (typeof words)["uz"];

export function useEdtechWords(): EdtechWords {
  const { language } = useI18n();
  return words[language];
}

export const EDTECH_SUBJECT_OPTIONS = ["all", "algebra", "geometry", "dtm", "sat", "english"] as const;

export function subjectLabel(subject: string, language: "uz" | "ru" | "en") {
  const labels: Record<string, { uz: string; ru: string; en: string }> = {
    all: { uz: "Barcha fanlar", ru: "Все предметы", en: "All subjects" },
    algebra: { uz: "Algebra", ru: "Алгебра", en: "Algebra" },
    geometry: { uz: "Geometriya", ru: "Геометрия", en: "Geometry" },
    dtm: { uz: "DTM", ru: "DTM", en: "DTM" },
    sat: { uz: "SAT", ru: "SAT", en: "SAT" },
    english: { uz: "Ingliz tili", ru: "Английский", en: "English" },
    iq: { uz: "IQ", ru: "IQ", en: "IQ" },
    games: { uz: "O‘yinlar", ru: "Игры", en: "Games" },
    flashcards: { uz: "Kartalar", ru: "Карточки", en: "Flashcards" },
    entrance: { uz: "Kirish testlari", ru: "Вступительные", en: "Entrance" },
  };
  return labels[subject]?.[language] ?? subject;
}
