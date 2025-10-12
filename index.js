const express = require("express");
const fs = require("fs");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
require("dotenv").config();

// ====== Keep Alive ======
const app = express();
app.get("/", (_, res) => res.send("✅ Bot is alive!"));
app.listen(process.env.PORT || 3000, () => console.log("🌐 KeepAlive running"));

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

// ====== ENV ======
const {
  TOKEN,
  GUILD_ID,
  MONITOR_CHANNEL_ID,
  EXCLUDED_ROLE_ID,
  CH_ALL,
  CH_MEMBERS,
  CH_SERVER
} = process.env;

// ====== Role & Channel IDs ======
const ROLE_PENALTY = "1417942514782044163";
const ROLE_SPECIAL = "1426714744290541618";
const CHANNEL_CHAT_LOCK = "1411034286429306940";
const CATEGORY_HIDE = "1411034825699233943";
const CHANNEL_STAFF_REPORT = "1411592559871922176";

let serverActive = false;
let messageTimestamps = [];
const CACHE_FILE = "./violationCache.json";
let violationCache = new Map();

// ====== Load cache từ file ======
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      violationCache = new Map(Object.entries(data));
      console.log("📂 Cache loaded:", violationCache.size, "users");
    }
  } catch (err) {
    console.error("❌ Error loading cache:", err);
  }
}

// ====== Save cache ra file ======
function saveCache() {
  const data = Object.fromEntries(violationCache);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

// ====== Hàm đổi tên nhanh ======
async function renameChannel(channel, newName) {
  if (!channel || channel.name === newName) return;
  try {
    await channel.setName(newName);
    console.log(`🔁 Renamed: ${newName}`);
  } catch (err) {
    console.log(`⚠️ Rename error (${channel.name}): ${err.message}`);
  }
}

// ====== Cập nhật thành viên ======
async function updateMemberCounts(guild) {
  await guild.members.fetch();

  const allMembers = guild.memberCount;
  const members = guild.members.cache.filter(
    m => !m.user.bot && !m.roles.cache.has(EXCLUDED_ROLE_ID)
  ).size;

  const chAll = guild.channels.cache.get(CH_ALL);
  const chMembers = guild.channels.cache.get(CH_MEMBERS);

  await renameChannel(chAll, `╭All Members: ${allMembers}`);
  await renameChannel(chMembers, `┊Members: ${members}`);
}

// ====== Cập nhật trạng thái server ======
async function updateServerStatus(guild) {
  const chServer = guild.channels.cache.get(CH_SERVER);
  await renameChannel(chServer, `╰Server: ${serverActive ? "🟢 Active" : "🔴 Offline"}`);
}

// ====== Kiểm tra hoạt động server ======
async function checkServerActivity(guild) {
  const now = Date.now();
  messageTimestamps = messageTimestamps.filter(ts => now - ts < 10 * 60 * 1000);

  const active = messageTimestamps.length >= 5;
  if (active !== serverActive) {
    serverActive = active;
    console.log(serverActive ? "🟢 Server ACTIVE" : "🔴 Server OFFLINE");
    updateServerStatus(guild);
  }
}

// ====== Lên lịch xóa role ======
async function scheduleRoleRemoval(member, roleId, delay) {
  setTimeout(async () => {
    try {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId, "Hết thời gian phạt");
        console.log(`✅ Gỡ role ${roleId} khỏi ${member.user.tag}`);
      }
      // Mở lại quyền chat / xem danh mục
      await restorePermissions(member);
    } catch (err) {
      console.error(`❌ Lỗi khi xóa role ${roleId}:`, err);
    }
  }, delay);
}

// ====== Mở lại quyền ======
async function restorePermissions(member) {
  const guild = member.guild;
  const chatChannel = guild.channels.cache.get(CHANNEL_CHAT_LOCK);
  const category = guild.channels.cache.get(CATEGORY_HIDE);
  await chatChannel.permissionOverwrites.delete(member.id).catch(() => {});
  await category.permissionOverwrites.delete(member.id).catch(() => {});
  console.log(`🔓 Đã mở lại quyền cho ${member.user.tag}`);
}

// ====== Xử lý phạt ======
async function handlePenalty(member, isSpecial) {
  const guild = member.guild;
  const chatChannel = guild.channels.cache.get(CHANNEL_CHAT_LOCK);
  const category = guild.channels.cache.get(CATEGORY_HIDE);

  let record = violationCache.get(member.id)
    ? JSON.parse(violationCache.get(member.id))
    : { normal: 0, special: 0 };

  if (isSpecial) {
    record.special++;
    violationCache.set(member.id, JSON.stringify(record));
    saveCache();

    if (record.special === 1) {
      await scheduleRoleRemoval(member, ROLE_SPECIAL, 7 * 24 * 60 * 60 * 1000);
      console.log(`⚠️ ${member.user.tag} (đặc biệt) lần 1 → 1 tuần`);
    } else if (record.special === 2) {
      await scheduleRoleRemoval(member, ROLE_SPECIAL, 7 * 24 * 60 * 60 * 1000);
      const staffChannel = guild.channels.cache.get(CHANNEL_STAFF_REPORT);
      if (staffChannel)
        await staffChannel.send(`⚠️ ${member.user.tag} (đặc biệt) tái phạm lần 2 — báo staff.`);
      console.log(`⚠️ ${member.user.tag} (đặc biệt) lần 2 → 1 tuần + báo staff`);
    } else {
      console.log(`🚫 ${member.user.tag} (đặc biệt) bị vô thời hạn`);
    }
    return;
  }

  // Bình thường
  record.normal++;
  violationCache.set(member.id, JSON.stringify(record));
  saveCache();

  await chatChannel.permissionOverwrites.edit(member.id, { SEND_MESSAGES: false });
  await category.permissionOverwrites.edit(member.id, { VIEW_CHANNEL: false });
  console.log(`🚫 ${member.user.tag} bị hạn chế (lần ${record.normal})`);

  if (record.normal === 1) {
    await scheduleRoleRemoval(member, ROLE_PENALTY, 24 * 60 * 60 * 1000); // 1 ngày
  } else if (record.normal === 2) {
    await scheduleRoleRemoval(member, ROLE_PENALTY, 7 * 24 * 60 * 60 * 1000); // 1 tuần
  } else {
    console.log(`🚫 ${member.user.tag} bị vô thời hạn`);
  }
}

// ====== Ready ======
client.once("ready", async () => {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return console.log("❌ Guild not found!");

  console.log(`🤖 Logged in as ${client.user.tag}`);
  loadCache();

  await updateMemberCounts(guild);
  await updateServerStatus(guild);

  // Kiểm tra server activity mỗi 30s
  setInterval(() => checkServerActivity(guild), 30 * 1000);
});

// ====== Member join/leave ======
client.on("guildMemberAdd", async member => {
  if (member.guild.id === GUILD_ID) updateMemberCounts(member.guild);
});
client.on("guildMemberRemove", async member => {
  if (member.guild.id === GUILD_ID) updateMemberCounts(member.guild);
});

// ====== Khi có thay đổi role ======
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  if (oldMember.roles.cache.size === newMember.roles.cache.size) return;

  const hadNormal = oldMember.roles.cache.has(ROLE_PENALTY);
  const hasNormal = newMember.roles.cache.has(ROLE_PENALTY);
  const hadSpecial = oldMember.roles.cache.has(ROLE_SPECIAL);
  const hasSpecial = newMember.roles.cache.has(ROLE_SPECIAL);

  if (!hadNormal && hasNormal) {
    await handlePenalty(newMember, false);
  } else if (hadNormal && !hasNormal) {
    await restorePermissions(newMember);
  }

  if (!hadSpecial && hasSpecial) {
    await handlePenalty(newMember, true);
  } else if (hadSpecial && !hasSpecial) {
    await restorePermissions(newMember);
  }
});

// ====== Tin nhắn trong kênh theo dõi ======
client.on("messageCreate", async msg => {
  if (msg.channelId !== MONITOR_CHANNEL_ID || msg.author.bot) return;
  const guild = msg.guild;
  messageTimestamps.push(Date.now());
  await checkServerActivity(guild);
});

// ====== Login ======
client.login(TOKEN);
