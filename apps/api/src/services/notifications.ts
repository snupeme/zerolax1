import type { AppConfig } from '../config';
import type { Db, Queryable } from '@zerolax/db';
import {
  translate,
  tashkentDateString,
  type Language,
} from '@zerolax/shared';
import { localizeText } from '../localize';

export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export async function sendTelegramMessage(
  config: AppConfig,
  input: {
    chatId: string | number;
    text: string;
    buttonText?: string;
    buttonUrl?: string;
  },
): Promise<TelegramSendResult> {
  if (!config.botToken) {
    return { ok: false, error: 'BOT_NOT_CONFIGURED' };
  }

  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const keyboard =
    input.buttonText && input.buttonUrl
      ? {
          inline_keyboard: [
            [
              input.buttonUrl.startsWith('https://')
                ? { text: input.buttonText, web_app: { url: input.buttonUrl } }
                : { text: input.buttonText, url: input.buttonUrl },
            ],
          ],
        }
      : undefined;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: input.chatId,
        text: input.text.slice(0, 4000),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: keyboard } : {}),
      }),
      signal: AbortSignal.timeout(12000),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.description ?? `Telegram API error ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

async function logDelivery(
  db: Queryable,
  input: {
    notificationId?: string | null;
    userId: string;
    telegramId: string;
    kind: string;
    status: 'sent' | 'failed';
    error?: string | null;
  },
): Promise<void> {
  await db.query(
    `insert into telegram_notification_logs
      (notification_id, user_id, telegram_id, kind, status, error)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      input.notificationId ?? null,
      input.userId,
      input.telegramId,
      input.kind,
      input.status,
      input.error ?? null,
    ],
  );
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await fn(current);
    }
  });
  await Promise.all(workers);
}

interface NotifiableUser {
  id: string;
  telegram_id: string;
  language: Language;
}

/** Sends the daily IQ announcement to all eligible users and stores an inbox item each. */
export async function notifyDailyIq(
  db: Db,
  config: AppConfig,
  test: { id: string; test_date: string },
): Promise<{ sent: number; failed: number }> {
  const users = await db.query<NotifiableUser>(
    `select id, telegram_id::text as telegram_id, language
       from profiles
      where status = 'active'
        and coalesce((notification_prefs->>'dailyIq')::boolean, true) = true
      order by registered_at asc`,
  );

  let sent = 0;
  let failed = 0;

  await mapLimit(users, 6, async (user) => {
    const title = translate(user.language, 'notifications.dailyIqTitle');
    const body = translate(user.language, 'notifications.dailyIqBody');

    await db.query(
      `insert into user_notifications (user_id, title, body, kind, dedupe_key)
       values ($1, $2, $3, $4, $5)
       on conflict (dedupe_key) do nothing`,
      [user.id, title, body, 'daily_iq', `daily_iq:${test.id}`],
    );

    const message = translate(user.language, 'bot.dailyIqNotification');
    const result = await sendTelegramMessage(config, {
      chatId: user.telegram_id,
      text: escapeHtml(message),
      buttonText: translate(user.language, 'bot.dailyIqButton'),
      buttonUrl: config.webappUrl,
    });

    await logDelivery(db, {
      userId: user.id,
      telegramId: user.telegram_id,
      kind: 'daily_iq',
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : result.error,
    });

    if (result.ok) sent++;
    else failed++;
  });

  return { sent, failed };
}

/** Notifies a user that their IQ result is available (once per attempt). */
export async function notifyIqResult(
  db: Db,
  config: AppConfig,
  attemptId: string,
): Promise<void> {
  const claimed = await db.query<{ id: string }>(
    `update iq_attempts
        set result_notified_at = now()
      where id = $1 and result_notified_at is null
      returning id`,
    [attemptId],
  );
  if (claimed.length === 0) return;

  const rows = await db.query<{
    user_id: string;
    telegram_id: string;
    language: Language;
    correct_count: number;
    total_questions: number;
    coins_earned: number;
    prefs: string;
  }>(
    `select a.user_id, p.telegram_id::text as telegram_id, p.language,
            a.correct_count, a.total_questions, a.coins_earned,
            p.notification_prefs as prefs
       from iq_attempts a
       join profiles p on p.id = a.user_id
      where a.id = $1`,
    [attemptId],
  );
  const row = rows[0];
  if (!row) return;

  const prefs =
    typeof row.prefs === 'string'
      ? (JSON.parse(row.prefs) as { results?: boolean })
      : (row.prefs as unknown as { results?: boolean });
  if (prefs.results === false) return;

  const title = translate(row.language, 'notifications.resultTitle');
  const body = translate(row.language, 'notifications.resultBody');

  await db.query(
    `insert into user_notifications (user_id, title, body, kind, dedupe_key)
     values ($1, $2, $3, $4, $5)
     on conflict (dedupe_key) do nothing`,
    [row.user_id, title, body, 'iq_result', `iq_result:${attemptId}`],
  );

  const message = translate(row.language, 'bot.resultReadyNotification', {
    correct: row.correct_count,
    total: row.total_questions,
    coins: row.coins_earned,
  });

  const result = await sendTelegramMessage(config, {
    chatId: row.telegram_id,
    text: escapeHtml(message),
    buttonText: translate(row.language, 'bot.resultReadyButton'),
    buttonUrl: config.webappUrl,
  });

  await logDelivery(db, {
    userId: row.user_id,
    telegramId: row.telegram_id,
    kind: 'iq_result',
    status: result.ok ? 'sent' : 'failed',
    error: result.ok ? null : result.error,
  });
}

interface NotificationRow {
  id: string;
  title_uz: string;
  title_ru: string;
  title_en: string;
  body_uz: string;
  body_ru: string;
  body_en: string;
  target: 'all' | 'active' | 'user';
  target_user_id: string | null;
}

/** Sends a stored announcement/notification to its target audience. */
export async function sendAnnouncement(
  db: Db,
  config: AppConfig,
  notificationId: string,
): Promise<{ sent: number; failed: number } | null> {
  const claimed = await db.query<NotificationRow>(
    `update notifications
        set status = 'sending'
      where id = $1 and status in ('draft', 'scheduled')
      returning id, title_uz, title_ru, title_en, body_uz, body_ru, body_en, target, target_user_id`,
    [notificationId],
  );
  const notification = claimed[0];
  if (!notification) return null;

  try {
    const users = await db.query<NotifiableUser>(
      notification.target === 'user'
        ? `select id, telegram_id::text as telegram_id, language from profiles where id = $1`
        : `select id, telegram_id::text as telegram_id, language
             from profiles
            where status = 'active'
              and coalesce((notification_prefs->>'announcements')::boolean, true) = true
            order by registered_at asc`,
      notification.target === 'user' ? [notification.target_user_id] : [],
    );

    let sent = 0;
    let failed = 0;

    await mapLimit(users, 6, async (user) => {
      const title = localizeText(notification as unknown as Record<string, unknown>, 'title', user.language);
      const body = localizeText(notification as unknown as Record<string, unknown>, 'body', user.language);

      await db.query(
        `insert into user_notifications (user_id, notification_id, title, body, kind, dedupe_key)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (dedupe_key) do nothing`,
        [user.id, notification.id, title, body, 'announcement', `announcement:${notification.id}`],
      );

      const result = await sendTelegramMessage(config, {
        chatId: user.telegram_id,
        text: escapeHtml(`${title}\n\n${body}`),
        buttonText: translate(user.language, 'bot.openApp'),
        buttonUrl: config.webappUrl,
      });

      await logDelivery(db, {
        notificationId: notification.id,
        userId: user.id,
        telegramId: user.telegram_id,
        kind: 'announcement',
        status: result.ok ? 'sent' : 'failed',
        error: result.ok ? null : result.error,
      });

      if (result.ok) sent++;
      else failed++;
    });

    await db.query(`update notifications set status = 'sent', sent_at = now() where id = $1`, [
      notification.id,
    ]);

    return { sent, failed };
  } catch (error) {
    await db.query(`update notifications set status = 'failed' where id = $1`, [notification.id]);
    throw error;
  }
}

/** Worker entry point: sends all scheduled notifications whose time has come. */
export async function processScheduledNotifications(
  db: Db,
  config: AppConfig,
  now: Date = new Date(),
): Promise<number> {
  const due = await db.query<{ id: string }>(
    `select id from notifications
      where status = 'scheduled' and scheduled_at is not null and scheduled_at <= $1
      order by scheduled_at asc
      limit 20`,
    [now.toISOString()],
  );

  for (const notification of due) {
    await sendAnnouncement(db, config, notification.id);
  }

  return due.length;
}

export function todayKey(): string {
  return tashkentDateString();
}
