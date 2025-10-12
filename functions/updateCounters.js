// functions/updateCounters.js
async function updateVoiceCounters(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  if (!guild) return;

  const totalId = process.env.CH_ALL;
  const membersId = process.env.CH_MEMBERS;
  const onlineId = process.env.CH_ONLINE;
  const serverId = process.env.CH_SERVER;

  // ép fetch toàn bộ member (bắt buộc để có presence và count chính xác)
  await guild.members.fetch().catch(() => {});

  const totalMembers = guild.members.cache.filter(m => !m.user.bot).size;
  const onlineMembers = guild.members.cache.filter(
    m => !m.user.bot && m.presence && m.presence.status !== "offline"
  ).size;

  try {
    const chAll = await guild.channels.fetch(totalId).catch(() => null);
    const chMembers = await guild.channels.fetch(membersId).catch(() => null);
    const chOnline = await guild.channels.fetch(onlineId).catch(() => null);
    const chServer = await guild.channels.fetch(serverId).catch(() => null);

    if (chAll) await chAll.setName(`📊 All Members: ${totalMembers}`).catch(() => {});
    if (chMembers) await chMembers.setName(`👤 Members: ${totalMembers - onlineMembers}`).catch(() => {});
    if (chOnline) await chOnline.setName(`🟢 Online: ${onlineMembers}`).catch(() => {});
    if (chServer) await chServer.setName(`🖥 Server: Active`).catch(() => {});

    console.log(`🔄 Đã cập nhật counter: ${onlineMembers}/${totalMembers}`);
  } catch (err) {
    console.error("❌ Lỗi khi cập nhật voice counters:", err);
  }
}

// hàm này dùng khi khởi động bot (ép quét 1 lần)
async function initCounters(client) {
  console.log("🧮 Đang quét toàn bộ thành viên để cập nhật ban đầu...");
  await updateVoiceCounters(client);
  console.log("✅ Quét hoàn tất!");
}

module.exports = { updateVoiceCounters, initCounters };
