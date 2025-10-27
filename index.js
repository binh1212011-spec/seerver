require("dotenv").config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

client.once("ready", async () => {
  console.log(`✅ BOT LOGIN THÀNH CÔNG: ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    console.log(`🏠 Fetched guild: ${guild.name} (${guild.id})`);

    await guild.members.fetch();
    console.log(`👥 Fetched members: ${guild.memberCount}`);
  } catch (err) {
    console.error("❌ Lỗi fetch guild/members:", err);
  }
});

// Event debug role changes
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  console.log(`⚡ MemberUpdate event: ${newMember.user.tag}`);
  const oldRoles = oldMember.roles.cache.map(r => r.id);
  const newRoles = newMember.roles.cache.map(r => r.id);
  console.log("Old roles:", oldRoles);
  console.log("New roles:", newRoles);
});

client.login(process.env.TOKEN).catch(err => {
  console.error("❌ Login BOT thất bại:", err);
});
