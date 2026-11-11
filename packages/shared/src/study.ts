import type {
  LearningBook,
  LearningTopic,
  LearningExam,
  LearningSession,
} from "./learning";
export type StudySubject = "algebra" | "geometry";
export interface StudyGrade {
  grade: number;
  enabled: boolean;
  bookCount: number;
  topicCount: number;
  completedTopics: number;
  progress: number;
}
export interface StudyBook extends LearningBook {
  topicCount: number;
  completedTopics: number;
  progress: number;
  unlocked: boolean;
  premiumRequired: boolean;
}
export interface StudyTopic extends LearningTopic {
  accessible: boolean;
  lockReason: "premium" | "intermediate" | null;
  testStatus:
    "not_started" | "in_progress" | "submitted" | "expired" | "passed";
  examId: string | null;
  remainingAttempts: number;
}
export interface StudyBookResponse {
  book: StudyBook;
  premium: boolean;
  topics: StudyTopic[];
  exams: LearningExam[];
}
export interface StudyLesson {
  book: LearningBook;
  topic: LearningTopic;
  exam: (LearningExam & { activeAttemptId?: string | null }) | null;
  questionCount: 10;
}
export interface StudySession extends LearningSession {
  topicId: string | null;
}
