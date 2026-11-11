import { Telegraf, Markup, type Context } from "telegraf";
import { message } from "telegraf/filters";
import {
  LANGUAGE_LABELS,
  nicknameSchema,
  translate,
  type Language,
} from "@zerolax/shared";
import { BotApiClient, BotApiError, type BotUserStatus } from "./api";
import { loadBotConfig, type BotConfig } from "./config";

const FLAGS: Record<Language, string> = {
  uz: "🇺🇿",
  ru: "🇷🇺",
  en: "🇬🇧",
};

/** Strips formatting and returns an E.164-like number, or null when invalid. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `+${digits}`;
}

function languageKeyboard(prefix: "reg" | "chg") {
  return Markup.inlineKeyboard(
    (Object.keys(LANGUAGE_LABELS) as Language[]).map((language) => [
      Markup.button.callback(
        `${FLAGS[language]} ${LANGUAGE_LABELS[language]}`,
        `${prefix}:lang:${language}`,
      ),
    ]),
  );
}

function openAppKeyboard(config: BotConfig, language: Language, path = "") {
  const label = translate(language, "bot.openApp");
  const url = path ? new URL(path, config.webappUrl).href : config.webappUrl;
  const button = config.webappUrl.startsWith("https://")
    ? Markup.button.webApp(label, url)
    : Markup.button.url(label, url);
  return Markup.inlineKeyboard([[button]]);
}

function phoneKeyboard(language: Language) {
  return Markup.keyboard([
    [Markup.button.contactRequest(translate(language, "bot.phoneButton"))],
  ])
    .resize()
    .oneTime();
}

function normalizeCommand(text: string): string | null {
  const match = text.trim().match(/^\/([a-zA-Z]+)(?:@\w+)?$/);
  return match ? match[1].toLowerCase() : null;
}

async function safeEdit(
  ctx: Context,
  text: string,
  extra?: ReturnType<typeof Markup.inlineKeyboard>,
) {
  try {
    await ctx.editMessageText(text, extra);
  } catch {
    await ctx.reply(text, extra);
  }
}

async function replyServiceError(
  ctx: Context,
  error: unknown,
  language: Language = "uz",
) {
  console.error("[bot] request failed", error);
  const key =
    error instanceof BotApiError && error.code === "NETWORK_ERROR"
      ? "errors.network"
      : "bot.serviceError";
  await ctx.reply(translate(language, key)).catch(() => undefined);
}

export function createBot(config: BotConfig): Telegraf {
  if (!config.token) {
    throw new Error("createBot requires a Telegram bot token");
  }

  const api = new BotApiClient(config.apiBaseUrl, config.token);
  const bot = new Telegraf(config.token, { handlerTimeout: 30_000 });

  async function statusFor(context: Context): Promise<BotUserStatus | null> {
    if (!context.from) return null;
    try {
      return await api.getUser(context.from.id);
    } catch (error) {
      await replyServiceError(context, error);
      return null;
    }
  }

  async function languageFor(
    context: Context,
    status?: BotUserStatus | null,
  ): Promise<Language> {
    if (status?.profile) return status.profile.language;
    if (status?.state?.language) return status.state.language;
    if (context.from?.language_code === "ru") return "ru";
    if (context.from?.language_code === "en") return "en";
    return "uz";
  }

  async function beginRegistration(
    context: Context,
    language: Language = "uz",
  ) {
    if (!context.from) return;
    await api.setState(context.from.id, {
      step: "language",
      language: null,
      nickname: null,
    });
    await context.reply(
      `${translate(language, "bot.startWelcome")}\n\n${translate(language, "bot.startChooseLanguage")}`,
      languageKeyboard("reg"),
    );
  }

  async function showAlreadyRegistered(
    context: Context,
    profile: NonNullable<BotUserStatus["profile"]>,
  ) {
    const language = profile.language;
    if (profile.status === "blocked") {
      await context.reply(translate(language, "errors.blocked"));
      return;
    }
    await context.reply(
      translate(language, "bot.alreadyRegistered"),
      openAppKeyboard(config, language),
    );
  }

  bot.start(async (context) => {
    if (!context.from) return;
    // Private-chat menus also cover accounts that already had a command-menu override.
    if (
      context.chat.type === "private" &&
      config.webappUrl.startsWith("https://")
    ) {
      await context.telegram
        .setChatMenuButton({
          chatId: context.chat.id,
          menuButton: {
            type: "web_app",
            text: "ZEROLAX",
            web_app: { url: config.webappUrl },
          },
        })
        .catch(() =>
          console.warn(
            "[bot] private menu could not be updated; inline Mini App button remains available",
          ),
        );
    }
    const status = await statusFor(context);
    if (!status) return;

    if (status.registered && status.profile) {
      await showAlreadyRegistered(context, status.profile);
      return;
    }

    const language = await languageFor(context, status);
    await beginRegistration(context, language);
  });

  bot.help(async (context) => {
    const status = await statusFor(context);
    const language = await languageFor(context, status);
    const registered = Boolean(status?.registered && status.profile);
    await context.reply(
      `${translate(language, "bot.helpText")}\n\n${translate(language, "bot.startWelcome")}`,
      registered ? openAppKeyboard(config, language) : undefined,
    );
  });
  bot.command("app", async (context) => {
    const status = await statusFor(context);
    if (!status) return;
    if (status.registered && status.profile)
      await showAlreadyRegistered(context, status.profile);
    else await beginRegistration(context, await languageFor(context, status));
  });

  bot.command("games", async (context) => {
    const status = await statusFor(context);
    if (!status) return;
    const language = await languageFor(context, status);
    if (!status.registered || !status.profile) {
      await beginRegistration(context, language);
      return;
    }
    if (status.profile.status === "blocked") {
      await context.reply(translate(language, "errors.blocked"));
      return;
    }
    await context.reply(
      translate(language, "games.title"),
      openAppKeyboard(config, language, "/exams"),
    );
  });

  bot.command("profile", async (context) => {
    const status = await statusFor(context);
    if (!status) return;
    const language = await languageFor(context, status);
    if (!status.registered || !status.profile) {
      await context.reply(translate(language, "errors.registrationRequired"));
      await beginRegistration(context, language);
      return;
    }
    const profile = status.profile;
    if (profile.status === "blocked") {
      await context.reply(translate(profile.language, "errors.blocked"));
      return;
    }
    await context.reply(
      translate(profile.language, "bot.profileText", {
        nickname: profile.nickname,
        coins: profile.coinsBalance,
        iq: profile.iqCompleted,
        entrance: profile.entranceCompleted,
      }),
      openAppKeyboard(config, profile.language),
    );
  });

  bot.command("language", async (context) => {
    const status = await statusFor(context);
    if (!status) return;
    const language = await languageFor(context, status);
    if (!status.registered || !status.profile) {
      await beginRegistration(context, language);
      return;
    }
    if (status.profile.status === "blocked") {
      await context.reply(translate(status.profile.language, "errors.blocked"));
      return;
    }
    await context.reply(
      translate(status.profile.language, "bot.languageChoose"),
      languageKeyboard("chg"),
    );
  });

  bot.command("support", async (context) => {
    const status = await statusFor(context);
    const language = await languageFor(context, status);
    const registered = Boolean(status?.registered && status.profile);
    await context.reply(
      translate(language, "bot.supportText", { email: config.supportEmail }),
      registered ? openAppKeyboard(config, language) : undefined,
    );
  });

  bot.on("callback_query", async (context) => {
    const query = context.callbackQuery;
    const data = query && "data" in query ? query.data : undefined;
    if (!data || !context.from) {
      await context.answerCbQuery().catch(() => undefined);
      return;
    }

    const parts = data.split(":");
    if (parts.length !== 3 || (parts[0] !== "reg" && parts[0] !== "chg")) {
      await context.answerCbQuery().catch(() => undefined);
      return;
    }
    const [, action, rawLanguage] = parts;
    if (rawLanguage !== "uz" && rawLanguage !== "ru" && rawLanguage !== "en") {
      await context.answerCbQuery().catch(() => undefined);
      return;
    }
    const language = rawLanguage as Language;
    const telegramId = context.from.id;

    try {
      if (action === "lang" && parts[0] === "reg") {
        const status = await api.getUser(telegramId);
        if (status.registered) {
          await context.answerCbQuery().catch(() => undefined);
          if (status.profile)
            await showAlreadyRegistered(context, status.profile);
          return;
        }
        await api.setState(telegramId, {
          step: "nickname",
          language,
          nickname: null,
        });
        await context.answerCbQuery().catch(() => undefined);
        await safeEdit(
          context,
          `${translate(language, "bot.startWelcome")}\n\n${translate(language, "bot.askNickname")}`,
        );
        return;
      }

      const result = await api.setLanguage(telegramId, language);
      await context.answerCbQuery().catch(() => undefined);
      await safeEdit(
        context,
        translate(result.profile.language, "bot.languageUpdated"),
        openAppKeyboard(config, result.profile.language),
      );
    } catch (error) {
      await context.answerCbQuery().catch(() => undefined);
      if (error instanceof BotApiError && error.code === "USER_NOT_FOUND") {
        await beginRegistration(context, language);
        return;
      }
      await replyServiceError(context, error, language);
    }
  });

  bot.on(message("contact"), async (context) => {
    if (!context.from) return;
    const contact = context.message.contact;
    const status = await statusFor(context);
    if (!status) return;
    const language = await languageFor(context, status);

    if (status.registered) {
      await context.reply(
        translate(language, "bot.alreadyRegistered"),
        openAppKeyboard(config, language),
      );
      return;
    }
    if (status.state?.step !== "phone" || !status.state.nickname) {
      await context.reply(translate(language, "errors.registrationRequired"));
      await beginRegistration(context, language);
      return;
    }
    if (
      !contact.user_id ||
      String(contact.user_id) !== String(context.from.id)
    ) {
      await context.reply(
        translate(language, "bot.phoneInvalid"),
        phoneKeyboard(language),
      );
      return;
    }

    const phone = normalizePhone(contact.phone_number);
    if (!phone) {
      await context.reply(
        translate(language, "bot.phoneInvalid"),
        phoneKeyboard(language),
      );
      return;
    }

    try {
      const { profile } = await api.register(context.from.id, {
        nickname: status.state.nickname,
        language,
        phone,
        username: context.from.username ?? null,
        firstName: context.from.first_name ?? null,
        lastName: context.from.last_name ?? null,
      });
      await api.clearState(context.from.id).catch(() => undefined);
      await context.reply(
        translate(profile.language, "bot.registrationComplete"),
        {
          reply_markup: { remove_keyboard: true },
        },
      );
      await context.reply(
        translate(profile.language, "bot.startWelcome"),
        openAppKeyboard(config, profile.language),
      );
    } catch (error) {
      if (error instanceof BotApiError && error.code === "NICKNAME_TAKEN") {
        await api.setState(context.from.id, {
          step: "nickname",
          language,
          nickname: null,
        });
        await context.reply(translate(language, "bot.nicknameTaken"), {
          reply_markup: { remove_keyboard: true },
        });
        return;
      }
      if (error instanceof BotApiError && error.code === "ALREADY_REGISTERED") {
        const fresh = await api.getUser(context.from.id).catch(() => null);
        if (fresh?.profile) {
          await showAlreadyRegistered(context, fresh.profile);
          return;
        }
      }
      await replyServiceError(context, error, language);
    }
  });

  bot.on(message("text"), async (context) => {
    if (!context.from) return;
    const text = context.message.text.trim();
    if (text.startsWith("/")) {
      // Unknown command.
      const status = await statusFor(context);
      const language = await languageFor(context, status);
      await context.reply(translate(language, "bot.helpText"));
      return;
    }

    const status = await statusFor(context);
    if (!status) return;
    const language = await languageFor(context, status);

    if (status.registered && status.profile) {
      await showAlreadyRegistered(context, status.profile);
      return;
    }

    if (status.state?.step === "nickname") {
      const parsed = nicknameSchema.safeParse(text);
      if (!parsed.success) {
        await context.reply(translate(language, "bot.nicknameInvalid"));
        return;
      }
      try {
        const available = await api.isNicknameAvailable(
          context.from.id,
          parsed.data,
        );
        if (!available) {
          await context.reply(translate(language, "bot.nicknameTaken"));
          return;
        }
        await api.setState(context.from.id, {
          step: "phone",
          language,
          nickname: parsed.data,
        });
        await context.reply(
          translate(language, "bot.askPhone"),
          phoneKeyboard(language),
        );
      } catch (error) {
        await replyServiceError(context, error, language);
      }
      return;
    }

    if (status.state?.step === "phone") {
      await context.reply(
        translate(language, "bot.askPhone"),
        phoneKeyboard(language),
      );
      return;
    }

    await beginRegistration(context, language);
  });

  bot.catch((error, context) => {
    console.error("[bot] unhandled update error", error);
    void context
      .reply(translate("uz", "bot.serviceError"))
      .catch(() => undefined);
  });

  return bot;
}

function registerProcessHandlers(bot: Telegraf): void {
  const stop = (signal: string) => {
    console.log(`[bot] received ${signal}, stopping`);
    bot.stop(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
}

export async function startBot(
  config: BotConfig = loadBotConfig(),
): Promise<void> {
  if (!config.token) {
    console.warn(
      "[bot] TELEGRAM_BOT_TOKEN is not configured. The bot is running in idle mode; " +
        "set the token in .env to connect to Telegram.",
    );
    const timer = setInterval(() => undefined, 60_000);
    const shutdown = () => {
      clearInterval(timer);
      process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    return;
  }

  const bot = createBot(config);
  registerProcessHandlers(bot);

  if (config.webappUrl.startsWith("https://")) {
    try {
      await bot.telegram.setChatMenuButton({
        menuButton: {
          type: "web_app",
          text: "ZEROLAX",
          web_app: { url: config.webappUrl },
        },
      });
    } catch (error) {
      console.warn("[bot] could not configure the menu button", error);
    }
  } else {
    console.warn(
      `[bot] TELEGRAM_WEBAPP_URL (${config.webappUrl}) is not HTTPS; ` +
        "skipping the WebApp menu button configuration.",
    );
  }

  try {
    await bot.telegram.setMyCommands([
      { command: "start", description: "ZEROLAX" },
      { command: "app", description: "Open Mini App / Ilovani ochish" },
      { command: "games", description: "Math games / Matematik o‘yinlar" },
      { command: "profile", description: "Profile / Profil" },
      { command: "language", description: "Language / Til / Язык" },
      { command: "support", description: "Support / Yordam / Помощь" },
      { command: "help", description: "Help / Yordam / Помощь" },
    ]);
  } catch (error) {
    console.warn("[bot] could not register bot commands", error);
  }

  await bot.launch(() => {
    console.log(`[bot] @${config.botUsername} polling started`);
  });
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").includes("apps/bot/");

if (isDirectRun) {
  startBot().catch((error) => {
    console.error("[bot] failed to start", error);
    process.exit(1);
  });
}
