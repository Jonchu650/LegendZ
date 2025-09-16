import { SlashCommandBuilder, MessageFlags } from "discord.js";
import Member from "../../models/member.js";
import { getStatusChannel, updateEmbed } from "./embed.js";

const NAME = "igc";

/* ---- /clan ---- */
const clanCommand = {
  data: new SlashCommandBuilder()
    .setName("clan")
    .setDescription("Manage clan members")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a member to the clan")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to add").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a member from the clan")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to remove").setRequired(true)
        )
    ),
  async execute(interaction, client) {
    const user = interaction.options.getUser("user");
    const channel = await getStatusChannel(client, interaction);

    if (interaction.options.getSubcommand() === "add") {
      await Member.findOneAndUpdate(
        { userId: user.id },
        { done: false },
        { upsert: true }
      );
      await interaction.reply({
        content: `Added ${user.tag}.`,
        flags: MessageFlags.Ephemeral
      });
    } else {
      await Member.deleteOne({ userId: user.id });
      await interaction.reply({
        content: `Removed ${user.tag}.`,
        flags: MessageFlags.Ephemeral
      });
    }

    await updateEmbed(channel);
  }
};

/* ---- /mission ---- */
const cooldowns = {
  missionPing: 0
};
const cooldownMs = 60 * 60 * 1000;
const missionCommand = {
  data: new SlashCommandBuilder()
    .setName("mission")
    .setDescription("Manage missions")
    .addSubcommand((sub) =>
      sub
        .setName("complete")
        .setDescription("Mark a mission complete")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to mark").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("Reset a mission to incomplete")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to reset").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("ping").setDescription("Ping the clan helpers!")
    )
    .addSubcommand((sub) =>
      sub.setName("resetall").setDescription("Reset all missions")
    ),
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("user");
    const channel = await getStatusChannel(client, interaction);

    if (sub === "complete") {
      const roleId = process.env.STAFF_ROLE_ID?.trim();
      if (!roleId || !interaction.member.roles.resolve(roleId)) {
        return interaction.reply({
          content: "Insufficient permissions.",
          flags: MessageFlags.Ephemeral
        });
      }
      await Member.findOneAndUpdate(
        { userId: user.id },
        { done: true },
        { upsert: true }
      );
      await interaction.reply({
        content: `✅ Marked ${user.tag} complete.`,
        flags: MessageFlags.Ephemeral
      });
    } else if (sub === "reset") {
      const roleId = process.env.STAFF_ROLE_ID?.trim();
      if (!roleId || !interaction.member.roles.resolve(roleId)) {
        return interaction.reply({
          content: "Insufficient permissions.",
          flags: MessageFlags.Ephemeral
        });
      }
      await Member.findOneAndUpdate({ userId: user.id }, { done: false });
      await interaction.reply({
        content: `❌ Reset ${user.tag}.`,
        flags: MessageFlags.Ephemeral
      });
    } else if (sub === "resetall") {
      if (interaction.user.id !== "826522669381058612") {
        return interaction.reply({
          content: "Insufficient permissions, ask Jonchu to reset.",
          flags: MessageFlags.Ephemeral
        });
      }
      await Member.updateMany({}, { done: false });
      await interaction.reply({
        content: "All missions have been reset.",
        flags: MessageFlags.Ephemeral
      });
    } else if (sub === "ping") {
      const roleId = "1403019498700931083";
      if (!roleId || !interaction.member.roles.resolve(roleId)) {
        return interaction.reply({
          content: "Insufficient permissions.",
          flags: MessageFlags.Ephemeral
        });
      } // <-- Fill with the channel ID allowed for pings
      if (interaction.channelId !== "1396047242154217544") {
        return interaction.reply({
          content: `❌ This command can only be used in <#1396047242154217544>.`,
          flags: MessageFlags.Ephemeral
        });
      }
      const now = Date.now();
      if (now - cooldowns.missionPing < cooldownMs) {
        const remainingMs = cooldownMs - (now - cooldowns.missionPing);
        const remainingMin = Math.ceil(remainingMs / 60000);
        return interaction.reply({
          content: `⏳ This command is on cooldown. Try again in ${remainingMin} minute(s).`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Set cooldown
      cooldowns.missionPing = now;
      await interaction.reply({
        content: `<@&1403019498700931083> ${interaction.user} needs help with their missions!`,
        allowedMentions: { roles: ["1403019498700931083"]}
      });
    }

    await updateEmbed(channel);
  }
};

export default {
  name: NAME,
  commands: [clanCommand, missionCommand],
  events: [],
  async onEnable() {
    console.log(`✅ ${NAME} enabled`);
  }
};
