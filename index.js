const {
  Client,
  GatewayIntentBits,
  Partials
} = require("discord.js");
require("dotenv").config();
const express = require("express");
const { updateVoiceCounters, initCounters } = require("./functions/updateCounters");

// ==== CONFIG ====
const TOKEN = process.env.TOKEN;
const PORT = process.env.PORT || 3000;

// ==== CLIENT ====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.User, Partials.GuildMember],
});

// ==== Khi bot bật ====
client.once("ready", async () => {
  console.log(`✅ Bot đã đăng nhập: ${client.user.tag}`);

  // ✅ Quét 1 lần toàn bộ để cập nhật counter
  await initCounters(client);

  // 🔁 Lắng nghe sự kiện để cập nhật realtime
  client.on("guildMemberAdd", () => updateVoiceCounters(client));
  client.on("guildMemberRemove", () => updateVoiceCounters(client));
  client.on("presenceUpdate", () => updateVoiceCounters(client));

  console.log("📊 Counter tracking started!");
});

// ==== KEEP ALIVE SERVER ====
const app = express();
app.get("/", (req, res) => res.send("✅ Bot is running and alive!"));
app.listen(PORT, () =>
  console.log(`🌐 Keep-alive web server active on port ${PORT}`)
);

// ==== LOGIN ====
client.login(TOKEN);
