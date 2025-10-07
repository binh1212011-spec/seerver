require("dotenv").config();
const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");
const express = require("express");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

// === KEEP ALIVE (dành cho hosting free) ===
const app = express();
app.get("/", (req, res) => res.send("✅ Bot is running!"));
app.listen(process.env.PORT || 3000, () => console.log("🌐 Keep-alive active"));

// === ENV ===
const {
  TOKEN,
  GUILD_ID,
  MONITOR_CHANNEL_ID,
  EXCLUDED_ROLE_ID,
  CH_ALL,
  CH_MEMBERS,
  CH_ONLINE,
  CH_SERVER
} = process.env;

// === STATE ===
let monitorCount = 0;
let lastActive = Date.now();

// === FUNCTIONS ===
async function updateAllMembers(guild) {
  const total = guild.memberCount;
  const ch = await guild.channels.fetch(CH_ALL).catch(() => null);
  if (ch) ch.setName(`All Members: ${total}`).catch(() => {});
}

async function updateMembers(guild) {
  await guild.members.fetch();
  const count = guild.members.cache.filter(
    m => !m.user.bot && !m.roles.cache.has(EXCLUDED_ROLE_ID)
  ).size;
  const ch = await guild.channels.fetch(CH_MEMBERS).catch(() => null);
  if (ch) ch.setName(`Members: ${count}`).catch(() => {});
}

async function updateOnline(guild) {
  const count = guild.members.cache.filter(
    m => !m.user.bot &&
         !m.roles.cache.has(EXCLUDED_ROLE_ID) &&
         m.presence &&
         m.presence.status !== "offline"
  ).size;
  const ch = await guild.channels.fetch(CH_ONLINE).catch(() => null);
  if (ch) ch.setName(`Members Online: ${count}`).catch(() => {});
}

async function updateServerStatus(guild, active) {
  const ch = await guild.channels.fetch(CH_SERVER).catch(() => null);
  if (!ch) return;
  const status = active ? "🟢 Active" : "🔴 Offline";
  ch.setName(`Server: ${status}`).catch(() => {});
}

// === INITIAL SCAN ON READY ===
client.once("ready", async () => {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return console.log("❌ Không tìm thấy GUILD_ID trong .env");

  console.log(`✅ Logged in as ${client.user.tag}`);
  await guild.members.fetch();

  await updateAllMembers(guild);
  await updateMembers(guild);
  await updateOnline(guild);
  await updateServerStatus(guild, true);
});

// === EVENT HANDLERS ===

// 🧩 MEMBER JOIN/REMOVE
client.on(Events.GuildMemberAdd, async m => {
  await updateAllMembers(m.guild);
  await updateMembers(m.guild);
});

client.on(Events.GuildMemberRemove, async m => {
  await updateAllMembers(m.guild);
  await updateMembers(m.guild);
});

// 🔄 PRESENCE UPDATE
client.on(Events.PresenceUpdate, async (_, newPresence) => {
  if (!newPresence?.guild) return;
  await updateOnline(newPresence.guild);
});

// 💬 MONITOR CHANNEL ACTIVITY
client.on(Events.MessageCreate, async msg => {
  if (msg.channelId !== MONITOR_CHANNEL_ID || msg.author.bot) return;

  monitorCount++;
  lastActive = Date.now();

  // Sau khi có ít nhất 5 tin nhắn → Server Active
  if (monitorCount >= 5) {
    monitorCount = 0;
    await updateServerStatus(msg.guild, true);
  }
});

// ⏱️ KIỂM TRA HOẠT ĐỘNG MỖI PHÚT
setInterval(async () => {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return;
  if (Date.now() - lastActive > 60 * 60 * 1000) {
    await updateServerStatus(guild, false);
  }
}, 60 * 1000);

// === LOGIN ===
client.login(TOKEN);
