# Telegram DeepSeek Bot

这是一个运行在 Cloudflare Workers 上的 Telegram 机器人，集成了 DeepSeek AI 模型。

## 功能特性

- 🤖 基于 DeepSeek AI 的智能对话
- 💾 使用 Cloudflare D1 数据库保存聊天历史
- 🔒 支持 Webhook 密钥验证
- 📱 Telegram 私人聊天支持
- ⚡ 无服务器架构，自动扩展

## 支持的命令

- `/start` - 显示欢迎信息
- `/help` - 显示帮助信息
- `/new` - 清空聊天记忆，开始新对话

## 前置要求

- Cloudflare 账户
- Telegram Bot Token（从 [@BotFather](https://t.me/botfather) 获取）
- DeepSeek API 密钥（从 [DeepSeek 官网](https://www.deepseek.com) 获取）

## 部署步骤

### 1. 克隆仓库

```bash
git clone https://github.com/www1982/telegrambot.git
cd telegrambot
```

### 2. 安装依赖

```bash
npm install -g wrangler
npm install
```

### 3. 配置环境变量

编辑 `wrangler.toml` 文件，填入你的 API 密钥：

```toml
[env.production.vars]
DEEPSEEK_API_KEY = "your-deepseek-api-key"
TELEGRAM_BOT_TOKEN = "your-telegram-bot-token"
TELEGRAM_WEBHOOK_SECRET = "your-webhook-secret"
```

### 4. 创建 D1 数据库

```bash
wrangler d1 create telegram-bot-db
```

然后更新 `wrangler.toml` 中的 `database_id`。

### 5. 部署到 Cloudflare

```bash
wrangler deploy --env production
```

### 6. 配置 Telegram Webhook

部署成功后，使用你的 Worker URL 配置 Telegram Webhook：

```bash
curl -X POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-worker-url.workers.dev/telegram", "secret_token": "your-webhook-secret"}'
```

## 项目结构

```
.
├── src/
│   └── index.js          # 主要 Worker 代码
├── wrangler.toml         # Cloudflare Workers 配置
├── .gitignore
├── README.md
└── package.json
```

## 工作原理

1. 用户在 Telegram 发送消息
2. Telegram 将更新发送到 Worker 的 `/telegram` 端点
3. Worker 验证 Webhook 密钥
4. 读取用户的聊天历史（最近 20 条消息）
5. 调用 DeepSeek API 获取回答
6. 保存本轮对话到 D1 数据库
7. 将回答发送回 Telegram（超长内容自动分段）

## API 成本

- **Cloudflare Workers**: 免费额度 10 万请求/天
- **DeepSeek API**: 按 token 计费（详见 [DeepSeek 定价](https://www.deepseek.com)）
- **Cloudflare D1**: 免费额度足够小规模使用

## 故障排查

### DeepSeek API 错误

- 检查 API 密钥是否正确
- 确认账户余额充足
- 验证使用的模型是否可用

### Telegram 消息未送达

- 检查 Bot Token 是否正确
- 验证 Webhook 密钥配置
- 查看 Worker 日志了解错误详情

### 数据库错误

- 确认 D1 数据库已创建并绑定
- 检查 `wrangler.toml` 中的 `database_id` 是否正确

## 安全建议

- 不要在代码中硬编码 API 密钥，使用环境变量
- 启用 Telegram Webhook 密钥验证
- 定期轮换 API 密钥
- 监控 Worker 日志检测异常活动

## 许可证

MIT

## 联系方式

如有问题或建议，欢迎提交 Issue 或 PR。
