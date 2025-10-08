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

// ===== Hàm đổi tên kênh =====
async function renameChannel(channel, newName) {
  if (!channel || channel.name === newName) return;
  try {
    await channel.setName(newName);
  } catch (err) {
    console.log(`⚠️ Lỗi đổi tên ${channel.name}: ${err.message}`);
  }
}

// ===== Hàm cập nhật số liệu =====
async function updateChannels(guild) {
  try {
    await guild.members.fetch();

    const allMembers = guild.memberCount;
    const members = guild.members.cache.filter(
      m => !m.user.bot && !m.roles.cache.has(EXCLUDED_ROLE_ID)
    ).size;

    const chAll = guild.channels.cache.get(CH_ALL);
    const chMembers = guild.channels.cache.get(CH_MEMBERS);
    const chServer = guild.channels.cache.get(CH_SERVER);

    await Promise.all([
      renameChannel(chAll, `╭All Members: ${allMembers}`),
      renameChannel(chMembers, `┊Members: ${members}`),
      renameChannel(chServer, `╰Server: ${serverActive ? "🟢 Active" : "🔴 Offline"}`)
    ]);

    console.log(
      `✅ Updated → All:${allMembers} | Members:${members} | Server:${serverActive ? "Active" : "Offline"}`
    );
  } catch (err) {
    console.error("❌ updateChannels error:", err);
  }
}

// ===== Cập nhật trạng thái server =====
async function checkServerActivity(guild) {
  const now = Date.now();
  // Giữ lại tin nhắn trong vòng 1h
  messageTimestamps = messageTimestamps.filter(ts => now - ts < 60 * 60 * 1000);

  const active = messageTimestamps.length >= 5;
  if (active !== serverActive) {
    serverActive = active;
    console.log(serverActive ? "🟢 Server is now ACTIVE" : "🔴 Server is now OFFLINE");
    updateChannels(guild);
  }
}

// ===== Khi bot khởi động =====
client.once("ready", async () => {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return console.log("❌ Không tìm thấy guild!");

  console.log(`🤖 Logged in as ${client.user.tag}`);
  await updateChannels(guild);

  // Kiểm tra trạng thái định kỳ (30s một lần)
  setInterval(() => checkServerActivity(guild), 30 * 1000);
});

// ===== Khi member join/leave =====
client.on("guildMemberAdd", async member => {
  if (member.guild.id === GUILD_ID) await updateChannels(member.guild);
});
client.on("guildMemberRemove", async member => {
  if (member.guild.id === GUILD_ID) await updateChannels(member.guild);
});

// ===== Khi có tin nhắn trong kênh theo dõi =====
client.on("messageCreate", async msg => {
  if (msg.channelId !== MONITOR_CHANNEL_ID || msg.author.bot) return;
  messageTimestamps.push(Date.now());
  checkServerActivity(msg.guild);
});

// ===== Login =====
client.login(TOKEN);
