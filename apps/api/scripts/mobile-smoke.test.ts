import { chromium } from "@playwright/test";
import { preview } from "vite";
import { resolve } from "node:path";
import { createTestContext, createTestUser, loginAs } from "../tests/helpers";
import { existsSync } from "node:fs";
import { it } from "vitest";

// Isolated, in-memory database: this check never alters development or production users.
it("runs the learning and admin flows at mobile width", async () => {
  const ctx = await createTestContext();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let web: Awaited<ReturnType<typeof preview>> | undefined;
  try {
    await ctx.app.listen({ host: "127.0.0.1", port: 4109 });
    web = await preview({
      configFile: false,
      root: resolve("apps/web"),
      preview: {
        host: "127.0.0.1",
        port: 4189,
        strictPort: true,
        proxy: { "/api": "http://127.0.0.1:4109" },
      },
    });
    const executablePath =
      process.env.CHROME_PATH ??
      [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      ].find((p) => existsSync(p));
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ["--disable-gpu"],
    });
    const user = await createTestUser(ctx.db);
    const session = await loginAs(ctx.app, user.telegramId);
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4189");
    await page.evaluate((s) => {
      localStorage.setItem("zerolax.session.v1", JSON.stringify(s));
      localStorage.setItem("zerolax.language", "uz");
    }, session);
    await page.goto("http://127.0.0.1:4189/learning");
    try {
      await page
        .getByRole("heading", { name: "Ta’lim", exact: true })
        .waitFor({ timeout: 10000 });
    } catch (e) {
      console.log("PAGE ERRORS", errors);
      console.log("BODY", await page.locator("body").innerText());
      throw e;
    }
    await page.getByText("Hozircha nashr qilingan kitob yo‘q.").waitFor();
    await page.getByRole("textbox").fill("Mobil Sinovchi");
    await page.getByRole("spinbutton").fill("7");
    const save = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/learning/user/student") &&
        r.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Saqlash", exact: true }).click();
    if ((await save).status() !== 200)
      throw new Error("Student detail save failed");
    const [book] = await ctx.db.query<{ id: string }>(
      "insert into learning_books(title,subject,grade,position,published) values('Mobile QA Book','algebra',7,1,true) returning id",
    );
    const [topic] = await ctx.db.query<{ id: string }>(
      "insert into learning_topics(book_id,title,content,position,published) values($1,'Mobile QA Topic','Mobile test lesson',1,true) returning id",
      [book.id],
    );
    await ctx.db.query(
      'insert into learning_questions(topic_id,text,options,correct_index) select $1,\'Mobile Question \'||n,\'["A","B","C","D"]\'::jsonb,0 from generate_series(1,12) n',
      [topic.id],
    );
    await ctx.db.query(
      "insert into learning_exams(book_id,topic_id,kind,published) values($1,$2,'topic',true)",
      [book.id, topic.id],
    );
    await page.goto(`http://127.0.0.1:4189/learning/books/${book.id}`);
    await page
      .getByRole("button", { name: "Mavzu testi", exact: true })
      .click();
    await page.getByRole("radio").first().waitFor();
    for (let i = 0; i < 10; i++) {
      const saved = page.waitForResponse(
        (r) => r.url().includes("/answers") && r.request().method() === "PUT",
      );
      await page
        .getByRole("radio")
        .nth(i * 4)
        .check();
      if ((await saved).status() !== 200) throw new Error("Answer save failed");
    }
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Testni yakunlash", exact: true })
      .click();
    await page.getByText("Ball: 100/100", { exact: true }).waitFor();
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
    )
      throw new Error("Horizontal overflow in mobile exam");
    await page.screenshot({
      path: ".data/mobile-learning-result.png",
      fullPage: true,
    });
    const adminResponse = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { email: "admin@zerolax.test", password: "test-admin-password" },
    });
    await page.evaluate(
      (s) => localStorage.setItem("zerolax.admin.v1", JSON.stringify(s)),
      adminResponse.json(),
    );
    await page.goto("http://127.0.0.1:4189/admin/learning");
    await page.getByRole("heading", { name: "Ta’lim", exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Imtihon qoidalari", exact: true })
      .click();
    await page
      .getByText("Keyingi kitobni ochish bali", { exact: true })
      .waitFor();
    await page.getByLabel("Keyingi kitobni ochish bali").fill("72");
    const ruleSave = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/learning/admin/settings") &&
        r.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Saqlash", exact: true }).click();
    if ((await ruleSave).status() !== 200)
      throw new Error("Settings save failed");
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
    )
      throw new Error("Horizontal overflow on mobile");
    await page.screenshot({
      path: ".data/mobile-admin-learning.png",
      fullPage: true,
    });
    await page.goto("http://127.0.0.1:4189/admin");
    await page
      .getByRole("heading", { name: "Analitika", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Menyu", exact: true }).click();
    await page
      .getByRole("link", { name: "Reklama va bannerlar", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Reklama va bannerlar", exact: true })
      .waitFor();
    await page
      .getByLabel("Nomi", { exact: true })
      .fill("Mobile scheduled banner");
    await page
      .getByLabel("Boshlanish vaqti", { exact: true })
      .fill("2020-01-01T00:00");
    await page
      .getByLabel("Tugash vaqti", { exact: true })
      .fill("2030-01-01T00:00");
    await page.getByRole("checkbox", { name: "Faol", exact: true }).check();
    const bannerSave = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/control/banners") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Saqlash", exact: true }).click();
    if ((await bannerSave).status() !== 200)
      throw new Error("Banner save failed");
    if (
      (
        await ctx.app.inject({ url: "/api/content/banners?placement=home" })
      ).json().length !== 1
    )
      throw new Error("Scheduled banner not public");
    await page.getByRole("button", { name: "Mavzu", exact: true }).click();
    if (
      !(await page
        .locator("html")
        .evaluate((el) => el.classList.contains("dark")))
    )
      throw new Error("Dark theme not applied");
    await page.screenshot({
      path: ".data/mobile-admin-banners-dark.png",
      fullPage: true,
    });
    await page.goto("http://127.0.0.1:4189/admin/control/roles");
    await page
      .getByRole("heading", {
        name: "Rollar va xodimlar",
        exact: true,
        level: 1,
      })
      .waitFor();
    await page.getByLabel("Rol", { exact: true }).first().fill("mobile_editor");
    await page.getByLabel("Ism", { exact: true }).first().fill("Mobile Editor");
    await page
      .getByRole("checkbox", { name: "content.write", exact: true })
      .check();
    const roleSave = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/control/roles") &&
        r.request().method() === "PUT",
    );
    await page
      .getByRole("button", { name: "Saqlash", exact: true })
      .first()
      .click();
    if ((await roleSave).status() !== 200) throw new Error("Role save failed");
    await page
      .getByRole("button", { name: "Mobile Editor", exact: true })
      .waitFor();
    await page.goto("http://127.0.0.1:4189/admin/control/content");
    try {
      await page
        .getByLabel("Fanlar va sinflar", { exact: true })
        .selectOption(book.id, { timeout: 10000 });
    } catch (e) {
      console.log(
        "Editor errors",
        errors,
        "URL",
        page.url(),
        "BODY",
        await page.locator("body").innerText(),
      );
      throw e;
    }
    await page
      .getByRole("button", { name: "1. Mobile QA Topic", exact: true })
      .click();
    await page.locator(".tiptap").fill("Rich mobile lesson");
    await page
      .getByRole("textbox", { name: "Formula", exact: true })
      .fill("x^2");
    await page.getByRole("button", { name: "Formula", exact: true }).click();
    const editorSave = page.waitForResponse(
      (r) =>
        r.url().endsWith("/rich-content") && r.request().method() === "PUT",
    );
    await page
      .locator("section")
      .filter({ has: page.locator(".tiptap") })
      .getByRole("button", { name: "Saqlash", exact: true })
      .click();
    if ((await editorSave).status() !== 200)
      throw new Error("Rich lesson save failed");
    await page
      .getByRole("button", { name: "Oldindan ko‘rish", exact: true })
      .click();
    await page.locator(".katex").first().waitFor();
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
    )
      throw new Error("Horizontal overflow in admin editor");
    await page.screenshot({
      path: ".data/mobile-admin-rich-editor.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("http://127.0.0.1:4189/admin");
    await page
      .getByRole("heading", { name: "Analitika", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Menyu", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector("aside")!.getBoundingClientRect().width <= 81,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: ".data/desktop-admin-analytics.png",
      fullPage: true,
    });
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
      "Mobile browser smoke passed: learning page, student details, admin settings, no overflow or runtime errors.",
    );
  } finally {
    await browser?.close();
    await new Promise<void>((done) =>
      web ? web.httpServer.close(() => done()) : done(),
    );
    await ctx.close();
  }
}, 120000);
