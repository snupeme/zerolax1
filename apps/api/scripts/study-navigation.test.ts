import { it } from "vitest";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createTestContext } from "../tests/helpers";
import { studyFixture } from "../tests/study-fixture";
it("verifies all Algebra/Geometry navigation scenarios with browser and Telegram Back", async () => {
  const ctx = await createTestContext();
  let web: Awaited<ReturnType<typeof preview>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const f = await studyFixture(ctx);
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
    browser = await chromium.launch({
      executablePath:
        process.env.CHROME_PATH ??
        [
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        ].find(existsSync),
      headless: true,
      args: ["--disable-gpu"],
    });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Exercise the real BackButton API integration without requiring a Telegram account in CI.
    await page.route("https://telegram.org/js/telegram-web-app.js", (r) =>
      r.fulfill({
        contentType: "text/javascript",
        body: `window.Telegram={WebApp:{initData:'',initDataUnsafe:{},version:'9.0',platform:'test',colorScheme:'light',themeParams:{},ready(){},expand(){},enableClosingConfirmation(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},offEvent(){},BackButton:{show(){window.__tgBackVisible=true},hide(){window.__tgBackVisible=false},onClick(fn){window.__tgBackHandler=fn},offClick(fn){if(window.__tgBackHandler===fn)window.__tgBackHandler=null}},openTelegramLink(){}}};`,
      }),
    );
    const host = "http://127.0.0.1:4189";
    await page.addInitScript((session) => {
      localStorage.setItem("zerolax.session.v1", JSON.stringify(session));
      localStorage.setItem("zerolax.language", "uz");
    }, f.session);
    await page.goto(host);
    try {
      await page
        .locator('main a[href="/algebra"]')
        .click({ timeout: 10000 });
    } catch (e) {
      console.log(
        "Navigation page errors",
        errors,
        "BODY",
        await page.locator("body").innerText(),
      );
      throw e;
    }
    await expect(page).toHaveURL(host + "/algebra");
    for (let grade = 5; grade <= 11; grade++)
      await expect(
        page.getByRole("link", { name: `${grade}-SINF`, exact: true }),
      ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Algebra", exact: true }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/certificates|attempts/);
    await page.screenshot({
      path: ".data/algebra-grade-selection.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "7-SINF", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Algebra Seven", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Algebra Eight", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText("Geometry Seven", { exact: true })).toHaveCount(
      0,
    );
    await page.goBack();
    await expect(page).toHaveURL(host + "/algebra");
    await page.getByRole("link", { name: "7-SINF", exact: true }).click();
    await page.getByRole("link", { name: "Boshlash", exact: true }).click();
    await expect(page).toHaveURL(
      `${host}/algebra/grades/7/books/${f.algebra}/topics`,
    );
    await page.getByRole("button", { name: /Algebra topic 1/ }).click();
    await expect(
      page.getByText("Algebra material 1", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Algebra material 1", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".katex").first()).toBeVisible();
    await page
      .getByRole("button", { name: "Mavzu testini boshlash", exact: true })
      .click();
    await expect(page.getByRole("radio")).toHaveCount(40);
    for (let i = 0; i < 10; i++) {
      const saved = page.waitForResponse(
        (r) => r.url().endsWith("/answers") && r.request().method() === "PUT",
      );
      await page
        .getByRole("radio")
        .nth(i * 4)
        .check();
      expect((await saved).status()).toBe(200);
    }
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Testni yakunlash", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Ball: 100/100", exact: true }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/certificates/);
    await page.evaluate(() => {
      (window as unknown as { __tgBackHandler: () => void }).__tgBackHandler();
    });
    await expect(page).toHaveURL(
      `${host}/algebra/grades/7/books/${f.algebra}/topics/${f.algebraTopics[0].id}`,
    );
    await page.getByRole("button", { name: "Orqaga", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /Algebra topic 1/ }),
    ).toContainText("O‘tilgan");
    await page.getByRole("button", { name: /Algebra topic 4/ }).click();
    await expect(page.getByRole("alert")).toContainText("faol Premium");
    await expect(page).toHaveURL(
      `${host}/algebra/grades/7/books/${f.algebra}/topics`,
    );
    await page.goto(
      `${host}/algebra/grades/7/books/${f.algebra}/topics/${f.algebraTopics[3].id}`,
    );
    await expect(
      page.getByRole("heading", { name: "Premium kerak", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Algebra material 4", { exact: true }),
    ).toHaveCount(0);
    await f.premium();
    await page.reload();
    await expect(
      page.getByText("Algebra material 4", { exact: true }),
    ).toBeVisible();
    await page.goto(host);
    await page.locator('main a[href="/geometry"]').click();
    await expect(page).toHaveURL(host + "/geometry");
    for (let grade = 5; grade <= 11; grade++)
      await expect(
        page.getByRole("link", { name: `${grade}-SINF`, exact: true }),
      ).toBeVisible();
    await page.getByRole("link", { name: "7-SINF", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Geometry Seven", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Algebra Seven", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText("Geometry Eight", { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole("link", { name: "Boshlash", exact: true }).click();
    await page.getByRole("button", { name: /Geometry topic 1/ }).click();
    await expect(
      page.getByText("Geometry material 1", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Algebra material 1", { exact: true }),
    ).toHaveCount(0);
    await page.goto(`${host}/geometry/grades/7/books/${f.algebra}/topics`);
    await expect(
      page.getByRole("heading", { name: "Sahifa topilmadi", exact: true }),
    ).toBeVisible();
    await page.goto(`${host}/algebra/grades/99/books`);
    await expect(
      page.getByRole("heading", { name: "Sahifa topilmadi", exact: true }),
    ).toBeVisible();
    await page.goto(`${host}/profile`);
    await page.getByRole('link',{name:'Sertifikatlar',exact:true}).click();
    await expect(
      page.getByRole("heading", {
        name: "Mening sertifikatlarim",
        exact: true,
      }),
    ).toBeVisible();
    const progress = await ctx.db.query<{ subject: string; count: number }>(
      "select b.subject,count(*)::int from learning_progress p join learning_topics t on t.id=p.topic_id join learning_books b on b.id=t.book_id where p.user_id=$1 group by b.subject",
      [f.user.id],
    );
    expect(progress).toEqual([{ subject: "algebra", count: 1 }]);
    expect(
      await ctx.db.query(
        "select id from learning_certificates where user_id=$1",
        [f.user.id],
      ),
    ).toHaveLength(0);
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(host + "/geometry");
    await expect(
      page.getByRole("link", { name: "11-SINF", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".data/geometry-grade-selection-desktop.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    await new Promise<void>((done) =>
      web ? web.httpServer.close(() => done()) : done(),
    );
    await ctx.close();
  }
}, 120000);
