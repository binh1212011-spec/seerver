require("dotenv").config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");
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

// ====== Cấu hình Role – Category ======
const ROLE_CATEGORY_MAP = [
  { roleId: "1410990099042271352", categoryId: "1411043139728314478" },
  { roleId: "1410990099042271352", categoryId: "1411049289685270578" },
  { roleId: "1428899344010182756", categoryId: "1428927402444325024" },
];

// ====== Hàm delay (chống rate limit) ======
function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// ====== Hàm cập nhật counter ======
async function updateCounters(online = true) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.members.fetch();

    const chAll = guild.channels.cache.get(process.env.CH_ALL);
    const chMembers = guild.channels.cache.get(process.env.CH_MEMBERS);
    const chServer = guild.channels.cache.get(process.env.CH_SERVER);

    if (!chAll || !chMembers || !chServer) {
      return console.log("⚠️ Không tìm thấy channel counter (CH_ALL / CH_MEMBERS / CH_SERVER).");
    }

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

// ====== Hàm xử lý khi member có/không có role ======
// hasRole = true  -> member có role => XÓA member override nếu có deny ViewChannel (mở xem)
// hasRole = false -> member không có role => THÊM deny ViewChannel cho member (ẩn)
async function handleRoleUpdate(member, roleId, hasRole) {
  const guild = member.guild;
  const configs = ROLE_CATEGORY_MAP.filter(c => c.roleId === roleId);

  for (const config of configs) {
    const category = guild.channels.cache.get(config.categoryId);
    if (!category) {
      console.log(`⚠️ Không tìm thấy danh mục ${config.categoryId}`);
      continue;
    }

    const roleName = guild.roles.cache.get(roleId)?.name || roleId;
    const categoryName = category.name;
    const actionText = hasRole ? "XÓA ẨN (MỞ VIEW)" : "CHẶN VIEW";

    console.log(`\n👤 ${member.user.tag} | Role: ${roleName} | Category: ${categoryName} | Hành động: ${actionText}`);

    const channels = [...category.children.cache.values()];

    for (const channel of channels) {
      try {
        const perms = channel.permissionOverwrites.cache.get(member.id);

        if (hasRole) {
          // Có role -> remove override nếu có deny ViewChannel
          if (perms && perms.deny.has(PermissionFlagsBits.ViewChannel)) {
            await channel.permissionOverwrites.delete(member.id).catch(() => {});
            console.log(`✅ Mở xem: ${channel.name}`);
          }
        } else {
          // Không có role -> thêm deny (ẩn)
          await channel.permissionOverwrites.edit(member.id, { ViewChannel: false }).catch(() => {});
          console.log(`🚫 Ẩn: ${channel.name}`);
        }

        // Delay nhẹ giữa từng chỉnh để giảm khả năng rate-limit
        await delay(250);
      } catch (err) {
        console.log(`⚠️ Lỗi chỉnh quyền kênh ${channel.name}:`, err?.message || err);
      }
    }

    console.log(`✅ Hoàn tất ${actionText.toLowerCase()} trong "${categoryName}" (${channels.length} kênh)`);
  }
}

// ====== Event: Khi role thay đổi (guildMemberUpdate) ======
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    // Lọc các role trong map mà có thay đổi (added or removed)
    const changed = ROLE_CATEGORY_MAP
      .map(c => c.roleId)
      .filter((v, i, a) => a.indexOf(v) === i) // unique roleIds
      .filter(roleId => oldRoles.has(roleId) !== newRoles.has(roleId));

    if (changed.length === 0) return;

    console.log(`\n⚙️ Phát hiện thay đổi role ở ${newMember.user.tag}:`, changed);
    // Xử lý từng role thay đổi (mỗi role có thể map tới nhiều category)
    for (const roleId of changed) {
      const hasRole = newRoles.has(roleId);
      await handleRoleUpdate(newMember, roleId, hasRole);
    }
  } catch (err) {
    console.error("❌ Lỗi trong guildMemberUpdate handler:", err);
  }
});

// ====== Khi bot online ======
client.once("ready", async () => {
  console.log(`✅ Bot đã đăng nhập: ${client.user.tag}`);

  // Cập nhật counter ngay khi ready
  await updateCounters(true);

  // Lặp cập nhật counter mỗi 5 phút
  setInterval(() => updateCounters(true), 5 * 60 * 1000);
});

// ====== Keep Alive (simple web ping) ======
app.get("/", (req, res) => res.send("✅ Server Counter + Role Visibility Bot is alive!"));
app.listen(PORT, () => console.log(`🌐 Keep-alive chạy tại cổng ${PORT}`));

// ====== Shutdown handlers (cập nhật trạng thái offline trước khi exit) ======
async function shutdown() {
  try {
    await updateCounters(false);
  } catch (e) { /* ignore */ }
  console.log("🔴 Bot tắt, cập nhật trạng thái Offline.");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ====== Đăng nhập ======
client.login(process.env.TOKEN);
