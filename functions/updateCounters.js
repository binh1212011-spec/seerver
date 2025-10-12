async function updateVoiceCounters(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  if (!guild) return;

  const totalId = process.env.CH_ALL;
  const membersId = process.env.CH_MEMBERS;
  const onlineId = process.env.CH_ONLINE;
  const serverId = process.env.CH_SERVER;

  await guild.members.fetch().catch(() => {});

  const totalMembers = guild.members.cache.filter(m => !m.user.bot).size;
  const onlineMembers = guild.members.cache.filter(
    m => !m.user.bot && m.presence && m.presence.status !== "offline"
  ).size;

  try {
    const chAll = await guild.channels.fetch(totalId);
    const chMembers = await guild.channels.fetch(membersId);
    const chOnline = await guild.channels.fetch(onlineId);
    const chServer = await guild.channels.fetch(serverId);

    if (chAll) await chAll.setName(`All Members: ${totalMembers}`).catch(() => {});
    if (chMembers) await chMembers.setName(`Members: ${totalMembers - onlineMembers}`).catch(() => {});
    if (chOnline) await chOnline.setName(`Online: ${onlineMembers}`).catch(() => {});
    if (chServer) await chServer.setName(`Server: 🟢 Active`).catch(() => {});

    console.log(`🔄 Cập nhật counter: ${onlineMembers}/${totalMembers}`);
  } catch (err) {
    console.error("❌ Lỗi khi cập nhật voice counters:", err);
  }
}

module.exports = { updateVoiceCounters };
