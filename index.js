const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  Events,
} = require("discord.js");
const express = require("express");
require("dotenv").config();

const rules = require("./rules");
const { renameChannel } = require("./functions/renameChannel");
const { updateVoiceCounters } = require("./functions/updateCounters");

const {
  TOKEN,
  GUILD_ID,
  CATEGORY_ID,
  RULES_CHANNEL_ID,
  ROLE_ID,
  EXCLUDED_ROLE_ID,
  PORT,
} = process.env;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Channel, Partials.GuildMember],
});

// ====== READY ======
client.once("ready", async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);

  // Cập nhật voice counter
  await updateVoiceCounters(client);

  // Rename lại các channel trong CATEGORY_ID
  client.channels.cache
    .filter(ch => ch.parentId === CATEGORY_ID)
    .forEach(ch => renameChannel(ch));

  // Gửi menu rules nếu chưa có
  const channel = await client.channels.fetch(RULES_CHANNEL_ID);
  if (!channel) return console.log("❌ Không tìm thấy kênh rules");

  const messages = await channel.messages.fetch({ limit: 50 });
  const alreadySent = messages.find(
    m => m.author.id === client.user.id &&
    m.components.length > 0 &&
    m.components[0].components[0].customId === "rules_menu"
  );

  if (!alreadySent) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("rules_menu")
      .setPlaceholder("Select rules you would like to see")
      .addOptions([
        { label: "1 Warning Rules", value: "opt1", emoji: "<:x1Warn:1416316742384357396>" },
        { label: "Channel Misuses", value: "opt2", emoji: "<:channelmisuse:1416316766312857610>" },
        { label: "2 Warning Rules", value: "opt3", emoji: "<:x2Warn:1416316781060161556>" },
        { label: "3 Warning Rules", value: "opt4", emoji: "<:x3Warn:1416316796029374464>" },
        { label: "Instant Ban Rules", value: "opt5", emoji: "<:instantban:1416316818297192510>" },
      ]);

    const row = new ActionRowBuilder().addComponents(menu);

    await channel.send({
      content: "📜 **Server Rules are pinned here:**",
      components: [row],
    });

    console.log("✅ Đã gửi menu rules mới.");
  }
});

// ====== CẬP NHẬT MEMBER COUNT ======
client.on(Events.GuildMemberAdd, () => updateVoiceCounters(client));
client.on(Events.GuildMemberRemove, () => updateVoiceCounters(client));
client.on(Events.PresenceUpdate, () => updateVoiceCounters(client));

// ====== AUTO ROLE LOGIC ======
client.on("channelCreate", async (channel) => {
  if (channel.parentId !== CATEGORY_ID) return;

  await renameChannel(channel);

  if (!channel.topic) return;
  const match = channel.topic.match(/(\d{17,19})$/);
  if (!match) return;

  const userId = match[1];

  try {
    const member = await channel.guild.members.fetch(userId);
    if (!member) return;

    const mainRole = channel.guild.roles.cache.get(ROLE_ID);
    const excludedRole = channel.guild.roles.cache.get(EXCLUDED_ROLE_ID);
    if (!mainRole) return console.log("❌ ROLE_ID không tồn tại.");

    // Nếu member có cả hai role → xóa excludedRole
    if (member.roles.cache.has(mainRole.id) && member.roles.cache.has(excludedRole?.id)) {
      await member.roles.remove(excludedRole).catch(() => {});
      console.log(`🧹 Đã xóa role ${excludedRole?.name} khỏi ${member.user.tag}`);
    }

    // Nếu chưa có mainRole và không có excludedRole → thêm mainRole
    if (!member.roles.cache.has(mainRole.id) && !member.roles.cache.has(excludedRole?.id)) {
      await member.roles.add(mainRole);
      console.log(`✅ Đã add role ${mainRole.name} cho ${member.user.tag}`);
    }
  } catch (err) {
    console.error(`❌ Lỗi khi xử lý role cho ${userId}:`, err);
  }
});

// ====== RULES MENU ======
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isStringSelectMenu() || interaction.customId !== "rules_menu") return;

  const data = rules[interaction.values[0]];
  if (!data) return;

  const embed = new EmbedBuilder()
    .setTitle(data.title)
    .setDescription(data.desc)
    .setColor(data.color)
    .setImage(data.image);

  await interaction.reply({ embeds: [embed], ephemeral: true });
});

// ====== KEEP ALIVE ======
const app = express();
app.get("/", (req, res) => res.send("✅ Bot is running!"));
app.listen(PORT || 3000, () => console.log(`🌐 Server online on port ${PORT}`));

client.login(TOKEN);
