const express = require("express");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
require("dotenv").config();

// ====== Keep Alive (chống bot ngủ) ======
const app = express();
app.get("/", (_, res) => res.send("✅ Bot is alive!"));
app.listen(process.env.PORT || 3000, () => console.log("🌐 KeepAlive active"));

// ====== Tạo client Discord ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ====== Đọc ENV ======
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

// ====== Hàm cập nhật tên kênh ======
async function updateChannels(guild) {
  try {
    // Fetch 1 lần để đảm bảo cache đầy đủ
    await guild.members.fetch();

    const allMembers = guild.memberCount;
    const members = guild.members.cache.filter(
      m => !m.user.bot && !m.roles.cache.has(EXCLUDED_ROLE_ID)
    ).size;

    const chAll = guild.channels.cache.get(CH_ALL);
    if (chAll)
      await chAll
        .setName(`╭All Members: ${allMembers}`)
        .catch(() => console.log("⚠️ Không đổi được tên kênh All Members"));

    const chMembers = guild.channels.cache.get(CH_MEMBERS);
    if (chMembers)
      await chMembers
        .setName(`┊Members: ${members}`)
        .catch(() => console.log("⚠️ Không đổi được tên kênh Members"));

    const chServer = guild.channels.cache.get(CH_SERVER);
    if (chServer)
      await chServer
        .setName(`╰Server: ${serverActive ? "🟢 Active" : "🔴 Offline"}`)
        .catch(() => console.log("⚠️ Không đổi được tên kênh Server"));

    console.log(
      `✅ Channels updated → All:${allMembers}, Members:${members}, Server:${
        serverActive ? "Active" : "Offline"
      }`
    );
  } catch (err) {
    console.error("❌ Lỗi khi updateChannels:", err);
  }
}

// ====== Hàm kiểm tra hoạt động server ======
function checkServerActivity(guild) {
  const now = Date.now();
  // Lưu tin nhắn trong vòng 1 tiếng
  messageTimestamps = messageTimestamps.filter(ts => now - ts < 60 * 60 * 1000);
  const active = messageTimestamps.length >= 5;

  // Nếu trạng thái thay đổi thì cập nhật liền
  if (active !== serverActive) {
    serverActive = active;
    console.log(
      serverActive
        ? "🟢 Server set to Active (5+ messages trong 1h)"
        : "🔴 Server set to Offline (inactivity >1h)"
    );
    updateChannels(guild);
  }
}

// ====== Khi bot sẵn sàng ======
client.once("ready", async () => {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return console.error("❌ Không tìm thấy server");

  console.log(`🤖 Logged in as ${client.user.tag}`);
  await updateChannels(guild);

  // Mỗi 10 phút kiểm tra xem server có inact >1h không
  setInterval(() => checkServerActivity(guild), 10 * 60 * 1000);
});

// ====== Khi member vào/ra ======
client.on("guildMemberAdd", async member => {
  if (member.guild.id === GUILD_ID) await updateChannels(member.guild);
});
client.on("guildMemberRemove", async member => {
  if (member.guild.id === GUILD_ID) await updateChannels(member.guild);
});

// ====== Khi có tin nhắn trong kênh theo dõi ======
client.on("messageCreate", async msg => {
  if (msg.channelId !== MONITOR_CHANNEL_ID || msg.author.bot) return;
  const guild = msg.guild;
  messageTimestamps.push(Date.now());
  checkServerActivity(guild); // Kiểm tra ngay khi có tin mới
});

// ====== Login ======
client.login(TOKEN);
