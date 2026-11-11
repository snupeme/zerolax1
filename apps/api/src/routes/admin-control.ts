import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type { Db, Queryable } from "@zerolax/db";
import { z } from "zod";
import sharp from "sharp";
import sanitizeHtml from "sanitize-html";
import Papa from "papaparse";
import {
  ADMIN_PERMISSIONS,
  adminRoleSchema,
  platformSettingsSchema,
  bannerSchema,
  catalogSubjectSchema,
  learningQuestionSchema,
} from "@zerolax/shared";
import {
  analytics,
  canAdmin,
  csvOutput,
  getPlatformSettings,
  requirePermission,
  safeDestination,
  rangeSql,
} from "../services/admin-control";
import { recordAudit, hashPassword } from "../services/admin";
import { ApiError } from "../errors";
interface Options {
  db: Db;
  adminGuard: (r: FastifyRequest, p: FastifyReply) => Promise<void>;
}
const uuid = z.string().uuid();
const id = (r: FastifyRequest) => uuid.parse((r.params as { id: string }).id);
const paging = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
const dates = z
  .object({
    from: z.iso
      .date()
      .default(() =>
        new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
      ),
    to: z.iso.date().default(() => new Date().toISOString().slice(0, 10)),
  })
  .refine(
    (r) =>
      r.from <= r.to && Date.parse(r.to) - Date.parse(r.from) <= 366 * 86400000,
    { message: "Choose an ordered range of up to 367 days" },
  );
const userFilters = paging.extend({
  search: z.string().max(200).default(""),
  status: z.enum(["", "active", "blocked"]).default(""),
  premium: z.enum(["", "true", "false"]).default(""),
  grade: z.coerce.number().int().min(5).max(11).optional(),
  city: z.string().max(100).default(""),
  district: z.string().max(100).default(""),
  certificate: z.enum(["", "true", "false"]).default(""),
  active: z.enum(["", "true", "false"]).default(""),
  minScore: z.coerce.number().min(0).max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z
    .enum(["registered_at", "nickname", "coins_balance"])
    .default("registered_at"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
async function filteredUsers(
  db: Queryable,
  q: z.infer<typeof userFilters>,
  privateAccess: boolean,
  exporting = false,
) {
  const params: unknown[] = [];
  const conditions: string[] = [];
  function p(v: unknown) {
    params.push(v);
    return "$" + params.length;
  }
  if (q.search) {
    const v = p("%" + q.search + "%");
    conditions.push(
      `(p.nickname ilike ${v} or s.full_name ilike ${v}${privateAccess ? ` or p.telegram_id::text ilike ${v} or p.telegram_username ilike ${v} or concat_ws(' ',p.first_name,p.last_name) ilike ${v} or p.phone ilike ${v}` : ""})`,
    );
  }
  if (q.status) conditions.push(`p.status=${p(q.status)}`);
  if (q.grade) conditions.push(`s.grade=${p(q.grade)}`);
  if (q.city) conditions.push(`p.city=${p(q.city)}`);
  if (q.district) conditions.push(`p.district=${p(q.district)}`);
  if (q.from) conditions.push(`p.registered_at>=${p(q.from)}::date`);
  if (q.to) conditions.push(`p.registered_at<${p(q.to)}::date+1`);
  const premium = `exists(select 1 from learning_subscriptions sub where sub.user_id=p.id and sub.revoked_at is null and sub.starts_at<=now() and sub.expires_at>now())`;
  if (q.premium)
    conditions.push(`${q.premium === "false" ? "not " : ""}${premium}`);
  if (q.certificate)
    conditions.push(
      `${q.certificate === "false" ? "not " : ""}exists(select 1 from learning_certificates c where c.user_id=p.id and c.revoked_at is null)`,
    );
  if (q.active)
    conditions.push(
      `${q.active === "false" ? "not " : ""}exists(select 1 from user_activity a where a.user_id=p.id and a.activity_date=(now() at time zone 'Asia/Tashkent')::date)`,
    );
  if (q.minScore !== undefined)
    conditions.push(
      `exists(select 1 from learning_attempts a where a.user_id=p.id and a.score>=${p(q.minScore)})`,
    );
  const where = conditions.length ? "where " + conditions.join(" and ") : "";
  const [count] = await db.query<{ total: number }>(
    `select count(*)::int as total from profiles p left join learning_student_details s on s.user_id=p.id ${where}`,
    params,
  );
  const rows = await db.query(
    `select p.id,p.nickname${privateAccess ? ',p.telegram_id::text,p.telegram_username' : ''},coalesce(s.full_name,${privateAccess ? "concat_ws(' ',p.first_name,p.last_name)" : 'p.nickname'}) as full_name,s.grade,p.age,p.city,p.district,p.status,p.coins_balance,p.registered_at,${premium} as premium${privateAccess ? ",p.phone" : ""},(select count(*)::int from learning_progress g where g.user_id=p.id) as completed_topics from profiles p left join learning_student_details s on s.user_id=p.id ${where} order by p.${q.sort} ${q.direction},p.id limit ${p(exporting ? 10000 : q.limit)} offset ${p(q.offset)}`,
    params,
  );
  return { rows, total: count.total };
}
export const adminControlRoutes: FastifyPluginAsync<Options> = async (
  app,
  { db, adminGuard },
) => {
  app.addHook("preHandler", adminGuard);
  app.put("/books/:id/order", async (r) => {
    await requirePermission(db, r.admin!, "content.write");
    const ids = z.array(uuid).min(1).max(1000).parse(r.body);
    return db.transaction(async (tx) => {
      await tx.query("select id from learning_books where id=$1 for update", [
        id(r),
      ]);
      const topics = await tx.query<{ id: string }>(
        "select id from learning_topics where book_id=$1 for update",
        [id(r)],
      );
      if (
        ids.length !== topics.length ||
        new Set(ids).size !== ids.length ||
        topics.some((t) => !ids.includes(t.id))
      )
        throw new ApiError(400, "INVALID_ORDER", "Supply each book topic once");
      const used = await tx.query(
        "select a.id from learning_attempts a join learning_exams e on e.id=a.exam_id where e.book_id=$1 limit 1",
        [id(r)],
      );
      if (used.length)
        throw new ApiError(
          409,
          "CONTENT_IN_USE",
          "Reordering a book with exam history requires a content migration",
        );
      await tx.query(
        "update learning_topics set position=position+1000000 where book_id=$1",
        [id(r)],
      );
      for (const [i, topic] of ids.entries())
        await tx.query("update learning_topics set position=$2 where id=$1", [
          topic,
          i + 1,
        ]);
      await tx.query(
        "delete from learning_exams where book_id=$1 and kind='intermediate'",
        [id(r)],
      );
      for (let block = 1; block <= Math.floor(ids.length / 10); block++)
        await tx.query(
          "insert into learning_exams(book_id,kind,block_number) values($1,'intermediate',$2)",
          [id(r), block],
        );
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action: "topics.reorder",
        entityId: id(r),
        details: { topicIds: ids },
      });
      return { ok: true };
    });
  });
  const need = (r: FastifyRequest, p: string) =>
    requirePermission(db, r.admin!, p);
  function superOnly(r: FastifyRequest) {
    if (r.admin!.role !== "superadmin")
      throw new ApiError(403, "ADMIN_FORBIDDEN", "Superadmin required");
  }
  async function mutate(
    r: FastifyRequest,
    action: string,
    entity: string | undefined,
    fn: (tx: Queryable) => Promise<unknown>,
    details: unknown = r.body,
  ) {
    return db.transaction(async (tx) => {
      const result = await fn(tx);
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action,
        entityType: "control",
        entityId: entity,
        details:
          result && typeof result === "object" && "before" in result
            ? { before: (result as { before: unknown }).before, after: details }
            : details,
      });
      return result;
    });
  }
  app.get("/me", async (r) => ({
    admin: r.admin,
    permissions:
      r.admin!.role === "superadmin"
        ? [...ADMIN_PERMISSIONS]
        : ((
            await db.query<{ permissions: string[] }>(
              "select permissions from admin_roles where key=$1",
              [r.admin!.role],
            )
          )[0]?.permissions ?? []),
  }));
  app.get("/analytics", async (r) => {
    await need(r, "analytics.read");
    const range = dates.parse(r.query);
    const bucket = z
      .enum(["day", "week", "month", "year"])
      .parse((r.query as { bucket?: string }).bucket ?? "day");
    return analytics(
      db,
      range.from,
      range.to,
      bucket,
      await canAdmin(db, r.admin!, "payments.read"),
    );
  });
  app.get("/users", async (r) => {
    await need(r, "users.read");
    return filteredUsers(
      db,
      userFilters.parse(r.query),
      await canAdmin(db, r.admin!, "users.private"),
    );
  });
  app.patch("/users/:id", async (r) => {
    await need(r, "users.write");
    const b = z
      .object({
        firstName: z.string().max(100).optional(),
        lastName: z.string().max(100).optional(),
        age: z.number().int().min(5).max(120).nullable(),
        city: z.string().max(100),
        district: z.string().max(100),
        fullName: z.string().trim().min(3).max(200),
        grade: z.number().int().min(5).max(11),
      })
      .parse(r.body);
    if (b.firstName !== undefined || b.lastName !== undefined) await need(r, 'users.private');
    return mutate(r, "user.profile.update", id(r), async (tx) => {
      const before = (
        await tx.query(
          "select first_name,last_name,age,city,district from profiles where id=$1 for update",
          [id(r)],
        )
      )[0];
      if (!before) throw new ApiError(404, "USER_NOT_FOUND", "User not found");
      await tx.query(
        "update profiles set first_name=coalesce($2,first_name),last_name=coalesce($3,last_name),age=$4,city=$5,district=$6,updated_at=now() where id=$1",
        [id(r), b.firstName, b.lastName, b.age, b.city, b.district],
      );
      await tx.query(
        "insert into learning_student_details(user_id,full_name,grade) values($1,$2,$3) on conflict(user_id) do update set full_name=excluded.full_name,grade=excluded.grade",
        [id(r), b.fullName, b.grade],
      );
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action: "user.profile.before",
        entityId: id(r),
        details: before,
      });
      return { ok: true };
    });
  });
  app.get("/users/:id/details", async (r) => {
    await need(r, "users.read");
    const q = paging.parse(r.query);
    const args = [id(r), q.limit, q.offset];
    return {
      personal:
        (
          await db.query(
            `select p.id,p.age,p.city,p.district,s.full_name,s.grade${(await canAdmin(db, r.admin!, "users.private")) ? ",p.phone,p.first_name,p.last_name" : ""} from profiles p left join learning_student_details s on s.user_id=p.id where p.id=$1`,
            [id(r)],
          )
        )[0] ?? null,
      progress: await db.query(
        "select g.completed_at,t.title as topic,b.title as book,b.subject,b.grade from learning_progress g join learning_topics t on t.id=g.topic_id join learning_books b on b.id=t.book_id where g.user_id=$1 order by g.completed_at desc limit $2 offset $3",
        args,
      ),
      notes: await db.query(
        "select n.id,n.body,n.created_at,a.name as admin from admin_user_notes n join admin_users a on a.id=n.admin_id where n.user_id=$1 order by n.created_at desc limit $2 offset $3",
        args,
      ),
      activity: await db.query(
        "select action,created_at,details from admin_audit_logs where entity_id=$1 order by created_at desc limit $2 offset $3",
        args,
      ),
      payments: (await canAdmin(db, r.admin!, "payments.read"))
        ? await db.query(
            "select id,provider,amount_minor,currency,status,verified_at,created_at from learning_payments where user_id=$1 order by created_at desc limit $2 offset $3",
            args,
          )
        : null,
      subscriptions: (await canAdmin(db, r.admin!, "premium.read"))
        ? await db.query(
            "select id,source,starts_at,expires_at,revoked_at from learning_subscriptions where user_id=$1 order by expires_at desc limit $2 offset $3",
            args,
          )
        : null,
    };
  });
  app.post("/users/:id/notes", async (r) => {
    await need(r, "support.write");
    const b = z
      .object({ body: z.string().trim().min(1).max(5000) })
      .parse(r.body);
    return mutate(
      r,
      "user.note.add",
      id(r),
      async (tx) =>
        (
          await tx.query(
            "insert into admin_user_notes(user_id,admin_id,body) values($1,$2,$3) returning id",
            [id(r), r.admin!.id, b.body],
          )
        )[0],
    );
  });
  app.get("/attempts/:id", async (r) => {
    await need(r, "exams.read");
    const [attempt] = await db.query(
      "select * from learning_attempts where id=$1",
      [id(r)],
    );
    if (!attempt) throw new ApiError(404, "NOT_FOUND", "Attempt not found");
    return {
      attempt,
      questions: await db.query(
        "select question_id,position,snapshot from learning_attempt_questions where attempt_id=$1 order by position",
        [id(r)],
      ),
    };
  });
  app.get("/exam-analytics", async (r) => {
    await need(r, "exams.read");
    const range = dates.parse(r.query);
    const kind = z
      .enum(["learning", "iq", "entrance"])
      .parse((r.query as { kind?: string }).kind ?? "learning");
    if (kind !== "learning") {
      const table = kind === "iq" ? "iq" : "entrance";
      const visibility =
        kind === "iq"
          ? "and exists(select 1 from daily_iq_tests t where t.id=a.test_id and t.release_at<=now())"
          : "";
      const score =
        kind === "iq"
          ? "100.0*a.correct_count/nullif(a.total_questions,0)"
          : "a.score_percent";
      const args = [range.from, range.to];
      const [summary] = await db.query(
        `select count(*)::int as attempts,round(avg(${score}),2) as average_score,round(avg(extract(epoch from a.submitted_at-a.started_at))) as average_seconds from ${table}_attempts a where a.status<>'in_progress' and ${rangeSql("a.submitted_at", 1)} ${visibility}`,
        args,
      );
      const questions = await db.query(
        `select q.id,left(q.text_uz,200) as text,count(*)::int as attempts,count(*) filter(where ans.selected_option_id is distinct from correct.id)::int as missed from ${table}_attempts a join ${table}_questions q on q.test_id=a.test_id join ${table}_question_options correct on correct.question_id=q.id and correct.position=q.correct_option_index left join ${table}_user_answers ans on ans.attempt_id=a.id and ans.question_id=q.id where a.status<>'in_progress' and ${rangeSql("a.submitted_at", 1)} ${visibility} group by q.id,q.text_uz order by count(*) filter(where ans.selected_option_id is distinct from correct.id) desc limit 20`,
        args,
      );
      return { summary, questions, distribution: [] };
    }
    return {
      summary: (
        await db.query(
          `select count(*)::int as attempts,round(avg(score),2) as average_score,count(*) filter(where result->>'unlocked'='true')::int as passed,count(*) filter(where result->>'unlocked'<>'true')::int as failed,round(100.0*count(*) filter(where result->>'unlocked'='true')/nullif(count(*),0),2) as pass_rate,round(avg(extract(epoch from finished_at-started_at))) as average_seconds from learning_attempts where status<>'in_progress' and ${rangeSql("finished_at", 1)}`,
          [range.from, range.to],
        )
      )[0],
      distribution: await db.query(
        `select attempt_number,count(*)::int as count from learning_attempts where ${rangeSql("started_at", 1)} group by attempt_number order by attempt_number`,
        [range.from, range.to],
      ),
      questions: await db.query(
        `select aq.question_id,left(aq.snapshot->>'text',200) as text,count(*)::int as answered,count(*) filter(where (a.answers->>aq.question_id::text)::integer is distinct from (aq.snapshot->>'correctIndex')::integer)::int as missed from learning_attempt_questions aq join learning_attempts a on a.id=aq.attempt_id where a.status<>'in_progress' and ${rangeSql("a.finished_at", 1)} group by aq.question_id,aq.snapshot->>'text' order by count(*) filter(where (a.answers->>aq.question_id::text)::integer is distinct from (aq.snapshot->>'correctIndex')::integer) desc limit 20`,
        [range.from, range.to],
      ),
    };
  });
  app.get("/roles", async (r) => {
    superOnly(r);
    return {
      roles: await db.query("select * from admin_roles order by key"),
      admins: await db.query(
        "select id,email,name,role,status from admin_users order by name",
      ),
      permissions: ADMIN_PERMISSIONS,
    };
  });
  app.put("/roles", async (r) => {
    superOnly(r);
    const b = adminRoleSchema.parse(r.body);
    if (b.key === "superadmin")
      throw new ApiError(400, "PROTECTED_ROLE", "Superadmin role is immutable");
    return mutate(r, "role.update", b.key, async (tx) => {
      const before = (
        await tx.query("select * from admin_roles where key=$1", [b.key])
      )[0];
      await tx.query(
        "insert into admin_roles(key,name,permissions) values($1,$2,$3) on conflict(key) do update set name=excluded.name,permissions=excluded.permissions",
        [b.key, b.name, JSON.stringify([...new Set(b.permissions)])],
      );
      return { before, ok: true };
    });
  });
  app.post("/admins", async (r) => {
    superOnly(r);
    const b = z
      .object({
        email: z.email(),
        name: z.string().trim().min(2).max(100),
        password: z.string().min(12).max(200),
        role: z.string().max(50),
      })
      .parse(r.body);
    return mutate(
      r,
      "admin.create",
      undefined,
      async (tx) =>
        (
          await tx.query(
            "insert into admin_users(email,name,password_hash,role) values($1,$2,$3,$4) returning id,email,name,role",
            [b.email, b.name, hashPassword(b.password), b.role],
          )
        )[0],
      { email: b.email, role: b.role },
    );
  });
  app.patch("/admins/:id", async (r) => {
    superOnly(r);
    const b = z
      .object({
        role: z.string().max(50),
        status: z.enum(["active", "disabled"]),
      })
      .parse(r.body);
    if (id(r) === r.admin!.id)
      throw new ApiError(
        409,
        "SELF_CHANGE_BLOCKED",
        "Cannot change your own role or status",
      );
    return mutate(r, "admin.access.update", id(r), async (tx) => {
      const rows = await tx.query<{ id: string }>(
        "select id from admin_users where role='superadmin' and status='active' for update",
      );
      const [prior] = await tx.query<{ role: string; status: string }>(
        "select role,status from admin_users where id=$1",
        [id(r)],
      );
      if (!prior) throw new ApiError(404, "NOT_FOUND", "Admin not found");
      if (
        prior.role === "superadmin" &&
        prior.status === "active" &&
        rows.length <= 1 &&
        (b.role !== "superadmin" || b.status !== "active")
      )
        throw new ApiError(
          409,
          "LAST_SUPERADMIN",
          "At least one superadmin must remain",
        );
      await tx.query("update admin_users set role=$2,status=$3 where id=$1", [
        id(r),
        b.role,
        b.status,
      ]);
      return { before: prior, ok: true };
    });
  });
  app.get("/settings", async (r) => {
    await need(r, "settings.read");
    return getPlatformSettings(db);
  });
  app.put("/settings", async (r) => {
    await need(r, "settings.write");
    const b = platformSettingsSchema.parse(r.body);
    if (b.logoUrl) safeDestination(b.logoUrl);
    if (b.faviconUrl) safeDestination(b.faviconUrl);
    return mutate(r, "platform.settings", undefined, async (tx) => {
      const before = await getPlatformSettings(tx);
      await tx.query(
        "update app_settings set value=$1,updated_at=now() where key='platform'",
        [JSON.stringify(b)],
      );
      return { before, value: b };
    });
  });
  app.get("/catalog", async (r) => {
    await need(r, "content.read");
    return {
      subjects: await db.query(
        "select * from content_subjects order by position",
      ),
      grades: await db.query("select * from content_grades order by grade"),
    };
  });
  app.put("/subjects", async (r) => {
    await need(r, "content.write");
    const b = catalogSubjectSchema.parse(r.body);
    if (b.coverUrl) safeDestination(b.coverUrl);
    return mutate(r, "subject.update", b.slug, async (tx) => {
      await tx.query(
        "insert into content_subjects(slug,title,description,cover_url,position,enabled,visible) values($1,$2,$3,$4,$5,$6,$7) on conflict(slug) do update set title=excluded.title,description=excluded.description,cover_url=excluded.cover_url,position=excluded.position,enabled=excluded.enabled,visible=excluded.visible",
        [
          b.slug,
          b.title,
          b.description,
          b.coverUrl,
          b.position,
          b.enabled,
          b.visible,
        ],
      );
      return { ok: true };
    });
  });
  app.put("/grades/:grade", async (r) => {
    await need(r, "content.write");
    const grade = z.coerce
      .number()
      .int()
      .min(5)
      .max(11)
      .parse((r.params as { grade: string }).grade);
    const b = z.object({ enabled: z.boolean() }).parse(r.body);
    return mutate(r, "grade.update", String(grade), async (tx) => {
      await tx.query("update content_grades set enabled=$2 where grade=$1", [
        grade,
        b.enabled,
      ]);
      return { ok: true };
    });
  });
  app.put("/books/:id/metadata", async (r) => {
    await need(r, "content.write");
    const b = z
      .object({
        description: z.string().max(10000),
        coverUrl: z.string().max(500),
      })
      .parse(r.body);
    if (b.coverUrl) safeDestination(b.coverUrl);
    return mutate(r, "book.metadata", id(r), async (tx) => {
      await tx.query(
        "update learning_books set description=$2,cover_url=$3 where id=$1",
        [id(r), b.description, b.coverUrl],
      );
      return { ok: true };
    });
  });
  app.put("/topics/:id/rich-content", async (r) => {
    await need(r, "content.write");
    const b = z.object({ html: z.string().max(100000) }).parse(r.body);
    const html = sanitizeHtml(b.html, {
      allowedTags: [
        "p",
        "br",
        "strong",
        "em",
        "s",
        "ul",
        "ol",
        "li",
        "h2",
        "h3",
        "blockquote",
        "pre",
        "code",
        "a",
        "img",
        "span",
        "div",
      ],
      allowedAttributes: {
        a: ["href", "target", "rel"],
        img: ["src", "alt", "width", "height"],
        span: ["data-type", "data-latex"],
        div: ["data-type", "data-latex"],
      },
      allowedSchemes: ["https"],
      allowProtocolRelative: false,
    });
    return mutate(r, "topic.content", id(r), async (tx) => {
      await tx.query(
        "update learning_topics set content=$2,content_format='html' where id=$1",
        [id(r), html],
      );
      return { html };
    });
  });
  app.post("/topics/:id/duplicate", async (r) => {
    await need(r, "content.write");
    const b = z
      .object({
        position: z.number().int().positive(),
        title: z.string().trim().min(1).max(200),
      })
      .parse(r.body);
    return mutate(r, "topic.duplicate", id(r), async (tx) => {
      const [topic] = await tx.query<{ id: string; book_id: string }>(
        `insert into learning_topics(book_id,title,content,position,content_format) select book_id,$2,content,$3,content_format from learning_topics where id=$1 returning id,book_id`,
        [id(r), b.title, b.position],
      );
      if (!topic) throw new ApiError(404, "NOT_FOUND", "Topic not found");
      await tx.query(
        "insert into learning_exams(book_id,topic_id,kind) values($1,$2,'topic')",
        [topic.book_id, topic.id],
      );
      await tx.query(
        "insert into learning_questions(topic_id,text,options,correct_index,explanation,published,difficulty,tags,image_url) select $2,text,options,correct_index,explanation,false,difficulty,tags,image_url from learning_questions where topic_id=$1",
        [id(r), topic.id],
      );
      return topic;
    });
  });
  app.post("/topics/bulk", async (r) => {
    await need(r, "content.write");
    const b = z
      .object({ ids: z.array(uuid).min(1).max(100), published: z.boolean() })
      .parse(r.body);
    return mutate(r, "topics.bulk.publish", undefined, async (tx) => {
      await tx.query(
        "update learning_topics set published=$2 where id=any($1::uuid[])",
        [b.ids, b.published],
      );
      await tx.query(
        "update learning_exams set published=$2 where topic_id=any($1::uuid[]) and kind='topic'",
        [b.ids, b.published],
      );
      return { ok: true };
    });
  });
  app.delete("/topics/:id", async (r) => {
    await need(r, "content.write");
    return mutate(r, "topic.delete", id(r), async (tx) => {
      const used = await tx.query(
        "select a.id from learning_attempts a join learning_exams e on e.id=a.exam_id where e.topic_id=$1 or exists(select 1 from learning_attempt_questions aq join learning_questions q on q.id=aq.question_id where aq.attempt_id=a.id and q.topic_id=$1) limit 1",
        [id(r)],
      );
      const progress = await tx.query(
        "select user_id from learning_progress where topic_id=$1 limit 1",
        [id(r)],
      );
      if (used.length || progress.length)
        throw new ApiError(
          409,
          "CONTENT_IN_USE",
          "Unpublish topics with student history instead of deleting them",
        );
      const grants = await tx.query(
        "select id from learning_attempt_grants where exam_id in (select id from learning_exams where topic_id=$1) limit 1",
        [id(r)],
      );
      if (grants.length)
        throw new ApiError(
          409,
          "CONTENT_IN_USE",
          "Unpublish topics with attempt grants instead of deleting them",
        );
      await tx.query(
        "delete from learning_alerts where exam_id in (select id from learning_exams where topic_id=$1)",
        [id(r)],
      );
      await tx.query("delete from learning_exams where topic_id=$1", [id(r)]);
      await tx.query("delete from learning_questions where topic_id=$1", [
        id(r),
      ]);
      await tx.query("delete from learning_topics where id=$1", [id(r)]);
      return { ok: true };
    });
  });
  app.post("/topics/:id/import", async (r) => {
    await need(r, "content.write");
    const b = z
      .object({
        csv: z.string().min(1).max(300000),
        commit: z.boolean().default(false),
      })
      .parse(r.body);
    const parsed = Papa.parse<Record<string, string>>(b.csv, {
      header: true,
      skipEmptyLines: true,
    });
    const errors: Array<{ row: number; message: string }> = parsed.errors.map(
      (e) => ({ row: (e.row ?? 0) + 2, message: e.message }),
    );
    const valid: Array<z.infer<typeof learningQuestionSchema>> = [];
    if (!parsed.data.length)
      errors.push({ row: 1, message: "No question rows found" });
    const seen = new Set<string>();
    for (const [i, row] of parsed.data.entries()) {
      const q = learningQuestionSchema.safeParse({
        text: row.text,
        options: [row.option1, row.option2, row.option3, row.option4],
        correctIndex: row.correctIndex?.trim() ? Number(row.correctIndex) : NaN,
        explanation: row.explanation ?? "",
        published: false,
      });
      if (!q.success) {
        errors.push({
          row: i + 2,
          message: q.error.issues
            .map((x) => x.path.join(".") + ": " + x.message)
            .join("; "),
        });
        continue;
      }
      const key = q.data.text.trim().toLowerCase();
      if (seen.has(key)) {
        errors.push({ row: i + 2, message: "Duplicate question in import" });
        continue;
      }
      seen.add(key);
      valid.push(q.data);
    }
    if (valid.length > 500)
      throw new ApiError(
        400,
        "IMPORT_LIMIT",
        "Maximum 500 questions per import",
      );
    const existing = await db.query<{ text: string }>(
      "select text from learning_questions where topic_id=$1 and lower(text)=any($2::text[])",
      [id(r), [...seen]],
    );
    for (const e of existing)
      errors.push({ row: 0, message: "Question already exists: " + e.text });
    if (!b.commit || errors.length)
      return { committed: false, valid: valid.length, errors };
    return mutate(
      r,
      "questions.import",
      id(r),
      async (tx) => {
        await tx.query(
          "select id from learning_topics where id=$1 for update",
          [id(r)],
        );
        for (const q of valid) {
          const duplicate = await tx.query(
            "select id from learning_questions where topic_id=$1 and lower(text)=lower($2)",
            [id(r), q.text],
          );
          if (duplicate.length)
            throw new ApiError(
              409,
              "DUPLICATE_QUESTION",
              "Question already exists",
            );
          await tx.query(
            "insert into learning_questions(topic_id,text,options,correct_index,explanation,published) values($1,$2,$3,$4,$5,false)",
            [
              id(r),
              q.text,
              JSON.stringify(q.options),
              q.correctIndex,
              q.explanation,
            ],
          );
        }
        return { committed: true, valid: valid.length, errors: [] };
      },
      { count: valid.length },
    );
  });
  app.put("/questions/:id/metadata", async (r) => {
    await need(r, "content.write");
    const b = z
      .object({
        difficulty: z.enum(["easy", "medium", "hard"]),
        tags: z.array(z.string().trim().min(1).max(50)).max(20),
        imageUrl: z.string().max(500).nullable(),
      })
      .parse(r.body);
    if (b.imageUrl) safeDestination(b.imageUrl);
    return mutate(r, "question.metadata", id(r), async (tx) => {
      await tx.query(
        "update learning_questions set difficulty=$2,tags=$3,image_url=$4 where id=$1",
        [id(r), b.difficulty, JSON.stringify(b.tags), b.imageUrl],
      );
      return { ok: true };
    });
  });
  app.put("/exams/:id/rules", async (r) => {
    await need(r, "exams.write");
    const b = z
      .object({
        passingScore: z.number().int().min(1).max(100).nullable(),
        maxAttempts: z.number().int().min(1).max(10).nullable(),
        distribution: z
          .object({
            easy: z.number().int().min(0).max(100),
            medium: z.number().int().min(0).max(100),
            hard: z.number().int().min(0).max(100),
          })
          .nullable(),
      })
      .parse(r.body);
    const [exam] = await db.query<{ kind: string }>(
      "select kind from learning_exams where id=$1",
      [id(r)],
    );
    if (!exam) throw new ApiError(404, "NOT_FOUND", "Exam not found");
    if (exam.kind === "final" && b.passingScore !== null)
      throw new ApiError(
        400,
        "FINAL_THRESHOLDS",
        "Final book thresholds are managed in exam settings",
      );
    const [settings] = await db.query<{
      value: { topicQuestionCount: number };
    }>("select value from learning_settings");
    const expected =
      exam.kind === "topic" ? settings.value.topicQuestionCount : 20;
    if (
      b.distribution &&
      Object.values(b.distribution).reduce((a, v) => a + v, 0) !== expected
    )
      throw new ApiError(
        400,
        "INVALID_DISTRIBUTION",
        "Difficulty counts must sum to the exam question count",
      );
    return mutate(r, "exam.rules", id(r), async (tx) => {
      await tx.query(
        "update learning_exams set passing_score=$2,max_attempts=$3,difficulty_distribution=$4 where id=$1",
        [
          id(r),
          b.passingScore,
          b.maxAttempts,
          b.distribution ? JSON.stringify(b.distribution) : null,
        ],
      );
      return { ok: true };
    });
  });
  app.post("/media", { bodyLimit: 8 * 1024 * 1024 }, async (r) => {
    if (
      !(await canAdmin(db, r.admin!, "content.write")) &&
      !(await canAdmin(db, r.admin!, "marketing.write")) &&
      !(await canAdmin(db, r.admin!, "settings.write")) && !(await canAdmin(db,r.admin!,'games.write'))
    )
      throw new ApiError(403, "ADMIN_FORBIDDEN", "Upload permission required");
    const b = z
      .object({ base64: z.string().max(7 * 1024 * 1024) })
      .parse(r.body);
    const bytes = Buffer.from(b.base64, "base64");
    if (bytes.length > 5 * 1024 * 1024)
      throw new ApiError(400, "IMAGE_TOO_LARGE", "Maximum image size is 5 MB");
    let image: Buffer;
    let info: { width?: number; height?: number };
    try {
      const decoder = sharp(bytes, { limitInputPixels: 20000000 });
      const m = await decoder.metadata();
      if (
        !["jpeg", "png", "webp"].includes(m.format ?? "") ||
        !m.width ||
        !m.height ||
        m.width > 4096 ||
        m.height > 4096
      )
        throw new Error();
      image = await decoder.png().toBuffer();
      info = m;
    } catch {
      throw new ApiError(
        400,
        "INVALID_IMAGE",
        "Upload a valid PNG, JPEG or WebP up to 4096×4096",
      );
    }
    return mutate(
      r,
      "media.upload",
      undefined,
      async (tx) => {
        const [asset] = await tx.query<{ id: string }>(
          "insert into media_assets(content,mime,width,height,created_by) values($1,'image/png',$2,$3,$4) returning id",
          [image, info.width, info.height, r.admin!.id],
        );
        return { url: "/api/content/media/" + asset.id };
      },
      { bytes: bytes.length },
    );
  });
  app.get("/banners", async (r) => {
    await need(r, "marketing.read");
    const p = paging.parse(r.query);
    return db.query(
      "select * from homepage_banners order by priority desc,updated_at desc limit $1 offset $2",
      [p.limit, p.offset],
    );
  });
  async function saveBanner(r: FastifyRequest, existing: boolean) {
    await need(r, "marketing.write");
    const b = bannerSchema.parse(r.body);
    safeDestination(b.destination);
    if (b.imageUrl) safeDestination(b.imageUrl);
    return mutate(
      r,
      existing ? "banner.update" : "banner.create",
      existing ? id(r) : undefined,
      async (tx) => {
        const values = [
          b.title,
          b.description,
          b.imageUrl,
          b.destination,
          b.placement,
          b.startsAt,
          b.endsAt,
          b.priority,
          b.enabled,
        ];
        if (existing)
          return (
            await tx.query(
              "update homepage_banners set title=$2,description=$3,image_url=$4,destination=$5,placement=$6,starts_at=$7,ends_at=$8,priority=$9,enabled=$10,updated_at=now() where id=$1 returning *",
              [id(r), ...values],
            )
          )[0];
        return (
          await tx.query(
            "insert into homepage_banners(title,description,image_url,destination,placement,starts_at,ends_at,priority,enabled,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *",
            [...values, r.admin!.id],
          )
        )[0];
      },
    );
  }
  app.post("/banners", (r) => saveBanner(r, false));
  app.put("/banners/:id", (r) => saveBanner(r, true));
  app.delete("/banners/:id", async (r) => {
    await need(r, "marketing.write");
    return mutate(r, "banner.delete", id(r), async (tx) => {
      await tx.query("delete from homepage_banners where id=$1", [id(r)]);
      return { ok: true };
    });
  });
  app.get("/audit", async (r) => {
    await need(r, "audit.read");
    const q = paging
      .extend({
        search: z.string().max(200).default(""),
        adminId: uuid.optional(),
        target: z.string().max(100).default(""),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
      })
      .parse(r.query);
    return db.query(
      `select l.id,l.action,l.entity_type,l.entity_id,l.details,l.created_at,a.email as admin_email from admin_audit_logs l left join admin_users a on a.id=l.admin_id where ($1='' or l.action ilike '%'||$1||'%' or l.entity_type ilike '%'||$1||'%') and ($2::uuid is null or l.admin_id=$2) and ($3='' or l.entity_id=$3) and ($4::date is null or l.created_at>=$4::date) and ($5::date is null or l.created_at<$5::date+1) order by l.created_at desc limit $6 offset $7`,
      [
        q.search,
        q.adminId ?? null,
        q.target,
        q.from ?? null,
        q.to ?? null,
        q.limit,
        q.offset,
      ],
    );
  });
  app.get("/support", async (r) => {
    await need(r, "support.read");
    const q = paging
      .extend({
        search: z.string().max(200).default(""),
        target: z.string().max(100).default(""),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
      })
      .parse(r.query);
    return db.query(
      "select s.*,p.nickname from support_requests s join profiles p on p.id=s.user_id where ($3='' or s.subject ilike '%'||$3||'%' or s.message ilike '%'||$3||'%' or p.nickname ilike '%'||$3||'%') and ($4='' or s.user_id::text=$4) and ($5::date is null or s.created_at>=$5::date) and ($6::date is null or s.created_at<$6::date+1) order by s.created_at desc limit $1 offset $2",
      [q.limit, q.offset, q.search, q.target, q.from ?? null, q.to ?? null],
    );
  });
  app.post("/support/:id/reply", async (r) => {
    await need(r, "support.write");
    const b = z
      .object({
        reply: z.string().trim().min(1).max(5000),
        status: z.enum(["open", "in_progress", "closed"]),
      })
      .parse(r.body);
    return mutate(r, "support.reply", id(r), async (tx) => {
      await tx.query(
        "update support_requests set admin_reply=$2,status=$3,updated_at=now() where id=$1",
        [id(r), b.reply, b.status],
      );
      return { ok: true };
    });
  });
  app.get("/coins", async (r) => {
    await need(r, "coins.read");
    const q = paging
      .extend({
        userId: uuid.optional(),
        search: z.string().max(200).default(""),
        target: z.string().max(100).default(""),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
      })
      .parse(r.query);
    return db.query(
      `select c.*,p.nickname,count(*) over(partition by c.idempotency_key)::int as key_occurrences from coin_transactions c join profiles p on p.id=c.user_id where ($3='' or c.user_id::text=$3) and ($4='' or p.nickname ilike '%'||$4||'%' or c.description ilike '%'||$4||'%') and ($5::date is null or c.created_at>=$5::date) and ($6::date is null or c.created_at<$6::date+1) order by c.created_at desc limit $1 offset $2`,
      [
        q.limit,
        q.offset,
        q.userId ?? q.target,
        q.search,
        q.from ?? null,
        q.to ?? null,
      ],
    );
  });
  app.get("/records/:kind", async (r) => {
    const kind = z
      .enum(["certificates", "subscriptions", "payments"])
      .parse((r.params as { kind: string }).kind);
    await need(r, kind === "subscriptions" ? "premium.read" : kind + ".read");
    const q = paging
      .extend({
        search: z.string().max(200).default(""),
        status: z.string().max(30).default(""),
        grade: z.preprocess(
          (v) => (v === "" ? undefined : v),
          z.coerce.number().int().min(5).max(11).optional(),
        ),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
      })
      .parse(r.query);
    if (kind === "certificates")
      return db.query(
        `select c.verification_id,c.student_name,c.grade,c.book_title,c.score,c.completed_at,c.revoked_at from learning_certificates c where ($1='' or c.student_name ilike '%'||$1||'%' or c.verification_id::text=$1 or c.book_title ilike '%'||$1||'%') and ($2='' or ($2='revoked' and c.revoked_at is not null) or ($2='active' and c.revoked_at is null)) and ($3::integer is null or c.grade=$3) and ($4::date is null or c.completed_at>=$4::date) and ($5::date is null or c.completed_at<$5::date+1) order by c.completed_at desc limit $6 offset $7`,
        [
          q.search,
          q.status,
          q.grade ?? null,
          q.from ?? null,
          q.to ?? null,
          q.limit,
          q.offset,
        ],
      );
    if (kind === "payments")
      return db.query(
        `select p.id,u.nickname,p.provider,p.provider_transaction_id,p.amount_minor,p.currency,p.status,p.verified_at,p.created_at from learning_payments p join profiles u on u.id=p.user_id where ($1='' or u.nickname ilike '%'||$1||'%' or p.id::text=$1 or p.provider_transaction_id=$1) and ($2='' or p.status=$2) and ($3::date is null or p.created_at>=$3::date) and ($4::date is null or p.created_at<$4::date+1) order by p.created_at desc limit $5 offset $6`,
        [q.search, q.status, q.from ?? null, q.to ?? null, q.limit, q.offset],
      );
    return db.query(
      `select s.id,u.nickname,s.source,s.starts_at,s.expires_at,s.revoked_at,case when s.revoked_at is not null then 'revoked' when s.expires_at<=now() then 'expired' when s.starts_at>now() then 'pending' else 'active' end as status from learning_subscriptions s join profiles u on u.id=s.user_id where ($1='' or u.nickname ilike '%'||$1||'%' or s.user_id::text=$1) and ($2='' or ($2='active' and s.revoked_at is null and s.starts_at<=now() and s.expires_at>now()) or ($2='expired' and s.expires_at<=now()) or ($2='revoked' and s.revoked_at is not null)) and ($3::date is null or s.starts_at>=$3::date) and ($4::date is null or s.starts_at<$4::date+1) order by s.expires_at desc limit $5 offset $6`,
      [q.search, q.status, q.from ?? null, q.to ?? null, q.limit, q.offset],
    );
  });
  app.get("/reports/:kind", async (r, reply) => {
    await need(r, "reports.read");
    const kind = z
      .enum([
        "users",
        "registrations",
        "progress",
        "exams",
        "certificates",
        "subscriptions",
        "payments",
        "coins",
      ])
      .parse((r.params as { kind: string }).kind);
    const q = paging
      .extend({
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        format: z.enum(["json", "csv"]).default("json"),
      })
      .parse(r.query);
    if (q.format === "csv") await need(r, "reports.export");
    const permission: Record<string, string> = {
      users: "users.read",
      registrations: "users.read",
      progress: "users.read",
      exams: "exams.read",
      certificates: "certificates.read",
      subscriptions: "premium.read",
      payments: "payments.read",
      coins: "coins.read",
    };
    await need(r, permission[kind]);
    let rows: Record<string, unknown>[];
    if (kind === "users" || kind === "registrations") {
      const data = await filteredUsers(
        db,
        userFilters.parse(r.query),
        await canAdmin(db, r.admin!, "users.private"),
        q.format === "csv",
      );
      rows = data.rows;
    } else {
      const configs: Record<
        string,
        { table: string; columns: string; date: string }
      > = {
        progress: {
          table: "learning_progress",
          columns: "user_id,topic_id,completed_at",
          date: "completed_at",
        },
        exams: {
          table: "learning_attempts",
          columns:
            "id,user_id,exam_id,attempt_number,status,score,started_at,finished_at",
          date: "started_at",
        },
        certificates: {
          table: "learning_certificates",
          columns:
            "verification_id,student_name,grade,book_title,score,completed_at,revoked_at",
          date: "completed_at",
        },
        subscriptions: {
          table: "learning_subscriptions",
          columns: "id,user_id,source,starts_at,expires_at,revoked_at",
          date: "starts_at",
        },
        payments: {
          table: "learning_payments",
          columns:
            "id,user_id,provider,amount_minor,currency,status,verified_at,created_at",
          date: "created_at",
        },
        coins: {
          table: "coin_transactions",
          columns: "id,user_id,amount,type,created_at",
          date: "created_at",
        },
      };
      const c = configs[kind];
      rows = await db.query(
        `select ${c.columns} from ${c.table} where ($1::date is null or ${c.date}>=$1::date) and ($2::date is null or ${c.date}<$2::date+1) order by ${c.date} desc limit $3 offset $4`,
        [
          q.from ?? null,
          q.to ?? null,
          q.format === "csv" ? 10000 : q.limit,
          q.offset,
        ],
      );
    }
    if (q.format === "csv") {
      await recordAudit(db, {
        adminId: r.admin!.id,
        action: "report.export",
        entityType: kind,
        details: {
          from: q.from,
          to: q.to,
          rows: rows.length,
          offset: q.offset,
        },
      });
      return reply
        .type("text/csv; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="zerolax-${kind}.csv"`,
        )
        .header("cache-control", "no-store")
        .header("x-export-limit", "10000")
        .send(csvOutput(rows));
    }
    return { rows, offset: q.offset, limit: q.limit };
  });
};
export const publicContentRoutes: FastifyPluginAsync<{ db: Db }> = async (
  app,
  { db },
) => {
  app.get("/config", async () => {
    const s = await getPlatformSettings(db);
    return {
      name: s.name,
      logoUrl: s.logoUrl,
      faviconUrl: s.faviconUrl,
      languages: s.languages,
      timezone: s.timezone,
      registrationEnabled: s.registrationEnabled,
      maintenance: s.maintenance,
      supportEmail: s.supportEmail,
    };
  });
  app.get("/banners", async (r) => {
    const placement = z
      .enum(["home", "learning", "premium"])
      .parse((r.query as { placement?: string }).placement ?? "home");
    return db.query(
      "select id,title,description,image_url,destination from homepage_banners where placement=$1 and enabled=true and starts_at<=now() and ends_at>now() order by priority desc,updated_at desc limit 10",
      [placement],
    );
  });
  app.get("/media/:id", async (r, reply) => {
    const [m] = await db.query<{ content: Buffer; mime: string }>(
      "select content,mime from media_assets where id=$1",
      [id(r)],
    );
    if (!m) throw new ApiError(404, "NOT_FOUND", "Image not found");
    return reply
      .type(m.mime)
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "public,max-age=31536000,immutable")
      .send(Buffer.from(m.content));
  });
};
