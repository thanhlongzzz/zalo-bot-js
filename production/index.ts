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

// Cấu trúc Database mới: Lưu thông tin chi tiết user và các topic họ quan tâm
type UserData = {
  chatId: string;
  displayName?: string;
  accountName?: string;
  userId?: string;
  accountType?: string;
  canJoinGroups?: boolean;
  topics: string[];
  lastSeen: string;
};

type DbSchema = {
  users: Record<string, UserData>;
};

let db: any = null;

async function initDB() {
  const { JSONFilePreset } = await import("lowdb/node");
  // Mặc định users là một object rỗng
  db = await JSONFilePreset<DbSchema>("db.json", { users: {} });
}

async function handleFollow(update: Update) {
  const text = update.message?.text || "";
  const chatId = update.message?.chat.id;
  const fromUser = update.message?.fromUser;

  if (!chatId || !fromUser) return;

  // Xác định topic từ command
  let topic = "all";
  if (text.startsWith("/follow-")) {
    topic = text.substring(8).trim() || "all";
  } else if (text === "/follow") {
    topic = "all";
  } else {
    return;
  }

  // Khởi tạo hoặc cập nhật thông tin user
  if (!db.data.users[chatId]) {
    db.data.users[chatId] = {
      chatId: chatId,
      displayName: fromUser.displayName,
      accountName: fromUser.accountName,
      userId: fromUser.id,
      accountType: fromUser.accountType,
      canJoinGroups: fromUser.canJoinGroups,
      topics: [],
      lastSeen: new Date().toISOString(),
    };
  }

  const user = db.data.users[chatId];
  // Cập nhật thông tin mới nhất
  user.displayName = fromUser.displayName || user.displayName;
  user.accountName = fromUser.accountName || user.accountName;
  user.userId = fromUser.id || user.userId;
  user.accountType = fromUser.accountType || user.accountType;
  user.canJoinGroups = fromUser.canJoinGroups || user.canJoinGroups;
  user.lastSeen = new Date().toISOString();

  // Thêm topic nếu chưa có
  if (!user.topics.includes(topic)) {
    user.topics.push(topic);
  }

  await db.write();

  await update.message?.replyText(`✅ [${fromUser.displayName || "Bạn"}] đã đăng ký nhận thông báo chủ đề: [${topic}]`);
}

async function echo(update: Update) {
  if (!update.message?.text) return;
  if (update.message.text.startsWith("/follow")) return;
  await update.message.replyText(`Bot nhận được: ${update.message.text}`);
}

function startBroadcasting(bot: Bot) {
  console.log("Started background job...");
  setInterval(async () => {
    const users = Object.values(db.data.users) as UserData[];
    if (!db || users.length === 0) return;

    for (const user of users) {
      if (user.topics.includes("all")) {
        try {
          await bot.sendMessage(user.chatId, `🌤 Thông báo tự động lúc ${new Date().toLocaleTimeString()}`);
        } catch (e) { }
      }
    }
  }, 1000 * 60 * 60);
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
  await initDB();

  const token = process.env.ZALO_BOT_TOKEN;
  if (!token) throw new Error("Missing ZALO_BOT_TOKEN");

  const useWebhook = process.env.USE_WEBHOOK === "true";
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  let bot: Bot;
  let app: Application;

  if (useWebhook) {
    bot = new Bot({ token });
    app = new Application(bot);
  } else {
    app = new ApplicationBuilder().token(token).build();
    bot = app.bot;
  }

  app.addHandler(new MessageHandler(filters.TEXT, handleFollow));
  app.addHandler(new MessageHandler(filters.TEXT.and(filters.COMMAND.not()), echo));

  await bot.initialize();

  if (useWebhook) {
    const webhookUrl = process.env.ZALO_WEBHOOK_URL;
    const secretToken = process.env.ZALO_WEBHOOK_SECRET ?? "replace-me";
    if (!webhookUrl) throw new Error("Missing ZALO_WEBHOOK_URL");
    await bot.setWebhook(webhookUrl, secretToken);
  } else {
    void app.runPolling();
  }

  startBroadcasting(bot);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (useWebhook && req.method === "POST" && req.url === "/webhook") {
      try {
        const body = await readBody(req);
        const payload = JSON.parse(body);
        const update = Update.fromApi(payload.result as never, bot);
        if (update) await app.processUpdate(update);
        res.end("ok");
      } catch (error) {
        res.statusCode = 500;
        res.end("error");
      }
      return;
    }

    if (req.method === "POST" && req.url === "/broadcast") {
      try {
        const body = await readBody(req);
        const { message, topic } = JSON.parse(body);
        const targetTopic = topic || "all";

        if (!message) {
          res.statusCode = 400;
          res.end("Missing message");
          return;
        }

        const users = Object.values(db.data.users) as UserData[];
        let count = 0;

        for (const user of users) {
          if (targetTopic === "all" || user.topics.includes(targetTopic)) {
            try {
              await bot.sendMessage(user.chatId, `[${targetTopic.toUpperCase()}] ${message}`);
              count++;
            } catch (err) {
              console.error(`Lỗi gửi tới ${user.chatId}:`, err);
            }
          }
        }

        res.end(JSON.stringify({ status: "success", delivered: count, topic: targetTopic }));
      } catch (error) {
        res.statusCode = 500;
        res.end("Error");
      }
      return;
    }

    res.statusCode = 404;
    res.end("Not Found");
  });

  server.listen(port, () => {
    console.log(`🌐 Server running at port ${port}`);
  });
}

void main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
