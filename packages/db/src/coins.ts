import type { CreditCoinsInput, CreditCoinsResult, Queryable } from './types';
import { getProfileStats } from './profiles';

/**
 * Credits (or debits) coins and writes an immutable ledger entry.
 * Must be called inside a database transaction for full atomicity.
 * The unique idempotency key guarantees a reward is only ever applied once.
 */
export async function creditCoins(
  db: Queryable,
  input: CreditCoinsInput,
): Promise<CreditCoinsResult> {
  const inserted = await db.query<{ id: string }>(
    `insert into coin_transactions
      (user_id, amount, type, source_type, source_id, idempotency_key, description, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (idempotency_key) do nothing
     returning id`,
    [
      input.userId,
      input.amount,
      input.type,
      input.sourceType ?? null,
      input.sourceId ?? null,
      input.idempotencyKey,
      input.description ?? null,
      input.createdBy ?? null,
    ],
  );

  if (inserted.length === 0) {
    const [profile] = await db.query<{ coins_balance: number }>(
      'select coins_balance from profiles where id = $1',
      [input.userId],
    );
    return { credited: false, balance: Number(profile?.coins_balance ?? 0) };
  }

  const [updated] = await db.query<{ coins_balance: number }>(
    `update profiles
        set coins_balance = coins_balance + $1,
            updated_at = now()
      where id = $2
      returning coins_balance`,
    [input.amount, input.userId],
  );

  if (!updated) {
    throw new Error(`Cannot credit coins: profile ${input.userId} not found`);
  }

  await db.query('update coin_transactions set balance_after = $1 where id = $2', [
    Number(updated.coins_balance),
    inserted[0].id,
  ]);

  return { credited: true, balance: Number(updated.coins_balance) };
}

export interface AwardedAchievement {
  code: string;
  coins: number;
}

/**
 * Evaluates achievement rules and awards any newly earned badges (and their
 * coin rewards). Safe to call repeatedly: entries are unique per user.
 */
export async function awardAchievements(
  db: Queryable,
  userId: string,
): Promise<AwardedAchievement[]> {
  const stats = await getProfileStats(db, userId);
  const [perfect] = await db.query<{ iq: boolean; entrance: boolean }>(
    `select
       exists(
         select 1 from iq_attempts
          where user_id = $1 and status = 'scored' and total_questions > 0
            and correct_count = total_questions
       ) as iq,
       exists(
         select 1 from entrance_attempts
          where user_id = $1 and status in ('submitted', 'expired') and total_questions > 0
            and correct_count = total_questions
       ) as entrance`,
    [userId],
  );

  const totalTests = stats.iq_completed + stats.entrance_completed;
  const eligible: Record<string, boolean> = {
    first_test: totalTests >= 1,
    iq_5: stats.iq_completed >= 5,
    iq_perfect: Boolean(perfect?.iq),
    entrance_3: stats.entrance_completed >= 3,
    entrance_perfect: Boolean(perfect?.entrance),
    coins_100: stats.coins_earned >= 100,
  };

  const achievements = await db.query<{ id: string; code: string; coin_reward: number }>(
    'select id, code, coin_reward from achievements',
  );

  const awarded: AwardedAchievement[] = [];
  for (const achievement of achievements) {
    if (!eligible[achievement.code]) continue;

    const inserted = await db.query<{ achievement_id: string }>(
      `insert into user_achievements (user_id, achievement_id)
       values ($1, $2)
       on conflict (user_id, achievement_id) do nothing
       returning achievement_id`,
      [userId, achievement.id],
    );
    if (inserted.length === 0) continue;

    const reward = Number(achievement.coin_reward);
    if (reward > 0) {
      await creditCoins(db, {
        userId,
        amount: reward,
        type: 'achievement',
        sourceType: 'achievement',
        sourceId: achievement.code,
        idempotencyKey: `achievement:${userId}:${achievement.code}`,
        description: `Achievement unlocked: ${achievement.code}`,
      });
    }
    awarded.push({ code: achievement.code, coins: reward });
  }

  return awarded;
}
