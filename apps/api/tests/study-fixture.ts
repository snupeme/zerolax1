import type { TestContext } from "./helpers";
import { createTestUser, loginAs, authHeader } from "./helpers";
export async function studyFixture(ctx: TestContext) {
  const user = await createTestUser(ctx.db);
  const login = await loginAs(ctx.app, user.telegramId);
  async function book(
    subject: string,
    grade: number,
    title: string,
    position = 1,
  ) {
    return (
      await ctx.db.query<{ id: string }>(
        "insert into learning_books(subject,grade,title,position,published,description) values($1,$2,$3,$4,true,$5) returning id",
        [subject, grade, title, position, title + " description"],
      )
    )[0].id;
  }
  const algebra = await book("algebra", 7, "Algebra Seven");
  const geometry = await book("geometry", 7, "Geometry Seven");
  const algebra8 = await book("algebra", 8, "Algebra Eight");
  const geometry8 = await book("geometry", 8, "Geometry Eight");
  const next = await book("algebra", 7, "Algebra Seven Next", 2);
  async function topics(bookId: string, prefix: string) {
    const result: Array<{ id: string; examId: string }> = [];
    for (let position = 1; position <= 4; position++) {
      const [topic] = await ctx.db.query<{ id: string }>(
        `insert into learning_topics(book_id,title,content,content_format,position,published) values($1,$2,$3,'html',$4,true) returning id`,
        [
          bookId,
          prefix + " topic " + position,
          "<h2>" +
            prefix +
            " material " +
            position +
            '</h2><p>Examples and exercises.</p><span data-type="inline-math" data-latex="x^2"></span>',
          position,
        ],
      );
      const [exam] = await ctx.db.query<{ id: string }>(
        "insert into learning_exams(book_id,topic_id,kind,published) values($1,$2,'topic',true) returning id",
        [bookId, topic.id],
      );
      await ctx.db.query(
        `insert into learning_questions(topic_id,text,options,correct_index,published) select $1,'Question '||n,'["A","B","C","D"]'::jsonb,0,true from generate_series(1,12) n`,
        [topic.id],
      );
      result.push({ id: topic.id, examId: exam.id });
    }
    return result;
  }
  const algebraTopics = await topics(algebra, "Algebra");
  const geometryTopics = await topics(geometry, "Geometry");
  const [admin] = await ctx.db.query<{ id: string }>(
    "select id from admin_users limit 1",
  );
  async function premium() {
    await ctx.db.query(
      `insert into learning_subscriptions(user_id,source,starts_at,expires_at,admin_id,reason) values($1,'admin',now()-interval '1 minute',now()+interval '1 day',$2,'Navigation test')`,
      [user.id, admin.id],
    );
  }
  const url = (subject = "algebra", grade = 7, bookId = algebra) =>
    `/api/learning/user/subjects/${subject}/grades/${grade}/books/${bookId}`;
  return {
    user,
    session: login,
    headers: authHeader(login.accessToken),
    algebra,
    geometry,
    algebra8,
    geometry8,
    next,
    algebraTopics,
    geometryTopics,
    premium,
    url,
  };
}
