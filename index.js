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
          // Có role → xóa overwrite member nếu có deny ViewChannel
          if (overwrite && overwrite.deny.has(PermissionFlagsBits.ViewChannel)) {
            await channel.permissionOverwrites.delete(member.id).catch(() => {});
            console.log(`✅ Mở channel ${channel.name} cho ${member.user.tag}`);
          }
        } else {
          // Không role → deny ViewChannel member
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

// ====== Ready ======
client.once("ready", async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);

    // ✅ Fetch tất cả members trước khi quét
    await guild.members.fetch();
    console.log(`👥 Fetched ${guild.memberCount} members`);

    // ====== Quét tất cả member theo ROLE_CATEGORY_MAP ======
    console.log("⚙️ Bắt đầu quét tất cả member theo ROLE_CATEGORY_MAP...");

    const members = guild.members.cache.filter(m => !m.user.bot); // loại bỏ bot
    for (const member of members.values()) {
      const uniqueRoleIds = [...new Set(ROLE_CATEGORY_MAP.map(r => r.roleId))];
      for (const roleId of uniqueRoleIds) {
        const hasRole = member.roles.cache.has(roleId);
        await handleRoleVisibility(member, roleId, hasRole);
      }
    }

    console.log("✅ Hoàn tất quét tất cả member!");
  } catch (err) {
    console.error("❌ Lỗi fetch/quét members:", err);
  }
});

// ====== Keep-alive endpoint ======
app.get("/", (req, res) => res.send("✅ Bot is alive"));
app.listen(PORT, () => console.log(`🌐 Keep-alive running on port ${PORT}`));

// ====== Login bot ======
client.login(process.env.TOKEN).catch(err => {
  console.error("❌ Bot login failed:", err);
});
