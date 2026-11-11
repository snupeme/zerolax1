import { z } from "zod";
export const ADMIN_PERMISSIONS = [
  "analytics.read",
  "users.read",
  "users.private",
  "users.write",
  "coins.read",
  "coins.write",
  "content.read",
  "content.write",
  "exams.read",
  "exams.write",
  "premium.read",
  "premium.write",
  "payments.read",
  "payments.write",
  "certificates.read",
  "certificates.write",
  "marketing.read",
  "marketing.write",
  "notifications.read",
  "notifications.write",
  "support.read",
  "support.write",
  "audit.read",
  "reports.read",
  "reports.export",
  "settings.read",
  "settings.write",
  "roles.write",
  "games.read",
  "games.write",
] as const;
export const adminRoleSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,49}$/),
  name: z.string().trim().min(2).max(100),
  permissions: z.array(z.enum(ADMIN_PERMISSIONS)).max(50),
});
export const platformSettingsSchema = z.object({
  name: z.string().trim().min(2).max(100),
  logoUrl: z.string().max(500).default(""),
  faviconUrl: z.string().max(500).default(""),
  languages: z.array(z.enum(["uz", "ru", "en"])).min(1),
  timezone: z.literal("Asia/Tashkent"),
  registrationEnabled: z.boolean(),
  maintenance: z.boolean(),
  supportEmail: z.email(),
  rewards: z.object({
    enabled: z.boolean(),
    easy: z.number().int().min(0).max(1000),
    medium: z.number().int().min(0).max(1000),
    hard: z.number().int().min(0).max(1000),
  }),
  applyDifficultyRewards: z.boolean().default(false),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;
export const defaultPlatformSettings: PlatformSettings = {
  name: "ZEROLAX",
  logoUrl: "",
  faviconUrl: "",
  languages: ["uz", "ru", "en"],
  timezone: "Asia/Tashkent",
  registrationEnabled: true,
  maintenance: false,
  supportEmail: "support@zerolax.uz",
  rewards: { enabled: true, easy: 1, medium: 2, hard: 3 },
  applyDifficultyRewards: false,
};
export const bannerSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).default(""),
    imageUrl: z.string().max(500).default(""),
    destination: z.string().max(1000),
    placement: z.enum(["home", "learning", "premium"]),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    priority: z.number().int().min(0).max(1000),
    enabled: z.boolean(),
  })
  .refine((b) => Date.parse(b.endsAt) > Date.parse(b.startsAt), {
    message: "End must be after start",
  });
export const catalogSubjectSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,49}$/),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(2000).default(""),
  coverUrl: z.string().max(500).default(""),
  position: z.number().int().min(0),
  enabled: z.boolean(),
  visible: z.boolean(),
});
