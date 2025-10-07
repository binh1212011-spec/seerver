const express = require("express");
const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");
require("dotenv").config();

const app = express();
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(process.env.PORT || 3000, () =>
  console.log("🌐 Keep-alive server running")
);

// ======================
// ⚙️ Discord Client
// ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Channel, Partials.Message]
});

// ======================
// ⚙️ ENV CONFIG
// ======================
const {
  GUILD_ID,
  MONITOR_CHANNEL_ID,
  EXCLUDED_ROLE_ID,
  CH_ALL,
  CH_MEMBERS,
  CH_ONLINE,
  CH_SERVER
} = process.env;

// ======================
// 🔧 CACHE + STATE
// ======================
let lastActive = Date.now();
let messageLog = []; // timestamps tin nhắn
let updateTimeout;

// ======================
// 🧠 Utility
// ======================
const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function safeRename(channelId, newName) {
  try {
    const ch = client.channels.cache.get(channelId);
    if (!ch) return;
    if (ch.name !== newName) {
      await ch.setName(newName);
      console.log(`✅ Renamed: ${newName}`);
    }
  } catch (err) {
    console.warn(`⚠️ Rename failed: ${err.message}`);
  }
}

// ======================
// 📊 Update counters
// ======================
async function updateCounts() {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return;

  const members = guild.members.cache.filter(m => !m.user.bot);
  const excluded = members.filter(m => !m.roles.cache.has(EXCLUDED_ROLE_ID));

  const total = members.size;
  const memberCount = excluded.size;
  const online = excluded.filter(m => m.presence && m.presence.status !== "offline").size;

  // Kiểm tra hoạt động của kênh theo dõi
  const now = Date.now();
  messageLog = messageLog.filter(ts => now - ts < 60 * 60 * 1000); // giữ 1h gần nhất
  const serverActive = messageLog.length >= 5 ? "Active" : "Offline";

  // rename cực nhanh (song song)
  await Promise.all([
    safeRename(CH_ALL, `All Members : ${total}`),
    safeRename(CH_MEMBERS, `Members : ${memberCount}`),
    safeRename(CH_ONLINE, `Members Online : ${online}`),
    safeRename(CH_SERVER, `Server : ${serverActive}`)
  ]);
}

// ======================
// ⏱️ Debounce rename
// ======================
function scheduleUpdate() {
  clearTimeout(updateTimeout);
  updateTimeout = setTimeout(updateCounts, 1000);
}

// ======================
// 🚀 Khi bot sẵn sàng
// ======================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();
  console.log("📦 Cached all members.");

  // Quét 1 lần đầu tiên
  await updateCounts();

  console.log("🔄 Bot is ready and monitoring...");
});

// ======================
// 📡 Event listeners
// ======================

// Khi có thành viên mới / rời
client.on(Events.GuildMemberAdd, scheduleUpdate);
client.on(Events.GuildMemberRemove, scheduleUpdate);

// Khi trạng thái hoạt động thay đổi
client.on(Events.PresenceUpdate, scheduleUpdate);

// Khi có tin nhắn mới trong kênh theo dõi
client.on(Events.MessageCreate, async (msg) => {
  if (msg.channelId === MONITOR_CHANNEL_ID && !msg.author.bot) {
    messageLog.push(Date.now());
    scheduleUpdate();
  }
});

// ======================
// 🪄 Login
// ======================
client.login(process.env.TOKEN);
