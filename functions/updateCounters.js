async function updateVoiceCounters(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  if (!guild) return;

  const chAll = process.env.CH_ALL;
  const chMembers = process.env.CH_MEMBERS;
  const chOnline = process.env.CH_ONLINE;
  const chServer = process.env.CH_SERVER;

  // ép fetch toàn bộ member để count chính xác
  await guild.members.fetch().catch(() => {});

  const total = guild.members.cache.filter(m => !m.user.bot).size;
  const online = guild.members.cache.filter(
    m => !m.user.bot && m.presence && m.presence.status !== "offline"
  ).size;

  try {
    const all = await guild.channels.fetch(chAll).catch(() => null);
    const members = await guild.channels.fetch(chMembers).catch(() => null);
    const onlineCh = await guild.channels.fetch(chOnline).catch(() => null);
    const server = await guild.channels.fetch(chServer).catch(() => null);

    if (all) await all.setName(`📊 All Members: ${total}`).catch(() => {});
    if (members) await members.setName(`👤 Members: ${total - online}`).catch(() => {});
    if (onlineCh) await onlineCh.setName(`🟢 Online: ${online}`).catch(() => {});
    if (server) await server.setName(`🖥 Server: Active`).catch(() => {});

    console.log(`🔄 Đã cập nhật counter: ${online}/${total}`);
  } catch (err) {
    console.error("❌ Lỗi khi cập nhật voice counters:", err);
  }
}

async function initCounters(client) {
  console.log("🧮 Quét toàn bộ thành viên để cập nhật ban đầu...");
  await updateVoiceCounters(client);
  console.log("✅ Đã hoàn tất quét ban đầu!");
}

module.exports = { updateVoiceCounters, initCounters };
