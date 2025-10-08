// index.js
const express = require("express");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
require("dotenv").config();

// ====== Keep Alive ======
const app = express();
app.get("/", (_, res) => res.send("✅ Bot is alive!"));
app.listen(process.env.PORT || 3000, () => console.log("🌐 KeepAlive active"));

// ====== Discord Client ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ====== Config ======
const {
  TOKEN,
  GUILD_ID,
  MONITOR_CHANNEL_ID,
  EXCLUDED_ROLE_ID,
  CH_ALL,
  CH_MEMBERS,
  CH_SERVER
} = process.env;

let serverActive = true;
let messageTimestamps = [];

// ====== Function: Update Channels ======
async function updateChannels(guild) {
  try {
    await guild.members.fetch();
    const allMembers = guild.memberCount;
    const members = guild.members.cache.filter(m => !m.user.bot && !m.roles.cache.has(EXCLUDED_ROLE_ID)).size;

    // Rename từng kênh riêng biệt (gọn nhẹ)
    const chAll = guild.channels.cache.get(CH_ALL);
    if (chAll) await chAll.setName(`╭All Members: ${allMembers}`).catch(() => {});

    const chMembers = guild.channels.cache.get(CH_MEMBERS);
    if (chMembers) await chMembers.setName(`┊Members: ${members}`).catch(() => {});

    const chServer = guild.channels.cache.get(CH_SERVER);
    if (chServer) await chServer.setName(`╰Server: ${serverActive ? "🟢 Active" : "🔴 Offline"}`).catch(() => {});
  } catch (err) {
    console.error("❌ Lỗi updateChannels:", err);
  }
}

// ====== Function: Check Server Activity ======
function checkServerActivity(guild) {
  const now = Date.now();
  // Lọc tin nhắn trong 1 giờ qua
  messageTimestamps = messageTimestamps.filter(ts => now - ts < 60 * 60 * 1000);
  const active = messageTimestamps.length >= 5;

  if (active !== serverActive) {
    serverActive = active;
    updateChannels(guild);
  }
}

// ====== On Ready ======
client.once("ready", async () => {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return console.error("❌ Không tìm thấy server");

  console.log(`✅ Logged in as ${client.user.tag}`);
  await updateChannels(guild);

  // Check mỗi 5 phút (đủ nhẹ mà chính xác)
  setInterval(() => checkServerActivity(guild), 5 * 60 * 1000);
});

// ====== On Member Join/Leave ======
client.on("guildMemberAdd", async member => {
  if (member.guild.id === GUILD_ID) await updateChannels(member.guild);
});

client.on("guildMemberRemove", async member => {
  if (member.guild.id === GUILD_ID) await updateChannels(member.guild);
});

// ====== On Message in MONITOR_CHANNEL ======
client.on("messageCreate", async msg => {
  if (msg.channelId !== MONITOR_CHANNEL_ID || msg.author.bot) return;
  messageTimestamps.push(Date.now());
  checkServerActivity(msg.guild);
});

// ====== Login ======
client.login(TOKEN);
