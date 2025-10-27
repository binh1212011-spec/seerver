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

// ====== Cấu hình role block kênh ======
const ROLE_BLOCK_CHANNELS = {
  roleId: "1411991634194989096",
  blockedChannels: [
    "1419727338119368784",
    "1419727361062076418",
    "1423207293335371776",
    "1419725921363034123",
    "1419989424904736880",
  ],
};

// Delay nhẹ tránh rate-limit
const delay = ms => new Promise(res => setTimeout(res, ms));

// ====== Hàm xử lý visibility theo role → category ======
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
          // Có role → xóa deny ViewChannel
          if (overwrite && overwrite.deny.has(PermissionFlagsBits.ViewChannel)) {
            await channel.permissionOverwrites.delete(member.id).catch(() => {});
            console.log(`✅ Mở kênh ${channel.name} cho ${member.user.tag}`);
          }
        } else {
          // Không role → deny ViewChannel
          await channel.permissionOverwrites.edit(member.id, { ViewChannel: false }).catch(() => {});
          console.log(`🚫 Ẩn kênh ${channel.name} cho ${member.user.tag}`);
        }

        await delay(200);
      } catch (err) {
        console.warn(`⚠️ Lỗi channel ${channel.name}:`, err.message || err);
      }
    }
  }
}

// ====== Hàm xử lý block channel ======
async function handleBlockedChannels(member, hasRole) {
  const guild = member.guild;

  for (const channelId of ROLE_BLOCK_CHANNELS.blockedChannels) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;

    try {
      if (hasRole) {
        // Có role → ẩn kênh (deny ViewChannel)
        await channel.permissionOverwrites.edit(member.id, { ViewChannel: false }).catch(() => {});
        console.log(`🧱 Ẩn ${channel.name} cho ${member.user.tag} (do có role block)`);
      } else {
        // Mất role → xoá overwrite (trả về mặc định)
        const overwrite = channel.permissionOverwrites.cache.get(member.id);
        if (overwrite) {
          await channel.permissionOverwrites.delete(member.id).catch(() => {});
          console.log(`✅ Gỡ block ${channel.name} cho ${member.user.tag}`);
        }
      }

      await delay(200);
    } catch (err) {
      console.warn(`⚠️ Lỗi xử lý block channel ${channel.name}:`, err.message || err);
    }
  }
}

// ====== Event role thay đổi ======
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const allRoleIds = [
    ...new Set(ROLE_CATEGORY_MAP.map(r => r.roleId).concat(ROLE_BLOCK_CHANNELS.roleId))
  ];

  const changed = allRoleIds.filter(
    roleId => oldMember.roles.cache.has(roleId) !== newMember.roles.cache.has(roleId)
  );

  if (!changed.length) return;
  console.log(`⚙️ Role changed for ${newMember.user.tag}:`, changed);

  for (const roleId of changed) {
    const hasRole = newMember.roles.cache.has(roleId);

    if (ROLE_CATEGORY_MAP.some(r => r.roleId === roleId)) {
      await handleRoleVisibility(newMember, roleId, hasRole);
    }
    if (roleId === ROLE_BLOCK_CHANNELS.roleId) {
      await handleBlockedChannels(newMember, hasRole);
    }
  }
});

// ====== Ready ======
client.once("ready", async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.members.fetch();

    console.log(`👥 Fetched ${guild.memberCount} members`);
    console.log("⚙️ Quét toàn bộ member để đồng bộ quyền...");

    const members = guild.members.cache.filter(m => !m.user.bot);
    for (const member of members.values()) {
      const allRoleIds = [
        ...new Set(ROLE_CATEGORY_MAP.map(r => r.roleId).concat(ROLE_BLOCK_CHANNELS.roleId))
      ];

      for (const roleId of allRoleIds) {
        const hasRole = member.roles.cache.has(roleId);

        if (ROLE_CATEGORY_MAP.some(r => r.roleId === roleId)) {
          await handleRoleVisibility(member, roleId, hasRole);
        }
        if (roleId === ROLE_BLOCK_CHANNELS.roleId) {
          await handleBlockedChannels(member, hasRole);
        }
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
