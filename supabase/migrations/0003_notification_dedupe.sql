-- ===========================================================================
-- ZEROLAX — additive hardening for notifications
-- Safe to run on databases created before the dedupe_key column existed.
-- ===========================================================================

alter table user_notifications add column if not exists dedupe_key text;

create unique index if not exists user_notifications_dedupe_key_idx
  on user_notifications (dedupe_key);

-- A single announcement is delivered at most once to the same user.
create unique index if not exists user_notifications_notification_user_idx
  on user_notifications (notification_id, user_id)
  where notification_id is not null;
