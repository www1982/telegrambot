export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 用浏览器检查 Worker 是否正常运行
    if (request.method === "GET") {
      return new Response("Telegram DeepSeek Bot is running.");
    }

    // Telegram 只向这个路径发送消息
    if (request.method !== "POST" || url.pathname !== "/telegram") {
      return new Response("Not found", { status: 404 });
    }

    // 验证 Telegram Webhook（配置好密钥后生效）
    if (
      env.TELEGRAM_WEBHOOK_SECRET &&
      request.headers.get("X-Telegram-Bot-Api-Secret-Token") !==
        env.TELEGRAM_WEBHOOK_SECRET
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const update = await request.json();
      const msg = update.message;

      // 只处理私人聊天中的文字消息
      if (
        !msg ||
        !msg.text ||
        !msg.chat ||
        msg.chat.type !== "private" ||
        !msg.from ||
        msg.from.is_bot
      ) {
        return new Response("OK");
      }

      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const text = msg.text.trim();

      // 创建历史记录表；已存在时不会重复创建
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      // /start：显示使用说明
      if (text === "/start" || text.startsWith("/start ")) {
        await sendTelegram(
          env,
          chatId,
          "你好！我是你的 DeepSeek 助手。\n" +
          "直接发送文字即可聊天。\n\n" +
          "/new - 清空聊天记忆\n" +
          "/help - 查看帮助"
        );
        return new Response("OK");
      }

      // /help：帮助
      if (text === "/help") {
        await sendTelegram(
          env,
          chatId,
          "直接发送文字与 DeepSeek 对话。\n" +
          "我会记住最近的对话，服务器重启后也会保留。\n" +
          "发送 /new 可以清空聊天记忆。"
        );
        return new Response("OK");
      }

      // /new：清空当前用户的历史
      if (text === "/new") {
        await env.DB.prepare(
          "DELETE FROM messages WHERE chat_id = ? AND user_id = ?"
        ).bind(String(chatId), String(userId)).run();

        await sendTelegram(env, chatId, "聊天记忆已清空，我们重新开始吧！");
        return new Response("OK");
      }

      if (!text) {
        return new Response("OK");
      }

      // 读取最近 20 条历史消息
      const result = await env.DB.prepare(`
        SELECT role, content FROM messages
        WHERE chat_id = ? AND user_id = ?
        ORDER BY id DESC LIMIT 20
      `).bind(String(chatId), String(userId)).all();

      const history = (result.results || [])
        .reverse()
        .map(row => ({
          role: row.role,
          content: row.content
        }));

      history.push({ role: "user", content: text });

      // 调用 DeepSeek API
      const apiResponse = await fetch(
        "https://api.deepseek.com/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "deepseek-flash",
            messages: [
              {
                role: "system",
                content: "你是一个友好、准确的 AI 助手。请结合上下文回答问题，默认使用用户的语言。"
              },
              ...history
            ],
            stream: false
          })
        }
      );

      if (!apiResponse.ok) {
        console.error("DeepSeek API error:", apiResponse.status);
        await sendTelegram(
          env,
          chatId,
          "调用 DeepSeek 失败，请检查 API 密钥、账户余额和模型配置。"
        );
        return new Response("DeepSeek API error", { status: 200 });
      }

      const data = await apiResponse.json();
      const answer = data.choices?.[0]?.message?.content;

      if (typeof answer !== "string" || !answer.trim()) {
        await sendTelegram(env, chatId, "这次没有生成回答，请稍后重试。");
        return new Response("OK");
      }

      // 成功后保存本轮对话
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO messages (chat_id, user_id, role, content)
          VALUES (?, ?, 'user', ?)
        `).bind(String(chatId), String(userId), text),

        env.DB.prepare(`
          INSERT INTO messages (chat_id, user_id, role, content)
          VALUES (?, ?, 'assistant', ?)
        `).bind(String(chatId), String(userId), answer)
      ]);

      // Telegram 单条文字消息有长度限制，分段发送
      for (let i = 0; i < answer.length; i += 3500) {
        await sendTelegram(env, chatId, answer.slice(i, i + 3500));
      }

      return new Response("OK");
    } catch (error) {
      console.error("Bot error:", error?.message || "Unknown error");
      // 返回 500 让 Telegram 在必要时重试该更新
      return new Response("Internal error", { status: 500 });
    }
  }
};

async function sendTelegram(env, chatId, text) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    }
  );

  if (!response.ok) {
    console.error("Telegram sendMessage failed:", response.status);
    throw new Error("Telegram message delivery failed");
  }
}
