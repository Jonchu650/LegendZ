import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Collection,
  MessageFlags
} from "discord.js";
import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

dotenv.config();
const { BOT_TOKEN, CLIENT_ID, GUILD_ID, MONGO_URI, STAFF_ROLE_ID } = process.env;

/* ---------- Mongo ---------- */
await mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

/* ---------- Config ---------- */
const modulesConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "modules.json"), "utf8")
);

/* ---------- Client ---------- */
// GuildMessages is needed so modules can listen for messageCreate.
// No MessageContent intent required for just counting messages.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});
const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);

/* ---------- Module loader contracts ----------
A module default export must be:
{
  name: string,
  commands?: [{ data: SlashCommandBuilder, execute(interaction, client) }],
  events?: [{ name: 'messageCreate'|'interactionCreate'|..., listener: Function }],
  onEnable?: (client) => void|Promise<void>
}
------------------------------------------------ */
client.commands = new Collection();
const registeredEventCleanups = [];

async function loadEnabledModules() {
  const dir = path.join(process.cwd(), "modules");
  const payloadForRegistration = [];

  for (const modName of modulesConfig.enabled) {
    const entry = path.join(dir, modName, "index.js");
    const mod = await import(pathToFileURL(entry).href);

    if (!mod?.default?.name) {
      console.warn(`⚠️ Module "${modName}" missing default export or name`);
      continue;
    }

    const m = mod.default;

    // Commands
    if (Array.isArray(m.commands)) {
      for (const c of m.commands) {
        if (!c?.data?.name || typeof c.execute !== "function") {
          console.warn(`⚠️ Module "${m.name}" command missing data.name or execute`);
          continue;
        }
        const json = c.data.toJSON ? c.data.toJSON() : c.data;
        payloadForRegistration.push(json);
        client.commands.set(c.data.name, c.execute);
      }
    }

    // Events
    if (Array.isArray(m.events)) {
      for (const e of m.events) {
        client.on(e.name, e.listener);
        registeredEventCleanups.push(() => client.off(e.name, e.listener));
      }
    }

    if (typeof m.onEnable === "function") await m.onEnable(client);

    console.log(`🧩 Loaded module: ${m.name}`);
  }

  return payloadForRegistration;
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const commandsJSON = await loadEnabledModules();
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commandsJSON }
    );
    console.log(`✅ Registered ${commandsJSON.length} slash command(s) from modules.`);
  } catch (err) {
    console.error("❌ Command registration failed:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Central role gate by ID

  const execute = client.commands.get(interaction.commandName);
  if (!execute) {
    return interaction.reply({
      content: "Unknown command.",
      flags: MessageFlags.Ephemeral
    });
  }

  try {
    await execute(interaction, client);
  } catch (err) {
    console.error(`Command error in /${interaction.commandName}:`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Something went wrong.",
        flags: MessageFlags.Ephemeral
      });
    }
  }
});

client.login(BOT_TOKEN);
