import type { Db } from '@zerolax/db';
import { addDaysToDateString, tashkentDateString } from '@zerolax/shared';
import type { AppConfig } from '../config';
import {
  ensureIqTestForDate,
  publishDueIqTests,
  releaseDueIqResults,
} from '../services/iq';
import { finalizeExpiredEntranceAttempts } from '../services/entrance';
import { processScheduledNotifications } from '../services/notifications';
import { finalizeExpiredLearningAttempts } from '../services/learning';

export interface SchedulerOptions {
  db: Db;
  config: AppConfig;
  intervalMs?: number;
  now?: () => Date;
  log?: (message: string, details?: unknown) => void;
}

export interface SchedulerTickResult {
  publishedIqTests: number;
  releasedIqResults: number;
  finalizedEntranceAttempts: number;
  sentScheduledNotifications: number;
}

export interface SchedulerHandle {
  runOnce: () => Promise<SchedulerTickResult>;
  stop: () => void;
}

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Runs the platform's recurring work in-process. Every job is idempotent, so
 * running more than one server instance (or retrying a failed tick) is safe.
 */
export function startScheduler(options: SchedulerOptions): SchedulerHandle {
  const { db, config } = options;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((message) => console.log(`[worker] ${message}`));

  let running = false;
  let stopped = false;

  async function runOnce(): Promise<SchedulerTickResult> {
    const result: SchedulerTickResult = {
      publishedIqTests: 0,
      releasedIqResults: 0,
      finalizedEntranceAttempts: 0,
      sentScheduledNotifications: 0,
    };
    if (running) return result;
    running = true;
    try {
      const tickTime = now();
      const today = tashkentDateString(tickTime);
      const tomorrow = addDaysToDateString(today, 1);

      // Keep the daily IQ cadence alive, then publish anything that is due.
      try {
        await ensureIqTestForDate(db, today);
        await ensureIqTestForDate(db, tomorrow);
      } catch (error) {
        log('could not prepare upcoming IQ tests', error);
      }

      try {
        result.publishedIqTests = await publishDueIqTests(db, config, tickTime);
      } catch (error) {
        log('publishDueIqTests failed', error);
      }

      try {
        result.releasedIqResults = await releaseDueIqResults(db, config, tickTime);
      } catch (error) {
        log('releaseDueIqResults failed', error);
      }

      try {
        result.finalizedEntranceAttempts = await finalizeExpiredEntranceAttempts(db, tickTime);
      } catch (error) {
        log('finalizeExpiredEntranceAttempts failed', error);
      }

      try {
        result.sentScheduledNotifications = await processScheduledNotifications(db, config, tickTime);
      } catch (error) {
        log('processScheduledNotifications failed', error);
      }
      try {
        await finalizeExpiredLearningAttempts(db,config.webUrl);
      } catch(error) {
        log('finalizeExpiredLearningAttempts failed',error);
      }

      if (
        result.publishedIqTests ||
        result.releasedIqResults ||
        result.finalizedEntranceAttempts ||
        result.sentScheduledNotifications
      ) {
        log('tick completed', result);
      }
      return result;
    } finally {
      running = false;
    }
  }

  // First tick shortly after boot, then periodically.
  const firstTimer = setTimeout(() => {
    void runOnce().catch((error) => log('first tick failed', error));
  }, 3_000);

  const timer = setInterval(() => {
    if (stopped) return;
    void runOnce().catch((error) => log('tick failed', error));
  }, intervalMs);

  return {
    runOnce,
    stop() {
      stopped = true;
      clearTimeout(firstTimer);
      clearInterval(timer);
    },
  };
}
