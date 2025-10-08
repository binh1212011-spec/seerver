const express = require("express");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
require("dotenv").config();

// ===== Keep Alive =====
const app = express();
app.get("/", (_, res) => res.send("✅ Bot is alive!"));
app.listen(process.env.PORT || 3000, () => console.log("🌐 KeepAlive running"));

// ===== Discord Client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ===== ENV =====
const {
  TOKEN,
  GUILD_ID,
  MONITOR_CHANNEL_ID,
  EXCLUDED_ROLE_ID,
  CH_ALL,
  CH_MEMBERS,
  CH_SERVER
} = process.env;

let serverActive = false;
let messageTimestamps = [];

// ===== Hàm đổi tên nhanh =====
async function renameChannel(channel, newName) {
  if (!channel || channel.name === newName) return;
  try {
    await channel.setName(newName);
    console.log(`🔁 Renamed: ${newName}`);
  } catch (err) {
    console.log(`⚠️ Rename error (${channel.name}): ${err.message}`);
  }
}

// ===== Hàm cập nhật All/Members =====
async function updateMemberCounts(guild) {
  await guild.members.fetch();

  const allMembers = guild.memberCount;
  const members = guild.members.cache.filter(
    m => !m.user.bot && !m.roles.cache.has(EXCLUDED_ROLE_ID)
  ).size;

  const chAll = guild.channels.cache.get(CH_ALL);
  const chMembers = guild.channels.cache.get(CH_MEMBERS);

  await renameChannel(chAll, `╭All Members: ${allMembers}`);
  await renameChannel(chMembers, `┊Members: ${members}`);
}

// ===== Hàm cập nhật Server activity =====
async function updateServerStatus(guild) {
  const chServer = guild.channels.cache.get(CH_SERVER);
  await renameChannel(chServer, `╰Server: ${serverActive ? "🟢 Active" : "🔴 Offline"}`);
}

// ===== Kiểm tra hoạt động server =====
async function checkServerActivity(guild) {
  const now = Date.now();
  // Giữ lại tin nhắn trong 10 phút qua
  messageTimestamps = messageTimestamps.filter(ts => now - ts < 10 * 60 * 1000);

  const active = messageTimestamps.length >= 5; // đủ 5 tin trong 10 phút
  if (active !== serverActive) {
    serverActive = active;
    console.log(serverActive ? "🟢 Server ACTIVE" : "🔴 Server OFFLINE");
    updateServerStatus(guild);
  }
}

// ===== Ready =====
client.once("ready", async () => {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return console.log("❌ Guild not found!");

  console.log(`🤖 Logged in as ${client.user.tag}`);

  await updateMemberCounts(guild);
  await updateServerStatus(guild);

  // Kiểm tra mỗi 30 giây để tự tắt nếu im 10 phút
  setInterval(() => checkServerActivity(guild), 30 * 1000);
});

// ===== Member join/leave =====
client.on("guildMemberAdd", async member => {
  if (member.guild.id === GUILD_ID) updateMemberCounts(member.guild);
});
client.on("guildMemberRemove", async member => {
  if (member.guild.id === GUILD_ID) updateMemberCounts(member.guild);
});

// ===== Tin nhắn trong kênh theo dõi =====
client.on("messageCreate", async msg => {
  if (msg.channelId !== MONITOR_CHANNEL_ID || msg.author.bot) return;

  const guild = msg.guild;
  messageTimestamps.push(Date.now());

  // kiểm tra ngay khi có tin nhắn mới
  await checkServerActivity(guild);
});

// ===== Login =====
client.login(TOKEN);
