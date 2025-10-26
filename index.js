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
  { roleId: "1428899344010182756", categoryId: "1428927402444325024" },
];

// ====== Hàm cập nhật counter ======
async function updateCounters(online = true) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.members.fetch();

    const chAll = guild.channels.cache.get(process.env.CH_ALL);
    const chMembers = guild.channels.cache.get(process.env.CH_MEMBERS);
    const chServer = guild.channels.cache.get(process.env.CH_SERVER);

    if (!chAll || !chMembers || !chServer)
      return console.log("⚠️ Không tìm thấy channel counter!");

    const total = guild.memberCount;
    const humans = guild.members.cache.filter(m => !m.user.bot).size;

    await Promise.allSettled([
      chAll.setName(`╭ All Members: ${total}`),
      chMembers.setName(`┊ Members: ${humans}`),
      chServer.setName(`╰ Server: ${online ? "🟢 Active" : "🔴 Offline"}`),
    ]);

    console.log(
      `✅ Counter → Tổng: ${total}, Người: ${humans}, Trạng thái: ${online ? "Online" : "Offline"}`
    );
  } catch (err) {
    console.error("❌ Lỗi cập nhật counter:", err);
  }
}

// ====== Hàm xử lý role thay đổi ======
async function handleRoleUpdate(member, roleId, added) {
  const guild = member.guild;
  const config = ROLE_CATEGORY_MAP.find(c => c.roleId === roleId);
  if (!config) return;

  const category = guild.channels.cache.get(config.categoryId);
  if (!category) return console.log(`⚠️ Không tìm thấy danh mục ${config.categoryId}`);

  const roleName = guild.roles.cache.get(roleId)?.name || roleId;
  const categoryName = category.name;

  const actionText = added ? "BỎ CHẶN" : "CHẶN";
  console.log(
    `\n👤 ${member.user.tag} | Role: ${roleName} | Category: ${categoryName} | Hành động: ${actionText}`
  );

  // Lấy tất cả channel con trong danh mục
  const channels = [...category.children.cache.values()];

  // Gom toàn bộ promises
  const actions = channels.map(channel => {
    const currentPerms = channel.permissionOverwrites.cache.get(member.id);

    // Nếu được thêm role → bỏ chặn (xóa deny)
    if (added) {
      if (currentPerms && currentPerms.deny.has(PermissionFlagsBits.ViewChannel)) {
        return channel.permissionOverwrites.delete(member.id).catch(() => {});
      }
      return Promise.resolve();
    }

    // Nếu mất role → chặn lại
    return channel.permissionOverwrites
      .edit(member.id, { ViewChannel: false })
      .catch(() => {});
  });

  // Chạy tất cả cùng lúc (tránh rate limit)
  await Promise.allSettled(actions);

  console.log(`✅ Hoàn tất ${actionText.toLowerCase()} ${channels.length} kênh trong "${categoryName}"`);
}

// ====== Event: Khi role thay đổi ======
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;

  const changedRoles = ROLE_CATEGORY_MAP.filter(({ roleId }) => {
    const hadRole = oldRoles.has(roleId);
    const hasRole = newRoles.has(roleId);
    return hadRole !== hasRole;
  });

  if (changedRoles.length === 0) return;

  // Xử lý tất cả role thay đổi 1 lần (gom chung)
  console.log(`\n⚙️ Phát hiện thay đổi role ở ${newMember.user.tag}`);
  const promises = changedRoles.map(({ roleId }) => {
    const added = newRoles.has(roleId);
    return handleRoleUpdate(newMember, roleId, added);
  });

  await Promise.allSettled(promises);
});

// ====== Khi bot online ======
client.once("ready", async () => {
  console.log(`✅ Bot đã đăng nhập: ${client.user.tag}`);

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await updateCounters(true);

  // Cập nhật counter mỗi 5 phút
  setInterval(() => updateCounters(true), 5 * 60 * 1000);
});

// ====== Keep Alive ======
app.get("/", (req, res) =>
  res.send("✅ Server Counter + Optimized Role Permission Bot is alive!")
);
app.listen(PORT, () => console.log(`🌐 Keep-alive chạy tại cổng ${PORT}`));

// ====== Khi tắt bot ======
process.on("SIGINT", async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await updateCounters(false);
  console.log("🔴 Bot tắt, cập nhật trạng thái Offline.");
  process.exit();
});
process.on("SIGTERM", async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await updateCounters(false);
  console.log("🔴 Bot tắt, cập nhật trạng thái Offline.");
  process.exit();
});

// ====== Đăng nhập ======
client.login(process.env.TOKEN);
