import { z } from 'zod';
import { MAX_NICKNAME_LENGTH, MIN_NICKNAME_LENGTH } from './constants';

export const languageSchema = z.enum(['uz', 'ru', 'en']);
export const difficultySchema = z.enum(['easy', 'medium', 'hard']);

export const nicknameSchema = z
  .string()
  .trim()
  .min(MIN_NICKNAME_LENGTH)
  .max(MAX_NICKNAME_LENGTH)
  .regex(/^[\p{L}\p{N}_ .'-]+$/u);

export const notificationPrefsSchema = z.object({
  dailyIq: z.boolean(),
  results: z.boolean(),
  announcements: z.boolean(),
});

export const updateProfileSchema = z
  .object({
    nickname: nicknameSchema.optional(),
    language: languageSchema.optional(),
    notificationPrefs: notificationPrefsSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

export const supportRequestSchema = z.object({
  subject: z.string().trim().min(3).max(140),
  message: z.string().trim().min(10).max(4000),
});

export const questionOptionSchema = z.object({
  textUz: z.string().trim().min(1).max(500),
  textRu: z.string().trim().min(1).max(500),
  textEn: z.string().trim().min(1).max(500),
});

export const questionInputSchema = z.object({
  textUz: z.string().trim().min(1).max(2000),
  textRu: z.string().trim().min(1).max(2000),
  textEn: z.string().trim().min(1).max(2000),
  explanationUz: z.string().trim().max(2000).optional().nullable(),
  explanationRu: z.string().trim().max(2000).optional().nullable(),
  explanationEn: z.string().trim().max(2000).optional().nullable(),
  difficulty: difficultySchema,
  coins: z.number().int().min(0).max(100),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  correctOptionIndex: z.number().int().min(0).max(3),
  options: z.array(questionOptionSchema).length(4),
});

export const iqTestInputSchema = z.object({
  testDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  titleUz: z.string().trim().min(2).max(160),
  titleRu: z.string().trim().min(2).max(160),
  titleEn: z.string().trim().min(2).max(160),
});

export const entranceTestInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  titleUz: z.string().trim().min(2).max(160),
  titleRu: z.string().trim().min(2).max(160),
  titleEn: z.string().trim().min(2).max(160),
  descriptionUz: z.string().trim().max(1000).optional().nullable(),
  descriptionRu: z.string().trim().max(1000).optional().nullable(),
  descriptionEn: z.string().trim().max(1000).optional().nullable(),
  subject: z.string().trim().min(2).max(80),
  difficulty: difficultySchema,
  durationSeconds: z.number().int().min(60).max(7200),
});

export const notificationInputSchema = z.object({
  titleUz: z.string().trim().min(2).max(160),
  titleRu: z.string().trim().min(2).max(160),
  titleEn: z.string().trim().min(2).max(160),
  bodyUz: z.string().trim().min(2).max(2000),
  bodyRu: z.string().trim().min(2).max(2000),
  bodyEn: z.string().trim().min(2).max(2000),
  target: z.enum(['all', 'active', 'user']),
  targetUserId: z.string().uuid().optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
});

export const adminLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6).max(200),
});

export const coinAdjustmentSchema = z.object({
  amount: z.number().int().min(-1000000).max(1000000).refine((v) => v !== 0, {
    message: 'Amount must not be zero',
  }),
  reason: z.string().trim().min(3).max(300),
});

export const devLoginSchema = z.object({
  nickname: nicknameSchema.optional(),
  language: languageSchema.optional(),
  telegramId: z.string().regex(/^\d{5,20}$/).optional(),
});

export type QuestionInput = z.infer<typeof questionInputSchema>;
export type IqTestInput = z.infer<typeof iqTestInputSchema>;
export type EntranceTestInput = z.infer<typeof entranceTestInputSchema>;
export type NotificationInput = z.infer<typeof notificationInputSchema>;
