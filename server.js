import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { Client, GatewayIntentBits } from 'discord.js';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ROLE_NAME = process.env.ROLE_NAME || "GameAdmin";
const API_PORT = Number(process.env.API_PORT || 3000);
const API_SECRET = process.env.API_SECRET;

if (!DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN .env içinde yok!");
  process.exit(1);
}
if (!API_SECRET) {
  console.error("API_SECRET .env içinde yok!");
  process.exit(1);
}

const app = express();
app.use(express.json());

const statePath = path.join(process.cwd(), 'state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return { open: false, updatedAt: Date.now(), updatedBy: "system" };
  }
}

function saveState(s) {
  fs.writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8');
}

let state = loadState();

/**
 * GET /status
 * Roblox bu endpoint'i okuyacak
 */
app.get('/status', (req, res) => {
  res.json(state);
});

/**
 * POST /set  (isteğe bağlı, dışarıdan set etmek istersen)
 * Header: x-secret: API_SECRET
 * Body: { open: true/false, updatedBy: "discordUser#1234" }
 */
app.post('/set', (req, res) => {
  const secret = req.headers['x-secret'];
  if (secret !== API_SECRET) return res.status(403).json({ ok: false, error: "forbidden" });

  const { open, updatedBy } = req.body;
  if (typeof open !== 'boolean') return res.status(400).json({ ok: false, error: "open must be boolean" });

  state = { open, updatedAt: Date.now(), updatedBy: updatedBy || "unknown" };
  saveState(state);

  res.json({ ok: true, state });
});

app.listen(API_PORT, () => {
  console.log(`[API] Running on http://localhost:${API_PORT}`);
  console.log(`[API] /status returns { open: true/false }`);
});

// ------------------ DISCORD BOT ------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
});

function hasRole(member, roleName) {
  if (!member) return false;
  return member.roles.cache.some(r => r.name === roleName);
}

async function setGameOpen(open, msg) {
  state = {
    open,
    updatedAt: Date.now(),
    updatedBy: msg.author.tag
  };
  saveState(state);

  if (open) {
    await msg.reply(`${msg.author} Oyun açıldı ✅`);
  } else {
    await msg.reply(`${msg.author} Oyun kapandı ❌`);
  }
}

client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.bot) return;

    const text = msg.content.trim();

    if (text !== "!oyunuac" && text !== "!oyunukapat") return;

    // Role kontrol
    if (!hasRole(msg.member, ROLE_NAME)) {
      await msg.reply("Bu komutu kullanamazsın (GameAdmin rolü gerekli).");
      return;
    }

    if (text === "!oyunuac") {
      await setGameOpen(true, msg);
    } else {
      await setGameOpen(false, msg);
    }
  } catch (err) {
    console.error("[BOT] Error:", err);
  }
});

client.login(DISCORD_TOKEN).then(() => {
  console.log("[BOT] Logged in.");
  console.log(`Role required: ${ROLE_NAME}`);
});
