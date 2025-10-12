const express = require("express");
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require("discord.js");
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

let serverActive = false;
let messageTimestamps = [];
const violationCache = new Map(); // lưu trong RAM

// ===== IDs đặc biệt =====
const ROLE_PENALTY = "1417942514782044163"; // role phạt
const ROLE_SPECIAL = "1426714744290541618"; // role đặc biệt
const CATEGORY_HIDE = "1411034825699233943"; // danh mục cần ẩn
const CHANNEL_CHAT_LOCK = "1411034286429306940"; // kênh cần chặn chat
const CHANNEL_STAFF_REPORT = "1411592559871922176"; // nơi báo staff

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

// ===== Cập nhật số lượng member =====
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

// ===== Cập nhật trạng thái server =====
async function updateServerStatus(guild) {
  const chServer = guild.channels.cache.get(CH_SERVER);
  await renameChannel(chServer, `╰Server: ${serverActive ? "🟢 Active" : "🔴 Offline"}`);
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

// ===== Xử lý phạt (khi có role bị phạt) =====
async function handlePenalty(member, isSpecial) {
  const guild = member.guild;
  const chatChannel = guild.channels.cache.get(CHANNEL_CHAT_LOCK);
  const category = guild.channels.cache.get(CATEGORY_HIDE);

  let record = violationCache.get(member.id) || { normal: 0, special: 0 };

  if (isSpecial) {
    record.special++;
    violationCache.set(member.id, record);

    if (record.special === 1) {
      await scheduleRoleRemoval(member, ROLE_SPECIAL, 7 * 24 * 60 * 60 * 1000); // 1 tuần
    } else if (record.special === 2) {
      const staffChannel = guild.channels.cache.get(CHANNEL_STAFF_REPORT);
      if (staffChannel) {
        await staffChannel.send(`⚠️ Thành viên ${member.user.tag} tái phạm (lần 2) với role đặc biệt!`);
      }
    } else {
      console.log(`🚫 ${member.user.tag} bị vô thời hạn (đặc biệt)`);
    }
    return;
  }

  // Bình thường
  record.normal++;
  violationCache.set(member.id, record);

  // Chặn chat
  await chatChannel.permissionOverwrites.edit(member.id, { SEND_MESSAGES: false });
  // Ẩn danh mục
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

// ===== Gỡ role sau thời gian =====
async function scheduleRoleRemoval(member, roleId, delay) {
  setTimeout(async () => {
    const role = member.roles.cache.get(roleId);
    if (role) {
      await member.roles.remove(roleId);
      console.log(`✅ Đã tự xóa role ${roleId} khỏi ${member.user.tag}`);
    }
  }, delay);
}

// ===== Khi mất role thì mở lại quyền =====
async function handleRoleRemoved(member) {
  const guild = member.guild;
  const chatChannel = guild.channels.cache.get(CHANNEL_CHAT_LOCK);
  const category = guild.channels.cache.get(CATEGORY_HIDE);

  await chatChannel.permissionOverwrites.edit(member.id, { SEND_MESSAGES: null });
  await category.permissionOverwrites.edit(member.id, { VIEW_CHANNEL: null });

  console.log(`🔓 Mở lại quyền cho ${member.user.tag}`);
}

// ===== Ready =====
client.once("ready", async () => {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return console.log("❌ Guild not found!");

  console.log(`🤖 Logged in as ${client.user.tag}`);

  await updateMemberCounts(guild);
  await updateServerStatus(guild);

  setInterval(() => checkServerActivity(guild), 30 * 1000);
});

// ===== Join/Leave =====
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id === GUILD_ID) updateMemberCounts(member.guild);
});
client.on("guildMemberRemove", async (member) => {
  if (member.guild.id === GUILD_ID) updateMemberCounts(member.guild);
});

// ===== Khi thêm / gỡ role =====
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const addedRoles = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
  const removedRoles = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));

  if (addedRoles.has(ROLE_PENALTY)) {
    await handlePenalty(newMember, false);
  }

  if (addedRoles.has(ROLE_SPECIAL)) {
    await handlePenalty(newMember, true);
  }

  if (removedRoles.has(ROLE_PENALTY)) {
    await handleRoleRemoved(newMember);
  }
});

// ===== Tin nhắn =====
client.on("messageCreate", async (msg) => {
  if (msg.channelId !== MONITOR_CHANNEL_ID || msg.author.bot) return;
  const guild = msg.guild;
  messageTimestamps.push(Date.now());
  await checkServerActivity(guild);
});

// ===== Login =====
client.login(TOKEN);
