import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config as loadEnv } from "dotenv";
import {
  ApplicationBuilder,
  Bot,
  Application,
  CommandHandler,
  MessageHandler,
  filters,
  createFilter,
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

// Queue helper to serialize database writes and avoid EBUSY errors
class WriteQueue {
  private queue: Promise<void> = Promise.resolve();

  async add(operation: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(async () => {
      try {
        await operation();
      } catch (error) {
        console.error("Database write error in queue:", error);
      }
    });
    return this.queue;
  }
}

let db: any = null;
const writeQueue = new WriteQueue();

import fs from "node:fs";
import path from "node:path";

async function initDB() {
  const { JSONFilePreset } = await import("lowdb/node");
  // Mặc định users là một object rỗng
  const defaultData: DbSchema = { users: {} };
  const dbPath = "data/db.json";
  const oldDbPath = "db.json";

  // Migrations: Di chuyển db.json cũ vào thư mục data nếu tồn tại
  if (fs.existsSync(oldDbPath) && !fs.existsSync(dbPath)) {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    try {
      fs.renameSync(oldDbPath, dbPath);
      console.log(`📦 Moved ${oldDbPath} to ${dbPath}`);
    } catch (e) {
      console.warn(`⚠️ Could not move ${oldDbPath} to ${dbPath}, will use default content.`);
    }
  }

  // Đảm bảo thư mục data tồn tại để tránh lỗi EBUSY khi mount file trực tiếp trong Docker
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  try {
    db = await JSONFilePreset<DbSchema>(dbPath, defaultData);
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      console.warn(`⚠️ ${dbPath} is corrupted or empty. Re-initializing with default data...`);
      try {
        const content = fs.readFileSync(dbPath, "utf-8");
        if (content.trim()) {
           fs.writeFileSync(`${dbPath}.bak`, content);
        }
      } catch (e) {}
      fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2));
      db = await JSONFilePreset<DbSchema>(dbPath, defaultData);
    } else {
      throw error;
    }
  }
}

async function handleFollow(update: Update) {
  const text = update.message?.text || "";
  const chatId = update.message?.chat.id;
  const fromUser = update.message?.fromUser;

  if (!chatId || !fromUser) return;

  // Xác định topic từ command: /follow-<topic> hoặc /follow <topic>
  let topic = "all";
  if (text.startsWith("/follow-")) {
    topic = text.substring(8).trim() || "all";
  } else if (text.startsWith("/follow")) {
    topic = text.substring(7).trim() || "all";
  } else {
    // Không đạt điều kiện prefix, có thể bỏ qua hoặc báo lỗi (nhưng filter đã filter rồi)
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

  await writeQueue.add(() => db.write());

  await update.message?.replyText(`✅ [${fromUser.displayName || "Bạn"}] đã đăng ký nhận thông báo chủ đề: [${topic}]`);
}

async function handleUnfollow(update: Update) {
  const text = update.message?.text || "";
  const chatId = update.message?.chat.id;

  if (!chatId || !db.data.users[chatId]) {
    await update.message?.replyText("❌ Bạn chưa đăng ký nhận thông báo chủ đề nào.");
    return;
  }

  let topic = "all";
  if (text.startsWith("/unfollow-")) {
    topic = text.substring(10).trim() || "all";
  } else if (text.startsWith("/unfollow")) {
    topic = text.substring(9).trim() || "all";
  } else {
    return;
  }

  const user = db.data.users[chatId];
  if (topic === "all") {
    user.topics = [];
  } else {
    user.topics = user.topics.filter((t: string) => t !== topic);
  }

  await writeQueue.add(() => db.write());
  await update.message?.replyText(`✅ Đã hủy đăng ký nhận thông báo chủ đề: [${topic}]`);
}

async function handleShowTopics(update: Update) {
  const chatId = update.message?.chat.id;
  if (!chatId) return;

  const user = db.data.users[chatId];

  if (!user || !user.topics || user.topics.length === 0) {
    await update.message?.replyText("📝 Bạn hiện chưa đăng ký nhận thông báo chủ đề nào.");
    return;
  }

  const topicList = user.topics.map((t: string) => `- ${t}`).join("\n");
  await update.message?.replyText(`📋 Các chủ đề bạn đang follow:\n${topicList}`);
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
      if (user.topics.includes("auto")) {
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

  // Đăng ký các handler với filter cụ thể để tránh block lẫn nhau
  app.addHandler(new MessageHandler(filters.TEXT.and(createFilter((u: Update) => u.message?.text?.startsWith("/follow") || false)), handleFollow));
  app.addHandler(new MessageHandler(filters.TEXT.and(createFilter((u: Update) => u.message?.text?.startsWith("/unfollow") || false)), handleUnfollow));
  app.addHandler(new MessageHandler(filters.TEXT.and(createFilter((u: Update) => {
    const text = u.message?.text?.toLowerCase() || "";
    return text === "/topics" || text === "/list" || text === "show all topic";
  })), handleShowTopics));

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
