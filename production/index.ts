import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config as loadEnv } from "dotenv";
import {
  ApplicationBuilder,
  Bot,
  Application,
  CommandHandler,
  MessageHandler,
  filters,
  Update,
} from "../src";

// Trình mô phỏng Database lưu trữ danh sách Chat ID của người dùng đăng ký nhận tin
const subscribedChatIds = new Set<string>();

async function follow(update: Update) {
  const chatId = update.message?.chat.id;
  if (!chatId) return;

  subscribedChatIds.add(chatId);
  await update.message?.replyText("Bạn đã đăng ký nhận thông báo định kỳ thành công!");
  console.log(`User ${chatId} followed.`);
}

async function echo(update: Update) {
  if (!update.message?.text) return;
  await update.message.replyText(`Bot nhận được: ${update.message.text}`);
}

function startBroadcasting(bot: Bot) {
  console.log("Started broadcasting job (1 minute interval)...");
  setInterval(async () => {
    if (subscribedChatIds.size === 0) return;

    const weatherUpdate = `🌤 Thông báo định kỳ!\nThời gian: ${new Date().toLocaleString()}`;
    for (const chatId of subscribedChatIds) {
      try {
        await bot.sendMessage(chatId, weatherUpdate);
        console.log(`Đã gửi thông báo cho ${chatId}`);
      } catch (error) {
        console.error(`Lỗi gửi thông báo cho ${chatId}:`, error);
      }
    }
  }, 1000 * 60); // Gửi mỗi 60 giây (bạn có thể đổi thành 24h hoặc dùng cron)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function main() {
  loadEnv();

  const token = process.env.ZALO_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing ZALO_BOT_TOKEN");
  }

  // Dựa vào biến môi trường để chạy Webhook hoặc Polling
  const useWebhook = process.env.USE_WEBHOOK === "true";
  
  if (useWebhook) {
    console.log("⚡ Bot đang chạy ở chế độ Webhook...");
    const webhookUrl = process.env.ZALO_WEBHOOK_URL;
    const secretToken = process.env.ZALO_WEBHOOK_SECRET ?? "replace-me";

    if (!webhookUrl) {
      throw new Error("Missing ZALO_WEBHOOK_URL for webhook mode");
    }

    const bot = new Bot({ token });
    const app = new Application(bot);

    app.addHandler(new CommandHandler("follow", follow));
    app.addHandler(new MessageHandler(filters.TEXT.and(filters.COMMAND.not()), echo));

    await bot.initialize();
    await bot.setWebhook(webhookUrl, secretToken);

    // Bắt đầu job thông báo
    startBroadcasting(bot);

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "POST" || req.url !== "/webhook") {
        res.statusCode = 404;
        res.end("not found");
        return;
      }

      try {
        const body = await readBody(req);
        const payload = JSON.parse(body) as { result?: Record<string, unknown> };
        const update = Update.fromApi(payload.result as never, bot);

        if (update) {
          await app.processUpdate(update);
        }

        res.statusCode = 200;
        res.end("ok");
      } catch (error) {
        console.error("Webhook process error:", error);
        res.statusCode = 500;
        res.end("error");
      }
    });

    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    server.listen(port, () => {
      console.log(`🌐 Webhook server is listening on port ${port}`);
    });

  } else {
    console.log("🔄 Bot đang chạy ở chế độ Polling...");
    const app = new ApplicationBuilder().token(token).build();
    
    app.addHandler(new CommandHandler("follow", follow));
    app.addHandler(new MessageHandler(filters.TEXT.and(filters.COMMAND.not()), echo));

    // Bắt đầu job thông báo
    startBroadcasting(app.bot);

    await app.runPolling();
  }
}

void main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
