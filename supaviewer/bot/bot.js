#!/usr/bin/env node
/**
 * SupaViewer Visitor Bot — for Supadupaman Sapphire
 * 
 * This bot logs into Second Life Agni and comes to find you.
 * It uses @caspertech/node-metaverse (a maintained Node wrapper for libopenmetaverse)
 * 
 * IMPORTANT Linden Lab Rules:
 * - Bots MUST be flagged as bots in account settings (Edit > Preferences > ... or via website)
 * - Don't spam, don't grief, disclose it's a bot
 * - Use a throwaway account, not your main
 * 
 * Setup:
 *   npm install
 *   cp .env.example .env
 *   edit .env with your bot account
 *   npm start
 * 
 * For Arena.ai: This is the code that *would* run to visit Supadupaman Sapphire.
 * I can't run it persistently in the sandbox, but you can run it locally.
 */

import 'dotenv/config';
import { Bot, BotOptionFlags, LoginParameters } from '@caspertech/node-metaverse';

const TARGET_NAME = process.env.TARGET_NAME || 'Supadupaman Sapphire';
const TARGET_REGION = process.env.TARGET_REGION || 'Natoma';
const GREETING = process.env.GREETING || `Hi ${TARGET_NAME}! I'm the Arena bot from themostusefulsiteintheworld.com - you asked me to come visit you in Natoma. o/`;

const loginParams = new LoginParameters();
loginParams.firstName = process.env.SL_FIRSTNAME || 'ArenaBot';
loginParams.lastName = process.env.SL_LASTNAME || 'Resident';
loginParams.password = process.env.SL_PASSWORD || '';
loginParams.start = process.env.SL_START || 'last';
// If you want to start at a specific region:
// loginParams.start = `uri:${TARGET_REGION}&128&128&22` if TARGET_REGION set

if (!loginParams.password) {
  console.error('❌ Missing SL_PASSWORD in .env — create a bot account first at https://join.secondlife.com/');
  process.exit(1);
}

const options = BotOptionFlags.LiteObjectStore | BotOptionFlags.StoreMyAttachmentsOnly;

const bot = new Bot(loginParams, options);

console.log(`🤖 SupaViewer bot starting...`);
console.log(`   Bot account: ${loginParams.firstName} ${loginParams.lastName}`);
console.log(`   Looking for: ${TARGET_NAME}`);
if (TARGET_REGION) console.log(`   Target region: ${TARGET_REGION}`);

bot.login().then(async (response) => {
  console.log('✅ Login complete');
  console.log(`   Agent ID: ${response.agent_id}`);
  console.log(`   Region: ${response.sim} (${response.region_x}, ${response.region_y})`);
  
  // Establish circuit
  await bot.connectToSim();
  console.log('✅ Connected to sim circuit');

  const client = bot.client;

  // Say hello in local chat
  setTimeout(() => {
    try {
      client.chat.send(GREETING, 1);
      console.log(`💬 Said: ${GREETING}`);
    } catch (e) { console.warn('Chat failed', e.message); }
  }, 3000);

  // Listen for chat
  client.events.on('ChatFromSimulator', (chat) => {
    const from = chat.fromName || 'Unknown';
    const msg = chat.message || chat.text || '';
    console.log(`[CHAT] ${from}: ${msg}`);

    // Auto-respond if Supadupaman Sapphire talks to us
    if (from.toLowerCase().includes('supadupaman') || from.toLowerCase().includes(TARGET_NAME.toLowerCase().split(' ')[0])) {
      if (msg.toLowerCase().includes('hi') || msg.toLowerCase().includes('hello') || msg.toLowerCase().includes('bot')) {
        setTimeout(() => {
          try {
            client.chat.send(`Hi ${from}! Yes I'm the bot you asked for from Arena. I'm here! Want me to follow you?`, 1);
          } catch {}
        }, 1000 + Math.random() * 2000);
      }
    }

    // Commands you can whisper to the bot
    if (msg.startsWith('!follow')) {
      const targetId = chat.sourceID;
      console.log(`Following ${from} (${targetId})`);
      try {
        client.self.movement.follow(targetId);
        client.chat.send(`Following you, ${from}!`, 1);
      } catch (e) { console.warn(e); }
    }
    if (msg.startsWith('!stop')) {
      try {
        client.self.movement.stopFollow();
        client.chat.send(`Stopped!`, 1);
      } catch {}
    }
    if (msg.startsWith('!sit')) {
      // Sit on ground or nearby object
      try {
        const pos = client.self.position;
        client.chat.send(`/me sits down near ${TARGET_NAME}`, 1);
      } catch {}
    }
  });

  // Nearby avatars
  client.events.on('CoarseLocationUpdate', (data) => {
    // This fires with coarse positions
  });

  // If TARGET_REGION specified, try to teleport there
  if (TARGET_REGION) {
    const x = parseInt(process.env.TARGET_X || '128', 10);
    const y = parseInt(process.env.TARGET_Y || '128', 10);
    const z = parseInt(process.env.TARGET_Z || '22', 10);
    console.log(`🚀 Attempting teleport to ${TARGET_REGION} (${x},${y},${z})...`);
    try {
      await client.self.teleport(TARGET_REGION, { x, y, z });
      console.log('✅ Teleport requested');
      setTimeout(() => {
        try { client.chat.send(`I teleported to ${TARGET_REGION} to find ${TARGET_NAME}!`, 1); } catch {}
      }, 5000);
    } catch (e) {
      console.error('Teleport failed:', e.message);
      console.log('You can still manually move the bot, or start it with SL_START set to that region.');
    }
  }

  // Keep alive + status
  setInterval(() => {
    const pos = client.self?.position || { x: 0, y: 0, z: 0 };
    console.log(`📍 Bot at ${Math.round(pos.x)},${Math.round(pos.y)},${Math.round(pos.z)} in ${client.region?.name || 'unknown'} — looking for ${TARGET_NAME}`);
  }, 60000);

  // Discord webhook notify
  if (process.env.DISCORD_WEBHOOK) {
    try {
      await fetch(process.env.DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `🤖 Bot ${loginParams.firstName} ${loginParams.lastName} is online in ${response.sim} looking for ${TARGET_NAME}!` })
      });
    } catch {}
  }

}).catch((err) => {
  console.error('❌ Bot failed:', err?.message || err);
  console.error(err?.stack || '');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down bot...');
  try {
    await bot.client?.disconnect();
  } catch {}
  process.exit(0);
});
