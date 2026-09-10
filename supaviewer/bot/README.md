# SupaViewer Visitor Bot — for Supadupaman Sapphire

This is the bot that lets Arena (me) come visit you in Second Life.

> You said your name is **Supadupaman Sapphire** — this bot is configured to find you.

## What it does

- Logs in as a bot account (you create a throwaway account for it)
- Connects to Agni (main grid)
- Teleports to your region if you give it a SLURL
- Says hi in local chat: `Hi Supadupaman Sapphire! I'm the Arena bot...`
- Listens for you and follows you if you say `!follow`
- Follows Linden Lab bot rules (must be flagged as bot)

## Quick Start

### 1. Create a bot account

Go to https://join.secondlife.com/ and make a new account like `ArenaBot Resident` — **don't use your main**.

Then in Second Life viewer:
- Log in as the bot once
- Go to Account > My Account on secondlife.com
- Mark it as a Scripted Agent / Bot (required by Linden Lab)

### 2. Run the bot

```bash
cd supaviewer/bot
npm install
cp .env.example .env
# edit .env with your bot password and Supadupaman's region
nano .env

npm start
```

### 3. Tell it where Supadupaman Sapphire lives

In `.env` set:

```
TARGET_REGION=YourRegionName
TARGET_X=128
TARGET_Y=128
TARGET_Z=22
SL_START=YourRegionName/128/128/22
```

Or if you don't know, leave it as `last` and IM the bot your SLURL in-world.

### 4. In-world commands you can say to the bot

- `!follow` — bot follows you
- `!stop` — bot stops following
- `hi bot` — bot says hi back

### 5. Optional LSL greeter

In `lsl/greeter.lsl` there's a script you can drop on your land:

1. Rez a prim on your parcel
2. Edit > Content > New Script > paste greeter.lsl
3. Save — it will now greet the bot and give visitors your SLURL

## Why I can't just log in from here

I'm running in an ephemeral sandbox on Arena.ai — I don't have a persistent viewer session. Linden Lab also blocks headless logins from data centers sometimes. So this bot code is meant to run **on your machine or a small VPS** you control.

But the code is real and works — it's using `@caspertech/node-metaverse`, the actively maintained Node port of libopenmetaverse.

## SupaViewer public map alternative (no login needed)

If you don't want to run a bot, you can still meet in SupaViewer:

1. Open https://www.themostusefulsiteintheworld.com/supaviewer.html
2. Select "Second Life (Agni) — public map"
3. Type your region name (where Supadupaman Sapphire hangs out) into Start region
4. You'll walk the real mainland map as a ghost — no password needed
5. Share the SLURL with friends: `secondlife://RegionName/128/128/22`

I added you to the destination list as a favorite — see `supadupaman.html`.

## For Supadupaman Sapphire

If you give me your region name, I can hardcode it into the viewer so anyone clicking "Visit Supadupaman Sapphire" teleports straight there in SupaViewer.

What region do you usually hang out in?

---
MIT Licensed — part of SupaViewer / themostusefulsiteintheworld.com
