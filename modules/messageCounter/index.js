import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import MessageStat from "./model.js";
import { getWeekKey } from "../../utils/weekKey.js";
import Member from "../../models/member.js"; // <-- use IGC's clan membership

const NAME = "messageCounter";
const MEMBERSHIP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const WEEKLY_REQUIREMENT = 50;

// simple in-memory cache: userId -> { inClan: boolean, at: number }
const membershipCache = new Map();

async function isClanMember(userId) {
  const now = Date.now();
  const cached = membershipCache.get(userId);
  if (cached && now - cached.at < MEMBERSHIP_TTL_MS) {
    return cached.inClan;
  }
  // Member collection stores global clan members (by userId)
  const exists = !!(await Member.exists({ userId }));
  membershipCache.set(userId, { inClan: exists, at: now });
  return exists;
}

async function incrementCount(msg) {
  if (msg.author.bot || !msg.guildId) return;
  if (!(await isClanMember(msg.author.id))) return; // <-- only count clan members

  const weekKey = getWeekKey(new Date());
  await MessageStat.updateOne(
    { guildId: msg.guildId, userId: msg.author.id, weekKey },
    { $inc: { count: 1 } },
    { upsert: true }
  );
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("messages")
      .setDescription("Message count tools (weekly)")
      .addSubcommand(s =>
        s.setName("top")
         .setDescription("Show this week's top message senders (clan only)")
         .addIntegerOption(o =>
           o.setName("limit").setDescription("How many to show (default 10)")
            .setMinValue(1).setMaxValue(25)
         )
      )
      .addSubcommand(s =>
        s.setName("me")
         .setDescription("Show your message count for this week")
      )
      .addSubcommand(s =>
        s.setName("lacking")
         .setDescription(`Show clan members below the weekly requirement (${WEEKLY_REQUIREMENT})`)
      )
      .addSubcommand(s =>
        s.setName("reset")
         .setDescription("Reset this week's message counts")
      ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const weekKey = getWeekKey(new Date());

      if (sub === "top") {
        const requested = interaction.options.getInteger("limit") ?? 15;
        const limit = Math.min(15, Math.max(1, requested));

        const rows = await MessageStat.find({ guildId: interaction.guildId, weekKey })
          .sort({ count: -1 })
          .limit(limit)
          .lean();

        if (!rows.length) {
          return interaction.reply({
            content: "No clan messages counted yet this week.",
            flags: MessageFlags.Ephemeral
          });
        }

        // Show mentions (no ping-suppression requested)
        const lines = rows.map((r, i) => `**${i + 1}.** <@${r.userId}> — \`${r.count}\``);

        const embed = new EmbedBuilder()
          .setTitle(`Top ${rows.length} (clan) — ${weekKey}`)
          .setDescription(lines.join("\n"))
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      if (sub === "me") {
        const isMember = await isClanMember(interaction.user.id);
        if (!isMember) {
          return interaction.reply({
            content: "You’re not in the clan, so your messages aren’t being tracked.",
            flags: MessageFlags.Ephemeral
          });
        }

        const stat = await MessageStat.findOne({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          weekKey
        }).lean();

        const count = stat?.count ?? 0;
        return interaction.reply({
          content: `You have sent **${count}** message(s) this week (${weekKey}).`,
          flags: MessageFlags.Ephemeral
        });
      }

      if (sub === "lacking") {
        const roleId = process.env.STAFF_ROLE_ID?.trim();
        if (!roleId || !interaction.member.roles.resolve(roleId)) {
          return interaction.reply({
            content: "Insufficient permissions.",
            flags: MessageFlags.Ephemeral
          });
        }
        // Get all clan members (global list per your current schema)
        const members = await Member.find().lean();

        // Build a quick lookup of counts for this week in this guild
        const stats = await MessageStat.find({ guildId: interaction.guildId, weekKey })
          .lean();
        const countMap = new Map(stats.map(s => [s.userId, s.count]));

        // Anyone below requirement
        const lacking = members.filter(m => (countMap.get(m.userId) ?? 0) < WEEKLY_REQUIREMENT);

        if (!lacking.length) {
          return interaction.reply({
            content: `🎉 Everyone has at least **${WEEKLY_REQUIREMENT}** messages this week (${weekKey}).`,
            flags: MessageFlags.Ephemeral
          });
        }

        // Sort by current count ascending so worst offenders are first
        lacking.sort((a, b) => (countMap.get(a.userId) ?? 0) - (countMap.get(b.userId) ?? 0));

        // Render with mentions and counts
        const lines = lacking.map(m => {
          const c = countMap.get(m.userId) ?? 0;
          return `<@${m.userId}> — \`${c}/${WEEKLY_REQUIREMENT}\``;
        });

        // Chunk if extremely long (embed description max ~4096 chars)
        const embed = new EmbedBuilder()
          .setTitle(`Members under ${WEEKLY_REQUIREMENT} — ${weekKey}`)
          .setDescription(lines.join("\n").slice(0, 4000)) // safety margin
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      if (sub === "reset") {
        if (interaction.user.id !== "826522669381058612") {
          return interaction.reply({
            content: "Insufficient permissions.",
            flags: MessageFlags.Ephemeral
          });
        }
        await MessageStat.deleteMany({ guildId: interaction.guildId, weekKey });
        return interaction.reply({
          content: `✅ Reset message counts for **${weekKey}** in this server.`,
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
];

const events = [
  { name: "messageCreate", listener: (msg) => { incrementCount(msg).catch(() => {}); } }
];

export default {
  name: NAME,
  commands,
  events,
  async onEnable() {
    console.log(`✅ ${NAME} enabled (clan-only message counting)`);
  }
};
