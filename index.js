const express = require("express");
const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");
require("dotenv").config();

// ====== Keep Alive ======
const app = express();
app.get("/", (req, res) => res.send("✅ Bot is alive"));
app.listen(process.env.PORT || 3000, () =>
  console.log("🌐 Keep-alive server running")
);

// ====== Discord Client ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const {
  TOKEN,
  GUILD_ID,
  MONITOR_CHANNEL_ID,
  EXCLUDED_ROLE_ID,
  CH_ALL,
  CH_MEMBERS,
  CH_ONLINE,
  CH_SERVER,
} = process.env;

let guild;
let messageTimestamps = [];

// ====== HÀM HỖ TRỢ ======
async function safeRename(id, newName) {
  const ch = client.channels.cache.get(id);
  if (!ch) return;
  if (ch.name !== newName) {
    try {
      await ch.setName(newName);
      console.log(`🔄 Renamed: ${newName}`);
    } catch (err) {
      console.warn(`⚠️ Rename failed (${id}): ${err.message}`);
    }
  }
}

// ----- Đếm -----
function countAllMembers() {
  return guild.memberCount; // ✅ tính cả bot
}

function countMembers() {
  return guild.members.cache.filter(
    (m) => !m.user.bot && !m.roles.cache.has(EXCLUDED_ROLE_ID)
  ).size;
}

function countOnline() {
  return guild.members.cache.filter(
    (m) =>
      !m.user.bot &&
      !m.roles.cache.has(EXCLUDED_ROLE_ID) &&
      m.presence &&
      m.presence.status !== "offline"
  ).size;
}

// ----- Update từng phần -----
async function updateAllMembers() {
  await safeRename(CH_ALL, `╭All Members : ${countAllMembers()}`);
}

async function updateMembers() {
  await safeRename(CH_MEMBERS, `┊Members : ${countMembers()}`);
}

async function updateOnline() {
  await safeRename(CH_ONLINE, `┊Members Online : ${countOnline()}`);
}

async function updateServer() {
  const now = Date.now();
  messageTimestamps = messageTimestamps.filter((t) => now - t < 60 * 60 * 1000); // giữ tin nhắn 1h gần nhất
  const active = messageTimestamps.length >= 5 ? "Active" : "Offline";
  await safeRename(CH_SERVER, `╰Server : ${active}`);
}

// ====== READY ======
client.once("ready", async () => {
  guild = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();
  await client.channels.fetch(MONITOR_CHANNEL_ID);
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Khởi tạo lần đầu
  await updateAllMembers();
  await updateMembers();
  await updateOnline();
  await updateServer();

  console.log("📊 Initial stats updated.");
});

// ====== SỰ KIỆN ======
client.on(Events.GuildMemberAdd, async () => {
  await updateAllMembers();
  await updateMembers();
});

client.on(Events.GuildMemberRemove, async () => {
  await updateAllMembers();
  await updateMembers();
  await updateOnline();
});

client.on(Events.PresenceUpdate, async () => {
  await updateOnline();
});

client.on(Events.MessageCreate, async (msg) => {
  if (msg.channelId === MONITOR_CHANNEL_ID && !msg.author.bot) {
    messageTimestamps.push(Date.now());
    await updateServer();
  }
});

// ====== LOGIN ======
client.login(TOKEN);
