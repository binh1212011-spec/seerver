const express = require("express");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
require("dotenv").config();
const fs = require("fs");

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
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ===== ENV =====
const {
  TOKEN,
  GUILD_ID,
  MONITOR_CHANNEL_ID,
  EXCLUDED_ROLE_ID,
  CH_ALL,
  CH_MEMBERS,
  CH_SERVER,
} = process.env;

// ===== CONSTANTS =====
const NORMAL_ROLE = "1417942514782044163";
const SPECIAL_ROLE = "1426714744290541618";
const CHAT_CHANNEL = "1411034286429306940";
const CATEGORY_ID = "1411034825699233943";
const STAFF_CHANNEL = "1411592559871922176";

const PENALTY_FILE = "./penaltyData.json";

// ===== CACHE =====
let serverActive = false;
let messageTimestamps = [];
let penaltyCache = {};

// ===== Đọc & Ghi cache =====
function loadCache() {
  if (fs.existsSync(PENALTY_FILE)) {
    try {
      penaltyCache = JSON.parse(fs.readFileSync(PENALTY_FILE, "utf8"));
    } catch {
      penaltyCache = {};
    }
  }
}
function saveCache() {
  fs.writeFileSync(PENALTY_FILE, JSON.stringify(penaltyCache, null, 2));
}
loadCache();

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
    (m) => !m.user.bot && !m.roles.cache.has(EXCLUDED_ROLE_ID)
  ).size;

  const chAll = guild.channels.cache.get(CH_ALL);
  const chMembers = guild.channels.cache.get(CH_MEMBERS);

  await renameChannel(chAll, `╭All Members: ${allMembers}`);
  await renameChannel(chMembers, `┊Members: ${members}`);
}

// ===== Hàm cập nhật Server activity =====
async function updateServerStatus(guild) {
  const chServer = guild.channels.cache.get(CH_SERVER);
  await renameChannel(
    chServer,
    `╰Server: ${serverActive ? "🟢 Active" : "🔴 Offline"}`
  );
}

// ===== Kiểm tra hoạt động server =====
async function checkServerActivity(guild) {
  const now = Date.now();
  messageTimestamps = messageTimestamps.filter((ts) => now - ts < 10 * 60 * 1000);
  const active = messageTimestamps.length >= 5;
  if (active !== serverActive) {
    serverActive = active;
    console.log(serverActive ? "🟢 Server ACTIVE" : "🔴 Server OFFLINE");
    updateServerStatus(guild);
  }
}

// ===== Gỡ quyền ẩn/khóa chat =====
async function clearPermissions(guild, member) {
  try {
    const chatChannel = guild.channels.cache.get(CHAT_CHANNEL);
    const category = guild.channels.cache.get(CATEGORY_ID);
    await chatChannel.permissionOverwrites.delete(member.id).catch(() => {});
    await category.permissionOverwrites.delete(member.id).catch(() => {});
  } catch (e) {
    console.log(`⚠️ Clear permission error: ${e.message}`);
  }
}

// ===== Xử lý khi bị phạt =====
async function handlePenalty(member, roleId) {
  const guild = member.guild;
  const userId = member.id;
  const now = Date.now();

  if (!penaltyCache[userId]) penaltyCache[userId] = {};
  const data = penaltyCache[userId];
  if (!data[roleId]) data[roleId] = { count: 0 };

  data[roleId].count++;
  const count = data[roleId].count;
  saveCache();

  // ===== ROLE THƯỜNG =====
  if (roleId === NORMAL_ROLE) {
    const chatChannel = guild.channels.cache.get(CHAT_CHANNEL);
    const category = guild.channels.cache.get(CATEGORY_ID);

    try {
      await chatChannel.permissionOverwrites.edit(member.id, { SendMessages: false });
      await category.permissionOverwrites.edit(member.id, { ViewChannel: false });
      console.log(`🚫 Đã cấm chat & ẩn category cho ${member.user.tag}`);
    } catch (e) {
      console.log(`⚠️ Lỗi chỉnh quyền: ${e.message}`);
    }

    let timeout = null;
    if (count === 1 || count === 2) timeout = 7 * 24 * 60 * 60 * 1000; // luôn 1 tuần
    else timeout = null; // vô hạn

    if (timeout) {
      data[roleId].expire = now + timeout;
      saveCache();

      setTimeout(async () => {
        try {
          await member.roles.remove(roleId, "Hết hạn phạt");
          await clearPermissions(guild, member);
          console.log(`✅ Gỡ role phạt khỏi ${member.user.tag}`);
        } catch (err) {
          console.log(`⚠️ Không thể gỡ role: ${err.message}`);
        }
      }, timeout);
    } else {
      delete data[roleId].expire;
      saveCache();
      console.log(`🚫 ${member.user.tag} bị phạt vô thời hạn (role thường).`);
    }

  // ===== ROLE ĐẶC BIỆT =====
  } else if (roleId === SPECIAL_ROLE) {
    const staffChannel = guild.channels.cache.get(STAFF_CHANNEL);
    let timeout = null;

    if (count === 1 || count === 2) timeout = 7 * 24 * 60 * 60 * 1000; // cũng 1 tuần
    else {
      staffChannel?.send(`⚠️ Thành viên <@${userId}> bị role đặc biệt lần 3!`).catch(() => {});
      console.log(`🚫 ${member.user.tag} bị role đặc biệt vô thời hạn.`);
    }

    if (timeout) {
      data[roleId].expire = now + timeout;
      saveCache();

      setTimeout(async () => {
        try {
          await member.roles.remove(roleId, "Hết hạn phạt đặc biệt");
          console.log(`✅ Gỡ role đặc biệt khỏi ${member.user.tag}`);
        } catch (err) {
          console.log(`⚠️ Không thể gỡ role đặc biệt: ${err.message}`);
        }
      }, timeout);
    } else {
      delete data[roleId].expire;
      saveCache();
    }
  }
}

// ===== READY =====
client.once("ready", async () => {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return console.log("❌ Guild not found!");

  console.log(`🤖 Logged in as ${client.user.tag}`);

  await updateMemberCounts(guild);
  await updateServerStatus(guild);

  // Kiểm tra mỗi 30 giây để tự tắt nếu im 10 phút
  setInterval(() => checkServerActivity(guild), 30 * 1000);

  // Khôi phục phạt khi restart
  for (const [uid, roles] of Object.entries(penaltyCache)) {
    const member = await guild.members.fetch(uid).catch(() => null);
    if (!member) continue;
    for (const [rid, info] of Object.entries(roles)) {
      if (info.expire && Date.now() < info.expire) {
        const remaining = info.expire - Date.now();
        setTimeout(async () => {
          try {
            await member.roles.remove(rid, "Hết hạn phạt sau restart");
            await clearPermissions(guild, member);
            console.log(`✅ Hết hạn phạt: ${member.user.tag}`);
          } catch (e) {
            console.log(`⚠️ Lỗi khôi phục phạt: ${e.message}`);
          }
        }, remaining);
      }
    }
  }
});

// ===== MEMBER JOIN/REMOVE =====
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id === GUILD_ID) updateMemberCounts(member.guild);
});
client.on("guildMemberRemove", async (member) => {
  if (member.guild.id === GUILD_ID) updateMemberCounts(member.guild);
});

// ===== KHI CÓ ROLE =====
client.on("guildMemberUpdate", async (oldM, newM) => {
  if (!oldM || !newM) return;

  const added = newM.roles.cache.filter((r) => !oldM.roles.cache.has(r.id));
  for (const role of added.values()) {
    if (role.id === NORMAL_ROLE || role.id === SPECIAL_ROLE) {
      handlePenalty(newM, role.id);
    }
  }
});

// ===== TIN NHẮN HOẠT ĐỘNG =====
client.on("messageCreate", async (msg) => {
  if (msg.channelId !== MONITOR_CHANNEL_ID || msg.author.bot) return;
  const guild = msg.guild;
  messageTimestamps.push(Date.now());
  await checkServerActivity(guild);
});

// ===== LOGIN =====
client.login(TOKEN);
