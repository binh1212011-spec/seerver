// ========================
// 🌐 KEEP ALIVE SERVER
// ========================
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("✅ Bot is alive!"));
app.listen(PORT, () => console.log(`🌐 KeepAlive running on port ${PORT}`));

// ========================
// 🤖 DISCORD BOT
// ========================
const {
  Client,
  GatewayIntentBits,
  Partials
} = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Channel]
});

// ========================
// ⚙️ ENV CONFIG
// ========================
const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const MONITOR_CHANNEL_ID = process.env.MONITOR_CHANNEL_ID;
const EXCLUDED_ROLE_ID = process.env.EXCLUDED_ROLE_ID;
const CH_ALL = process.env.CH_ALL;
const CH_MEMBERS = process.env.CH_MEMBERS;
const CH_ONLINE = process.env.CH_ONLINE;
const CH_SERVER = process.env.CH_SERVER;

// ========================
// 🧩 STATE STORAGE
// ========================
let messageLog = [];
let lastCheck = Date.now();

// ========================
// 🚀 BOT READY
// ========================
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return console.log("❌ Guild not found!");

  await guild.members.fetch(); // Quét 1 lần duy nhất khi khởi động

  console.log("📊 Initial scan complete!");
  await updateAllCounts(guild);

  setInterval(() => checkServerActivity(guild), 5 * 60 * 1000); // Mỗi 5 phút kiểm tra
});

// ========================
// 🧮 COUNT UPDATE
// ========================
async function updateAllCounts(guild) {
  try {
    const members = guild.members.cache;
    const allMembers = members.size;
    const filteredMembers = members.filter(
      m => !m.user.bot && !m.roles.cache.has(EXCLUDED_ROLE_ID)
    );

    const memberCount = filteredMembers.size;
    const onlineCount = filteredMembers.filter(
      m => m.presence && m.presence.status !== "offline"
    ).size;

    const serverStatus = checkIfServerActive() ? "🟢 Active" : "🔴 Offline";

    // Rename channels
    await renameChannel(CH_ALL, `All Members: ${allMembers}`);
    await renameChannel(CH_MEMBERS, `Members: ${memberCount}`);
    await renameChannel(CH_ONLINE, `Online: ${onlineCount}`);
    await renameChannel(CH_SERVER, `Server: ${serverStatus}`);

    console.log(
      `📈 Updated counts | All: ${allMembers}, Members: ${memberCount}, Online: ${onlineCount}, Status: ${serverStatus}`
    );
  } catch (err) {
    console.error("❌ Error updating counts:", err);
  }
}

async function renameChannel(id, newName) {
  try {
    const ch = await client.channels.fetch(id);
    if (ch && ch.name !== newName) await ch.setName(newName).catch(() => {});
  } catch (err) {
    console.error(`⚠️ Cannot rename channel ${id}:`, err.message);
  }
}

// ========================
// 🕓 ACTIVITY CHECK
// ========================
function checkIfServerActive() {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const recentMsgs = messageLog.filter(msg => now - msg < oneHour);
  return recentMsgs.length >= 5;
}

async function checkServerActivity(guild) {
  await updateAllCounts(guild);
  messageLog = messageLog.filter(ts => Date.now() - ts < 60 * 60 * 1000); // Giữ log 1h
}

// ========================
// 🧏 EVENT LISTENERS
// ========================

// Khi có tin nhắn trong kênh theo dõi
client.on("messageCreate", msg => {
  if (msg.channelId === MONITOR_CHANNEL_ID && !msg.author.bot) {
    messageLog.push(Date.now());
  }
});

// Khi có người tham gia hoặc rời server
client.on("guildMemberAdd", member => {
  if (member.guild.id === GUILD_ID) updateAllCounts(member.guild);
});
client.on("guildMemberRemove", member => {
  if (member.guild.id === GUILD_ID) updateAllCounts(member.guild);
});

// Khi có ai đó đổi trạng thái hoạt động
client.on("presenceUpdate", (_, newPresence) => {
  if (newPresence.guild.id === GUILD_ID) updateAllCounts(newPresence.guild);
});

// ========================
// 🔑 LOGIN
// ========================
client.login(TOKEN);
