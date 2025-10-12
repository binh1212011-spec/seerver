require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

const app = express();
const PORT = process.env.PORT || 3000;

// ====== Hàm cập nhật counter ======
async function updateCounters(online = true) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.members.fetch();

    const chAll = guild.channels.cache.get(process.env.CH_ALL);
    const chMembers = guild.channels.cache.get(process.env.CH_MEMBERS);
    const chServer = guild.channels.cache.get(process.env.CH_SERVER);

    if (!chAll || !chMembers || !chServer) return console.log("⚠️ Không tìm thấy channel");

    const total = guild.memberCount;
    const humans = guild.members.cache.filter(m => !m.user.bot).size;

    await chAll.setName(`╭ All Members: ${total}`).catch(() => {});
    await chMembers.setName(`┊ Members: ${humans}`).catch(() => {});
    await chServer.setName(`╰ Server: ${online ? "🟢 Active" : "🔴 Offline"}`).catch(() => {});

    console.log(`✅ Cập nhật → Tổng: ${total}, Người: ${humans}, Trạng thái: ${online ? "Online" : "Offline"}`);
  } catch (err) {
    console.error("❌ Lỗi cập nhật counter:", err);
  }
}

// ====== Sự kiện ready ======
client.once("ready", async () => {
  console.log(`✅ Bot đã đăng nhập: ${client.user.tag}`);
  await updateCounters(true);
  setInterval(() => updateCounters(true), 5 * 60 * 1000); // 5 phút/lần
});

// ====== Keep Alive ======
app.get("/", (req, res) => res.send("✅ Server Counter Bot is alive!"));
app.listen(PORT, () => console.log(`🌐 Keep-alive chạy tại cổng ${PORT}`));

// ====== Khi tắt bot ======
process.on("SIGINT", async () => {
  await updateCounters(false);
  console.log("🔴 Bot tắt, cập nhật trạng thái Offline.");
  process.exit();
});
process.on("SIGTERM", async () => {
  await updateCounters(false);
  console.log("🔴 Bot tắt, cập nhật trạng thái Offline.");
  process.exit();
});

// ====== Đăng nhập ======
client.login(process.env.TOKEN);
