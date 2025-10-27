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

// ====== Delay nhẹ để giảm khả năng rate-limit (tùy chỉnh nếu cần) ======
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ====== Cập nhật counter (tùy chọn giữ lại) ======
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

// ====== Hàm chính: xử lý visibility cho 1 member & 1 role ======
// hasRole === true  => member có role → XÓA member overwrite nếu có deny ViewChannel
// hasRole === false => member không có role => THÊM/SET member overwrite ViewChannel: false (ẩn)
async function handleRoleVisibilityForMember(member, roleId, hasRole) {
  const guild = member.guild;
  const configs = ROLE_CATEGORY_MAP.filter(c => c.roleId === roleId);

  // lấy danh sách category tương ứng với role này
  for (const cfg of configs) {
    const category = guild.channels.cache.get(cfg.categoryId);
    if (!category) {
      console.warn(`⚠️ Không tìm thấy category ID ${cfg.categoryId} (role ${roleId})`);
      continue;
    }

    // Lấy tất cả channel con trong category (không chỉnh category)
    const channels = [...category.children.cache.values()];

    console.log(`\n👤 ${member.user.tag} | RoleID: ${roleId} | Category: ${category.name} | hasRole: ${hasRole}`);
    for (const channel of channels) {
      try {
        // CHÚ Ý: chỉ thao tác với member overwrite, KHÔNG động tới role overwrite hay category overwrite
        const memberOverwrite = channel.permissionOverwrites.cache.get(member.id);

        if (hasRole) {
          // Member có role -> nếu có deny ViewChannel ở mức member thì xóa overwrite của member (restore inheritance)
          if (memberOverwrite && memberOverwrite.deny.has(PermissionFlagsBits.ViewChannel)) {
            await channel.permissionOverwrites.delete(member.id).catch(err => {
              console.warn(`⚠️ Xóa overwrite thất bại cho ${channel.name}:`, err?.message || err);
            });
            console.log(`✅ Đã xóa overwrite (mở) cho ${channel.name}`);
          } else {
            // không có deny member -> không làm gì
          }
        } else {
          // Member không có role -> set deny ViewChannel cho member (ẩn riêng người đó)
          await channel.permissionOverwrites.edit(member.id, { ViewChannel: false }).catch(err => {
            console.warn(`⚠️ Set deny thất bại cho ${channel.name}:`, err?.message || err);
          });
          console.log(`🚫 Đã đặt deny ViewChannel cho ${channel.name}`);
        }

        // Delay nhẹ giữa các chỉnh sửa (tùy chỉnh nếu cần)
        await delay(200);
      } catch (err) {
        console.error(`❌ Lỗi khi xử lý kênh ${channel.name}:`, err);
      }
    } // end for channels

    console.log(`✅ Hoàn tất xử lý category "${category.name}" (${channels.length} kênh) cho member ${member.user.tag}`);
  } // end for configs
}

// ====== Event: phát hiện role thay đổi trên member ======
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    // đảm bảo cache roles
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    // Lấy tất cả roleId duy nhất trong map, kiểm tra role nào thay đổi
    const uniqueRoleIds = [...new Set(ROLE_CATEGORY_MAP.map(r => r.roleId))];

    // role nào có thay đổi trạng thái giữa old vs new -> xử lý
    const changed = uniqueRoleIds.filter(roleId => oldRoles.has(roleId) !== newRoles.has(roleId));
    if (changed.length === 0) return;

    console.log(`\n⚙️ Phát hiện thay đổi role cho ${newMember.user.tag}:`, changed);

    // xử lý từng role thay đổi (mỗi role có thể map tới nhiều category)
    for (const roleId of changed) {
      const hasRole = newRoles.has(roleId);
      // gọi hàm xử lý chính
      await handleRoleVisibilityForMember(newMember, roleId, hasRole);
    }
  } catch (err) {
    console.error("❌ Lỗi trong guildMemberUpdate handler:", err);
  }
});

// ====== Ready: cập nhật counter (nếu bạn dùng) ======
client.once("ready", async () => {
  console.log(`✅ Bot đã đăng nhập: ${client.user.tag}`);

  // cập nhật counter khi start
  await updateCounters(true);
  // đặt interval nếu muốn
  setInterval(() => updateCounters(true), 5 * 60 * 1000);
});

// ====== Keep-alive web endpoint ======
app.get("/", (req, res) => res.send("✅ Bot is alive"));
app.listen(PORT, () => console.log(`🌐 Keep-alive chạy cổng ${PORT}`));

// ====== Shutdown xử lý ======
async function shutdown() {
  try { await updateCounters(false); } catch (e) {}
  console.log("🔴 Bot tắt");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ====== Login ======
client.login(process.env.TOKEN);
