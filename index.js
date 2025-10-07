// ========== KEEP ALIVE ==========
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("✅ Bot is alive!"));
app.listen(PORT, () => console.log(`🌐 KeepAlive server running on port ${PORT}`));

// ========== BOT CORE ==========
require("dotenv").config();
const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Events 
} = require("discord.js");

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

// ========== CONFIG ==========
const GUILD_ID = process.env.GUILD_ID;
const MONITOR_CHANNEL_ID = process.env.MONITOR_CHANNEL_ID;
const EXCLUDED_ROLE_ID = process.env.EXCLUDED_ROLE_ID;

const CHANNELS = {
  ALL: process.env.CH_ALL,
  MEMBERS: process.env.CH_MEMBERS,
  ONLINE: process.env.CH_ONLINE,
  SERVER: process.env.CH_SERVER,
};

// ========== RENAME QUEUE (Anti-RateLimit) ==========
const renameQueue = new Map();
const RENAME_DELAY = 500; // 0.5s rename delay tối đa

async function scheduleRename(channelId, name) {
  clearTimeout(renameQueue.get(channelId));
  renameQueue.set(
    channelId,
    setTimeout(async () => {
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (ch && ch.name !== name) {
        await ch.setName(name).catch(() => {});
        console.log(`🔁 Updated channel: ${name}`);
      }
    }, RENAME_DELAY)
  );
}

// ========== MAIN COUNTERS ==========
async function updateCounts() {
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();

  const allMembers = guild.memberCount;
  const members = guild.members.cache.filter(
    (m) => !m.user.bot && !m.roles.cache.has(EXCLUDED_ROLE_ID)
  ).size;
  const onlineMembers = guild.members.cache.filter(
    (m) =>
      !m.user.bot &&
      !m.roles.cache.has(EXCLUDED_ROLE_ID) &&
      m.presence &&
      m.presence.status !== "offline"
  ).size;

  scheduleRename(CHANNELS.ALL, `╭All Members: ${allMembers}`);
  scheduleRename(CHANNELS.MEMBERS, `┊Members: ${members}`);
  scheduleRename(CHANNELS.ONLINE, `┊Members Online: ${onlineMembers}`);
}

// ========== SERVER ACTIVITY MONITOR ==========
let lastActive = Date.now();
async function updateServerStatus() {
  const diff = Date.now() - lastActive;
  const status = diff > 3600000 ? "Offline 💤" : "Active ⚡";
  scheduleRename(CHANNELS.SERVER, `╰Server: ${status}`);
}

// ========== EVENT HANDLERS ==========
client.on(Events.MessageCreate, (msg) => {
  if (msg.channel.id !== MONITOR_CHANNEL_ID || msg.author.bot) return;
  lastActive = Date.now();
  updateServerStatus();
});

client.on(Events.GuildMemberAdd, updateCounts);
client.on(Events.GuildMemberRemove, updateCounts);
client.on(Events.PresenceUpdate, updateCounts);

// ========== STARTUP ==========
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log("🚀 Initializing data...");
  await updateCounts();
  await updateServerStatus();
  console.log("✅ All counters updated!");

  // Tự refresh định kỳ mỗi 12h (đảm bảo hoạt động ổn định)
  setInterval(async () => {
    console.log("🔄 Refreshing data (12h cycle)...");
    await updateCounts();
    await updateServerStatus();
  }, 12 * 60 * 60 * 1000);

  // Kiểm tra server mỗi 10 phút
  setInterval(updateServerStatus, 10 * 60 * 1000);
});

// ========== LOGIN ==========
client.login(process.env.TOKEN);
