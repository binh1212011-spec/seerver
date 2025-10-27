require("dotenv").config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");
const express = require("express");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const app = express();
const PORT = process.env.PORT || 3000;

// ====== Cấu hình role → category ======
const ROLE_CATEGORY_MAP = [
  { roleId: "1410990099042271352", categoryId: "1411043139728314478" },
  { roleId: "1410990099042271352", categoryId: "1411049289685270578" },
  { roleId: "1428899344010182756", categoryId: "1428927402444325024" },
];

// Delay nhẹ tránh rate-limit
const delay = ms => new Promise(res => setTimeout(res, ms));

// ====== Hàm xử lý visibility ======
async function handleRoleVisibility(member, roleId, hasRole) {
  const guild = member.guild;
  const configs = ROLE_CATEGORY_MAP.filter(c => c.roleId === roleId);

  for (const cfg of configs) {
    const category = guild.channels.cache.get(cfg.categoryId);
    if (!category) continue;

    const channels = [...category.children.cache.values()];

    for (const channel of channels) {
      try {
        const overwrite = channel.permissionOverwrites.cache.get(member.id);

        if (hasRole) {
          if (overwrite && overwrite.deny.has(PermissionFlagsBits.ViewChannel)) {
            await channel.permissionOverwrites.delete(member.id).catch(() => {});
            console.log(`✅ Mở channel ${channel.name} cho ${member.user.tag}`);
          }
        } else {
          await channel.permissionOverwrites.edit(member.id, { ViewChannel: false }).catch(() => {});
          console.log(`🚫 Ẩn channel ${channel.name} cho ${member.user.tag}`);
        }
        await delay(200);
      } catch (err) {
        console.warn(`⚠️ Lỗi channel ${channel.name}:`, err.message || err);
      }
    }
  }
}

// ====== Event role thay đổi ======
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const uniqueRoleIds = [...new Set(ROLE_CATEGORY_MAP.map(r => r.roleId))];
  const changed = uniqueRoleIds.filter(roleId => oldMember.roles.cache.has(roleId) !== newMember.roles.cache.has(roleId));

  if (!changed.length) return;

  console.log(`⚙️ Role changed detected for ${newMember.user.tag}:`, changed);
  for (const roleId of changed) {
    const hasRole = newMember.roles.cache.has(roleId);
    await handleRoleVisibility(newMember, roleId, hasRole);
  }
});

// ====== Counter members ======
async function updateCounters(online = true) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.members.fetch();

    const chAll = guild.channels.cache.get(process.env.CH_ALL);
    const chMembers = guild.channels.cache.get(process.env.CH_MEMBERS);
    const chServer = guild.channels.cache.get(process.env.CH_SERVER);

    if (!chAll || !chMembers || !chServer) return console.log("⚠️ Không tìm thấy channel counter!");

    const total = guild.memberCount;
    const humans = guild.members.cache.filter(m => !m.user.bot).size;

    await Promise.allSettled([
      chAll.setName(`╭ All Members: ${total}`),
      chMembers.setName(`┊ Members: ${humans}`),
      chServer.setName(`╰ Server: ${online ? "🟢 Active" : "🔴 Offline"}`),
    ]);

    console.log(`✅ Counter → Tổng: ${total}, Người: ${humans}, Trạng thái: ${online ? "Online" : "Offline"}`);
  } catch (err) {
    console.error("❌ Lỗi cập nhật counter:", err);
  }
}

// ====== Quét tất cả member ======
async function scanAllMembers() {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.members.fetch();

    console.log(`⚙️ Bắt đầu quét tất cả ${guild.memberCount} member trong server...`);
    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;
      const roleNames = member.roles.cache.map(r => r.name).join(", ");
      console.log(`👤 ${member.user.tag} | Roles: [${roleNames}]`);
    }
    console.log("✅ Hoàn tất quét tất cả member!");
  } catch (err) {
    console.error("❌ Lỗi quét tất cả member:", err);
  }
}

// ====== Ready ======
client.once("ready", async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);

  await updateCounters(true); // update ngay khi online
  setInterval(() => updateCounters(true), 5 * 60 * 1000); // update mỗi 5 phút

  await scanAllMembers(); // quét all member khi bot ready
});

// ====== Keep-alive endpoint ======
app.get("/", (req, res) => res.send("✅ Bot is alive"));
app.listen(PORT, () => console.log(`🌐 Keep-alive running on port ${PORT}`));

// ====== Khi tắt bot ======
process.on("SIGINT", async () => { await updateCounters(false); process.exit(); });
process.on("SIGTERM", async () => { await updateCounters(false); process.exit(); });

// ====== Login bot ======
client.login(process.env.TOKEN).catch(err => { console.error("❌ Bot login failed:", err); });
