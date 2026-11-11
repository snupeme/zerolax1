import { z } from "zod";

export const learningSettingsSchema = z
  .object({
    repeatBelow: z.number().int().min(1).max(99).default(40),
    reviewFrom: z.number().int().min(1).max(99).default(50),
    unlockFrom: z.number().int().min(1).max(100).default(71),
    certificateFrom: z.number().int().min(1).max(100).default(80),
    borderlinePolicy: z
      .enum(["pending", "repeat", "review"])
      .default("pending"),
    topicQuestionCount: z.number().int().min(1).max(100).default(10),
    maxAttempts: z.number().int().min(1).max(10).default(2),
    allowPassedRetake: z.boolean().default(false),
  })
  .refine(
    (s) =>
      s.repeatBelow < s.reviewFrom &&
      s.reviewFrom < s.unlockFrom &&
      s.unlockFrom <= s.certificateFrom,
    { message: "Score thresholds must be ordered and must not overlap" },
  );
export type LearningSettings = z.infer<typeof learningSettingsSchema>;
export const defaultLearningSettings = learningSettingsSchema.parse({});
export function evaluateLearningScore(
  score: number,
  settings: LearningSettings,
) {
  if (!Number.isFinite(score) || score < 0 || score > 100)
    throw new Error("Invalid score");
  return {
    policy:
      score < settings.repeatBelow
        ? "repeat"
        : score < settings.reviewFrom
          ? settings.borderlinePolicy
          : score < settings.unlockFrom
            ? "review"
            : "passed",
    unlocked: score >= settings.unlockFrom,
    certificate: score >= settings.certificateFrom,
  };
}
export const learningBookSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subject: z.string().regex(/^[a-z][a-z0-9-]{1,49}$/),
  grade: z.number().int().min(5).max(11),
  position: z.number().int().positive(),
  freeTopicLimit: z.number().int().min(0).max(1000).default(3),
  published: z.boolean().default(false),
});
export const learningTopicSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(100000),
  position: z.number().int().positive(),
  published: z.boolean().default(false),
});
export const learningQuestionSchema = z.object({
  text: z.string().trim().min(1).max(10000),
  options: z.array(z.string().trim().min(1).max(2000)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().max(10000).default(""),
  published: z.boolean().default(true),
});
export interface LearningBook {
  description?: string;
  cover_url?: string;
  subject_title?: string;
  id: string;
  title: string;
  subject: string;
  grade: number;
  position: number;
  free_topic_limit: number;
  published: boolean;
  unlocked?: boolean;
}
export interface LearningTopic {
  content_format?: "text" | "html";
  id: string;
  book_id: string;
  title: string;
  position: number;
  content?: string;
  published: boolean;
  accessible?: boolean;
  completed?: boolean;
}
export interface LearningExam {
  difficulty_distribution?: {
    easy: number;
    medium: number;
    hard: number;
  } | null;
  passing_score?: number | null;
  max_attempts?: number | null;
  id: string;
  book_id: string;
  topic_id: string | null;
  kind: "topic" | "intermediate" | "final";
  block_number: number | null;
  duration_seconds: number;
  published: boolean;
  remaining?: number;
}
export interface LearningSession {
  kind: LearningExam["kind"];
  id: string;
  exam_id: string;
  status: string;
  started_at: string;
  expires_at: string;
  score: number | null;
  result: ReturnType<typeof evaluateLearningScore> | null;
  questions: Array<{
    id: string;
    text: string;
    options: string[];
    imageUrl?: string | null;
  }>;
  answers: Record<string, number>;
}
export interface LearningCertificate {
  verification_id: string;
  student_name: string;
  grade: number;
  book_title: string;
  score: number;
  completed_at: string;
  seconds_spent: number;
  revoked_at: string | null;
}
