import type { Db, Queryable } from "@zerolax/db";
import type { AdminPrincipal } from "../auth/middleware";
import {
  defaultPlatformSettings,
  platformSettingsSchema,
  type PlatformSettings,
} from "@zerolax/shared";
import { ApiError } from "../errors";
export async function canAdmin(
  db: Queryable,
  admin: AdminPrincipal,
  permission: string,
): Promise<boolean> {
  if (admin.role === "superadmin") return true;
  const [role] = await db.query<{ permissions: string[] }>(
    "select permissions from admin_roles where key=$1",
    [admin.role],
  );
  return role?.permissions.includes(permission) ?? false;
}
export async function requirePermission(
  db: Queryable,
  admin: AdminPrincipal,
  permission: string,
) {
  if (!(await canAdmin(db, admin, permission)))
    throw new ApiError(
      403,
      "ADMIN_FORBIDDEN",
      "Permission required: " + permission,
    );
}
export async function getPlatformSettings(
  db: Queryable,
): Promise<PlatformSettings> {
  const [row] = await db.query<{ value: unknown }>(
    "select value from app_settings where key='platform'",
  );
  return row
    ? platformSettingsSchema.parse(row.value)
    : defaultPlatformSettings;
}
export function safeDestination(value: string) {
  if (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\u0000-\u0020]/.test(value)
  )
    return value;
  try {
    const u = new URL(value);
    if (u.protocol === "https:" && !u.username && !u.password) return u.href;
  } catch {}
  throw new ApiError(400, "INVALID_URL", "Use a local path or HTTPS URL");
}
export function csvOutput(rows: Record<string, unknown>[]) {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const cell = (v: unknown) => {
    let s =
      v === null || v === undefined
        ? ""
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
    if (/^[\s]*[=+@\-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\ufeff" +
    [
      keys.map(cell).join(","),
      ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
    ].join("\r\n")
  );
}
export type Range = { from: string; to: string };
export function rangeSql(column: string, fromIndex: number) {
  return `${column} >= ($${fromIndex}::date::timestamp at time zone 'Asia/Tashkent') and ${column} < (($${fromIndex + 1}::date+1)::timestamp at time zone 'Asia/Tashkent')`;
}
export async function analytics(
  db: Db,
  from: string,
  to: string,
  bucket: "day" | "week" | "month" | "year",
  finance: boolean,
) {
  const params = [from, to];
  const [counts] = await db.query(
    `select
 (select count(*)::int from profiles) as users,
 (select count(*)::int from profiles where ${rangeSql("registered_at", 1)}) as registrations,
 (select count(distinct user_id)::int from user_activity where activity_date=(now() at time zone 'Asia/Tashkent')::date) as active_today,
 (select count(distinct user_id)::int from learning_subscriptions where revoked_at is null and starts_at<=now() and expires_at>now()) as premium,
 (select count(*)::int from learning_subscriptions where revoked_at is null and starts_at<=now() and expires_at>now()) as active_subscriptions,
 ((select count(*)::int from learning_attempts where status<>'in_progress' and ${rangeSql("finished_at", 1)})+(select count(*)::int from entrance_attempts where status<>'in_progress' and ${rangeSql("submitted_at", 1)})+(select count(*)::int from iq_attempts where status<>'in_progress' and ${rangeSql("submitted_at", 1)})) as completed,
 (select round(avg(score),2) from learning_attempts where status<>'in_progress' and ${rangeSql("finished_at", 1)}) as average_score,
 (select count(*)::int from learning_certificates where ${rangeSql("completed_at", 1)}) as certificates,
 (select coalesce(sum(amount),0) from coin_transactions where amount>0 and ${rangeSql("created_at", 1)}) as coins`,
    params,
  );
  const series = await db.query(
    `select d.bucket::text as date,
 (select count(*)::int from profiles where registered_at>=greatest(d.bucket,$1::date)::timestamp at time zone 'Asia/Tashkent' and registered_at<least(d.bucket+interval '1 ${bucket}',$2::date+1)::timestamp at time zone 'Asia/Tashkent') as registrations,
 (select count(distinct user_id)::int from user_activity where activity_date>=d.bucket::date and activity_date<(d.bucket+interval '1 ${bucket}')::date) as active,
 (select count(*)::int from learning_attempts where status<>'in_progress' and finished_at>=greatest(d.bucket,$1::date)::timestamp at time zone 'Asia/Tashkent' and finished_at<least(d.bucket+interval '1 ${bucket}',$2::date+1)::timestamp at time zone 'Asia/Tashkent') as exams,
 (select round(avg(score),2) from learning_attempts where status<>'in_progress' and finished_at>=greatest(d.bucket,$1::date)::timestamp at time zone 'Asia/Tashkent' and finished_at<least(d.bucket+interval '1 ${bucket}',$2::date+1)::timestamp at time zone 'Asia/Tashkent') as score,
 (select count(*)::int from learning_subscriptions where starts_at>=greatest(d.bucket,$1::date)::timestamp at time zone 'Asia/Tashkent' and starts_at<least(d.bucket+interval '1 ${bucket}',$2::date+1)::timestamp at time zone 'Asia/Tashkent') as subscriptions
 from generate_series(date_trunc('${bucket}',$1::date),date_trunc('${bucket}',$2::date),interval '1 ${bucket}') d(bucket)`,
    params,
  );
  const subjects = await db.query(
    `select b.subject,count(*)::int as exams,round(avg(a.score),2) as average from learning_attempts a join learning_exams e on e.id=a.exam_id join learning_books b on b.id=e.book_id where a.status<>'in_progress' and ${rangeSql("a.finished_at", 1)} group by b.subject`,
    params,
  );
  const grades = await db.query(
    `select s.grade,count(distinct a.user_id)::int as users from learning_attempts a join learning_student_details s on s.user_id=a.user_id where ${rangeSql("a.started_at", 1)} group by s.grade`,
    params,
  );
  const retention = await db.query(
    `select count(distinct p.id)::int as cohort,count(distinct case when a.activity_date>=(p.registered_at at time zone 'Asia/Tashkent')::date+7 then p.id end)::int as returned_after_7_days from profiles p left join user_activity a on a.user_id=p.id and a.activity_date<=(p.registered_at at time zone 'Asia/Tashkent')::date+14 where p.registered_at<=now()-interval '14 days' and ${rangeSql("p.registered_at", 1)}`,
    params,
  );
  const revenue = finance
    ? await db.query(
        `select currency,sum(amount_minor)::text as amount_minor from learning_payments where status='succeeded' and verified_at is not null and ${rangeSql("verified_at", 1)} group by currency`,
        params,
      )
    : null;
  const revenueSeries = finance
    ? await db.query(
        `select date_trunc('${bucket}',verified_at)::text as date,currency,sum(amount_minor)::text as amount_minor from learning_payments where status='succeeded' and verified_at is not null and ${rangeSql("verified_at", 1)} group by 1,2 order by 1`,
        params,
      )
    : null;
  return {
    counts,
    series,
    subjects,
    grades,
    retention: retention[0],
    revenue,
    revenueSeries,
    recentUsers: await db.query(
      "select id,nickname,registered_at from profiles order by registered_at desc limit 5",
    ),
    recentExams: await db.query(
      "select a.id,p.nickname,a.score,a.finished_at from learning_attempts a join profiles p on p.id=a.user_id where a.status<>'in_progress' order by a.finished_at desc limit 5",
    ),
    recentCertificates: await db.query(
      "select verification_id,student_name,book_title,completed_at from learning_certificates order by completed_at desc limit 5",
    ),
    expiredPremium: await db.query(
      "select s.user_id,p.nickname,max(s.expires_at) as expired_at from learning_subscriptions s join profiles p on p.id=s.user_id group by s.user_id,p.nickname having max(s.expires_at)<now() order by max(s.expires_at) desc limit 5",
    ),
    alerts: await db.query(
      "select * from learning_alerts order by updated_at desc limit 10",
    ),
  };
}
