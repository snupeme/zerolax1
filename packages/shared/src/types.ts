export type Language = 'uz' | 'ru' | 'en';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type UserStatus = 'active' | 'blocked';

export interface NotificationPrefs {
  dailyIq: boolean;
  results: boolean;
  announcements: boolean;
}

export interface Profile {
  id: string;
  nickname: string;
  language: Language;
  phone: string | null;
  avatarUrl: string | null;
  coinsBalance: number;
  status: UserStatus;
  notificationPrefs: NotificationPrefs;
  registeredAt: string;
}

export interface AdminTelegramIdentity {
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  linked: boolean;
}

export interface ProfileStats {
  iqCompleted: number;
  iqCorrect: number;
  iqQuestions: number;
  entranceCompleted: number;
  entranceCorrect: number;
  entranceQuestions: number;
  coinsEarned: number;
  achievements: Achievement[];
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  awardedAt: string;
}

export interface CoinTransaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  balanceAfter: number | null;
  createdAt: string;
}

export interface OptionPublic {
  id: string;
  position: number;
  text: string;
}

export interface QuestionPublic {
  id: string;
  position: number;
  text: string;
  imageUrl: string | null;
  options: OptionPublic[];
}

export interface QuestionResult extends QuestionPublic {
  correctOptionId: string;
  selectedOptionId: string | null;
  isCorrect: boolean;
  explanation: string | null;
  coins: number;
}

export interface IqTestSummary {
  id: string;
  testDate: string;
  title: string;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  publishAt: string;
  publishedAt: string | null;
  releaseAt: string | null;
  questionCount: number;
}

export interface IqAttemptState {
  id: string;
  testId: string;
  status: 'in_progress' | 'submitted' | 'scored';
  startedAt: string;
  submittedAt: string | null;
  answers: Record<string, string>;
}

export interface IqTodayResponse {
  test: IqTestSummary | null;
  attempt: IqAttemptState | null;
  serverTime: string;
  resultAvailable: boolean;
  releaseAt: string | null;
}

export interface IqResultResponse {
  locked: boolean;
  releaseAt: string | null;
  test: IqTestSummary;
  attemptId: string | null;
  totalCorrect: number;
  totalIncorrect: number;
  unanswered: number;
  totalQuestions: number;
  percent: number;
  coinsEarned: number;
  questions: QuestionResult[];
}

export interface IqHistoryItem {
  attemptId: string;
  testId: string;
  testDate: string;
  title: string;
  status: 'in_progress' | 'submitted' | 'scored';
  resultAvailable: boolean;
  releaseAt: string | null;
  totalCorrect: number | null;
  totalQuestions: number;
  coinsEarned: number | null;
}

export interface EntranceTestSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  subject: string;
  difficulty: Difficulty;
  durationSeconds: number;
  questionCount: number;
  status: 'draft' | 'published' | 'archived';
}

export interface EntranceAttemptSummary {
  id: string;
  testId: string;
  status: 'in_progress' | 'submitted' | 'expired';
  attemptDate: string;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  remainingSeconds: number;
  answers: Record<string, string>;
  totalQuestions: number;
  correctCount: number | null;
  scorePercent: number | null;
  coinsEarned: number | null;
}

export interface EntranceSessionResponse {
  test: EntranceTestSummary;
  attempt: EntranceAttemptSummary;
  questions: QuestionPublic[];
  serverTime: string;
}

export interface EntranceResultResponse {
  attemptId: string;
  test: EntranceTestSummary;
  status: 'submitted' | 'expired';
  attemptDate: string;
  startedAt: string;
  submittedAt: string;
  timeSpentSeconds: number;
  totalCorrect: number;
  totalIncorrect: number;
  unanswered: number;
  totalQuestions: number;
  percent: number;
  coinsEarned: number;
  questions: QuestionResult[];
}

export interface EntranceHistoryItem {
  attemptId: string;
  testTitle: string;
  attemptDate: string;
  status: 'in_progress' | 'submitted' | 'expired';
  totalCorrect: number | null;
  totalQuestions: number;
  percent: number | null;
  coinsEarned: number | null;
}

export interface InboxNotification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface Gift {
  id: string;
  title: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  status: 'active' | 'inactive';
}

export interface SupportRequest {
  id: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'closed';
  adminReply: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOverview {
  totalUsers: number;
  newUsersToday: number;
  activeToday: number;
  iqToday: number;
  entranceToday: number;
  coinsDistributed: number;
  notificationsSent: number;
  series: Array<{ date: string; iq: number; entrance: number; users: number }>;
}

export interface AdminUserRow {
  id: string;
  telegramId?: string;
  nickname: string;
  language: Language;
  coinsBalance: number;
  status: UserStatus;
  registeredAt: string;
  iqCompleted: number;
  entranceCompleted: number;
}

export interface AdminTestQuestion {
  id: string;
  testId: string;
  position: number;
  textUz: string;
  textRu: string;
  textEn: string;
  explanationUz: string | null;
  explanationRu: string | null;
  explanationEn: string | null;
  difficulty: Difficulty;
  coins: number;
  imageUrl: string | null;
  correctOptionIndex: number;
  options: Array<{ id: string; position: number; textUz: string; textRu: string; textEn: string }>;
}

export interface AdminIqTest {
  id: string;
  testDate: string;
  titleUz: string;
  titleRu: string;
  titleEn: string;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  publishAt: string;
  publishedAt: string | null;
  releaseAt: string | null;
  questionCount: number;
}

export interface AdminEntranceTest {
  id: string;
  slug: string;
  titleUz: string;
  titleRu: string;
  titleEn: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  subject: string;
  difficulty: Difficulty;
  durationSeconds: number;
  status: 'draft' | 'published' | 'archived';
  questionCount: number;
  publishedAt: string | null;
}

export interface AdminNotificationRow {
  id: string;
  title: string;
  body: string;
  target: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  sentCount: number;
  failedCount: number;
}

export interface DeliveryLog {
  id: string;
  telegramId?: string;
  nickname: string | null;
  kind: string;
  status: string;
  error: string | null;
  createdAt: string;
}

export interface AdminAuditLog {
  id: string;
  adminEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: unknown;
  createdAt: string;
}
