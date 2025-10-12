const express = require("express");
const { Client, GatewayIntentBits, Partials, PermissionFlagsBits } = require("discord.js");
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
let penaltyData = {};
let cacheMessage = null;

// ===== Constants =====
const PUNISH_ROLE = "1417942514782044163";
const SPECIAL_ROLE = "1426714744290541618";
const MUTE_CHANNEL = "1411034286429306940";
const HIDE_CATEGORY = "1411034825699233943";
const STAFF_CHANNEL = "1411592559871922176";
const CACHE_CHANNEL_NAME = "bot-cache";

// ====== Utility ======
async function renameChannel(channel, newName) {
  if (!channel || channel.name === newName) return;
  try {
    await channel.setName(newName);
    console.log(`🔁 Renamed: ${newName}`);
  } catch (err) {
    console.log(`⚠️ Rename error (${channel.name}): ${err.message}`);
  }
}

// ====== Cache save/load to Discord ======
async function ensureCacheChannel(guild) {
  let channel = guild.channels.cache.find(ch => ch.name === CACHE_CHANNEL_NAME);
  if (!channel) {
    channel = await guild.channels.create({
      name: CACHE_CHANNEL_NAME,
      type: 0,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ]
    });
  }

  const messages = await channel.messages.fetch({ limit: 1 });
  if (messages.size === 0) {
    cacheMessage = await channel.send("CACHE_INIT:{}");
  } else {
    cacheMessage = messages.first();
    const content = cacheMessage.content.replace("CACHE_INIT:", "");
    try {
      penaltyData = JSON.parse(content || "{}");
    } catch {
      penaltyData = {};
    }
  }

  console.log("📦 Cache loaded from Discord");
}

async function saveCache() {
  if (!cacheMessage) return;
  await cacheMessage.edit("CACHE_INIT:" + JSON.stringify(penaltyData));
}

// ====== Penalty handling ======
async function handlePenalty(member, roleId) {
  const isSpecial = roleId === SPECIAL_ROLE;
  if (!penaltyData[member.id]) penaltyData[member.id] = {};
  const record = penaltyData[member.id][roleId] || { count: 0 };
  record.count++;
  let duration = 0;

  if (isSpecial) {
    if (record.count === 1) duration = 7 * 24 * 60 * 60 * 1000; // 1 week
    else if (record.count === 2) {
      duration = 7 * 24 * 60 * 60 * 1000;
      const staffCh = member.guild.channels.cache.get(STAFF_CHANNEL);
      if (staffCh) staffCh.send(`⚠️ ${member.user.tag} đã vi phạm lần 2 (role đặc biệt)!`);
    } else duration = 0; // vô hạn
  } else {
    if (record.count === 1) duration = 24 * 60 * 60 * 1000; // 1 day
    else if (record.count === 2) duration = 7 * 24 * 60 * 60 * 1000;
    else duration = 0; // vô hạn
  }

  record.expire = duration > 0 ? Date.now() + duration : null;
  penaltyData[member.id][roleId] = record;
  await saveCache();

  // Xử lý quyền hạn
  const muteCh = member.guild.channels.cache.get(MUTE_CHANNEL);
  const category = member.guild.channels.cache.get(HIDE_CATEGORY);

  if (muteCh) await muteCh.permissionOverwrites.edit(member.id, { SendMessages: false }).catch(() => {});
  if (category) await category.permissionOverwrites.edit(member.id, { ViewChannel: false }).catch(() => {});

  if (duration > 0) {
    setTimeout(async () => {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId).catch(() => {});
      }
      if (muteCh) await muteCh.permissionOverwrites.delete(member.id).catch(() => {});
      if (category) await category.permissionOverwrites.delete(member.id).catch(() => {});
      console.log(`✅ Hết hạn phạt cho ${member.user.tag}`);
    }, duration);
  } else {
    console.log(`⛔ ${member.user.tag} bị phạt vô thời hạn`);
  }
}

// ====== Restore penalty after restart ======
async function restorePenalties(guild) {
  for (const userId in penaltyData) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;
    for (const roleId in penaltyData[userId]) {
      const data = penaltyData[userId][roleId];
      if (data.expire && Date.now() < data.expire) {
        const remaining = data.expire - Date.now();
        console.log(`🔄 Khôi phục penalty cho ${member.user.tag} (${Math.round(remaining / 60000)} phút còn lại)`);
        setTimeout(async () => {
          if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId).catch(() => {});
          }
        }, remaining);
      }
    }
  }
}

// ====== Server activity ======
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

async function updateServerStatus(guild) {
  const chServer = guild.channels.cache.get(CH_SERVER);
  await renameChannel(chServer, `╰Server: ${serverActive ? "🟢 Active" : "🔴 Offline"}`);
}

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

// ====== Events ======
client.once("ready", async () => {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return console.log("❌ Guild not found!");
  console.log(`🤖 Logged in as ${client.user.tag}`);

  await ensureCacheChannel(guild);
  await restorePenalties(guild);
  await updateMemberCounts(guild);
  await updateServerStatus(guild);

  setInterval(() => checkServerActivity(guild), 30 * 1000);
});

client.on("guildMemberAdd", m => { if (m.guild.id === GUILD_ID) updateMemberCounts(m.guild); });
client.on("guildMemberRemove", m => { if (m.guild.id === GUILD_ID) updateMemberCounts(m.guild); });
client.on("messageCreate", async msg => {
  if (msg.channelId !== MONITOR_CHANNEL_ID || msg.author.bot) return;
  const guild = msg.guild;
  messageTimestamps.push(Date.now());
  await checkServerActivity(guild);
});

// Khi member nhận role phạt
client.on("guildMemberUpdate", async (oldM, newM) => {
  const addedRoles = newM.roles.cache.filter(r => !oldM.roles.cache.has(r.id));
  for (const [roleId] of addedRoles) {
    if (roleId === PUNISH_ROLE || roleId === SPECIAL_ROLE) {
      await handlePenalty(newM, roleId);
    }
  }
});

// ====== Login ======
client.login(TOKEN);
