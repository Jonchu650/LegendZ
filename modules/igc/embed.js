import { EmbedBuilder } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import EmbedState from "../../models/embedState.js";
import Member from "../../models/member.js";

const cfgPath = path.join(process.cwd(), "modules", "igc", "config.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

export async function getStatusChannel(client, interaction) {
  const state = await EmbedState.findById("singleton");
  const stored = state?.channelId ? client.channels.cache.get(state.channelId) : null;
  if (stored) return stored;

  if (cfg.defaultChannelId) {
    const fromCfg = client.channels.cache.get(cfg.defaultChannelId);
    if (fromCfg) return fromCfg;
  }

  return interaction.channel;
}

export async function updateEmbed(channel) {
  const members   = await Member.find();
  const total     = members.length;
  const completed = members.filter((m) => m.done).length;

  const title = (cfg.titleTemplate || "Clan Mission Status ({completed}/{total})")
    .replace("{completed}", String(completed))
    .replace("{total}", String(total));

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      members.length
        ? members.map((m) => `${m.done ? "✅" : "❌"} <@${m.userId}>`).join("\n")
        : "No members yet."
    )
    .setTimestamp();

  let state = await EmbedState.findById("singleton");
  if (!state) state = new EmbedState({ _id: "singleton" });

  try {
    if (state.messageId) {
      const msg = await channel.messages.fetch(state.messageId);
      await msg.edit({ embeds: [embed] });
    } else {
      const msg = await channel.send({ embeds: [embed] });
      state.messageId = msg.id;
      state.channelId = channel.id;
    }
  } catch {
    const msg = await channel.send({ embeds: [embed] });
    state.messageId = msg.id;
    state.channelId = channel.id;
  }

  await state.save();
}
