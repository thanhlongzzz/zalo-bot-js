import { config as loadEnv } from "dotenv";
import {
  ApplicationBuilder,
  CommandHandler,
  MessageHandler,
  filters,
  type Update,
} from "../src";
import { t } from "../src/i18n/runtime";

async function main() {
  loadEnv();

  const token = process.env.ZALO_BOT_TOKEN;
  if (!token) {
    throw new Error(t("env.missingToken"));
  }

  const app = new ApplicationBuilder().token(token).build();

  app.addHandler(
    new CommandHandler("start", async (update: Update) => {
      await update.message?.replyText(t("reply.start"));
    }),
  );

  app.addHandler(
    new MessageHandler(filters.TEXT.and(filters.COMMAND.not()), async (update: Update) => {
      const text = update.message?.text?.trim().toLowerCase();

      if (text === "hello") {
        await update.message?.replyAction("typing");
        await update.message?.replyText(t("reply.hello"));
        await update.message?.replyText(`ChatID: ${update.message?.chat.id}, User ID: ${update.message?.fromUser?.id}, Username: ${update.message?.fromUser?.displayName}`);
        await update.message?.replySticker("eb64dc0ae14f0811515e");
        await update.message?.replyPhoto("https://zalo-api.zadn.vn/1/2/a/e/3/12720/icon_pre/124x124.png", "Hello đây là test gửi ảnh");
      }
    }),
  );

  console.log(t("app.pollingStarted"));
  console.log(t("app.pollingHint"));

  await app.runPolling();
}

void main().catch((error) => {
  console.error(t("test.helloBotFailed"));
  console.error(error);
  process.exitCode = 1;
});
