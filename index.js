const express = require("express");
const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");
require("dotenv").config();

const app = express();
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(process.env.PORT || 3000, () =>
  console.log("🌐 Keep-alive server running")
);

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
  GUILD_ID,
  MONITOR_CHANNEL_ID,
  EXCLUDED_ROLE_ID,
  CH_ALL,
  CH_MEMBERS,
  CH_ONLINE,
  CH_SERVER,
} = process.env;

let messageLog = [];
let guild;

// ========== HÀM HỖ TRỢ ==========
async function safeRename(id, newName) {
  try {
    const ch = client.channels.cache.get(id);
    if (ch && ch.name !== newName) {
      await ch.setName(newName);
      console.log(`✅ Rename ${ch.id} → ${newName}`);
    }
  } catch (e) {
    console.warn(`⚠️ Rename fail for ${id}: ${e.message}`);
  }
}

function countAllMembers() {
  return guild.members.cache.filter((m) => !m.user.bot).size;
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
  messageLog = messageLog.filter((ts) => now - ts < 60 * 60 * 1000);
  const active = messageLog.length >= 5 ? "Active" : "Offline";
  await safeRename(CH_SERVER, `╰Server : ${active}`);
}

// ========== BOT READY ==========
client.once("ready", async () => {
  guild = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log("📦 Cached all members.");

  // Quét ban đầu
  await Promise.all([
    updateAllMembers(),
    updateMembers(),
    updateOnline(),
    updateServer(),
  ]);

  console.log("🔄 Initial data loaded.");
});

// ========== LẮNG NGHE ==========
client.on(Events.GuildMemberAdd, async () => {
  await Promise.all([updateAllMembers(), updateMembers()]);
});
client.on(Events.GuildMemberRemove, async () => {
  await Promise.all([updateAllMembers(), updateMembers(), updateOnline()]);
});
client.on(Events.PresenceUpdate, async () => {
  await updateOnline();
});
client.on(Events.MessageCreate, async (msg) => {
  if (msg.channelId === MONITOR_CHANNEL_ID && !msg.author.bot) {
    messageLog.push(Date.now());
    await updateServer();
  }
});

client.login(process.env.TOKEN);
