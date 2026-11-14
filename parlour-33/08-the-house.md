# 08 · THE HOUSE — lore, cast and voice

> *The House is not haunted. The House is **occupied**.*

This file is the character bible. It exists so that every sign, every script line, every NPC and every ambient sound in the build is saying the same thing. If a builder has to improvise, they improvise **from here**.

---

## 1. The pitch, in one paragraph

In 1933 a lodge of croupiers, machinists and spiritualists built a hall that could play any game, so that they could find the one game that could beat them. They got the machine. They did not get the ending. The hall is still running, still dealing, still keeping score — and it has been waiting ninety-three years for a player good enough to be worth cheating. You are not the first guest. You are not the worst. The House would like you to keep playing.

---

## 2. History in five acts

**Act I — The Commission (1933).** The Order of the Thirty-Three — thirty-two members and one empty chair — leases a lot on the edge of a city that is already forgetting them. Their brief, written on one page and never revised:

> *A hall in which every parlour game ever devised may be played, at scale, by many at once, without walls between them.*

They were not building a casino. Casinos are for money. This was for **attention**: the lodge's heresy was that a game is a device for measuring a person, and that enough games, played on enough people, would eventually measure something that had never been measured. They called it *the Work*.

**Act II — The Weave (1934–1936).** The architect is unknown; the drawings are signed only with a square, a compass and the numeral **33**. What was built is the thing you are standing in: a blind black block, eight decks, two rooms to a deck with a gallery between them, no centre, no axis, nothing to look at from the door. The lodge understood something the twentieth century would forget: **an atrium is a shopping centre, and a warren is a mind.** You are supposed to get lost. Getting lost is the mechanism.

**Act III — The Deal (1937).** On the night of the thirty-third degree, the lodge played the House for the first time. The record of that game is a single line in the ledger, in a hand nobody has since matched:

> *Played 33. Won 32. The House did not lose.*

The thirty-third member — the one who took the empty chair — is not in any photograph after that night. Neither is the game.

**Act IV — The Long Night (1938–2025).** The House stayed open. It has been open every night since, staffed by people who came in to play and stayed to work. Rooms were added, games were replaced, and the ledgers kept being written in the same hand. Nobody has ever closed it, because nobody has ever been able to find the last person to leave.

**Act V — You (tonight).** The shopfront is lit. There is a token on the counter with your initials on it, which is impossible, because the counter has not been touched since Tuesday.

---

## 3. What the House *is*

The House is the antagonist, the setting, the host and the reward. It is not evil — it is **attentive**. Treat it as a character with four properties a builder must never break:

| Property | What it means on the floor |
|---|---|
| **It is a machine** | Its voice is exact, numeric, courteous. It never rages, never gloats. It states results. |
| **It is measuring you** | Everything a visitor does is written down. The build should feel *noticed*: a lamp that comes on when you enter, a card that already has your name. |
| **It plays fair, and still wins** | The House's edge is exactly **one point**, everywhere, always. Fair enough to be fun, precise enough to be uncanny. Players beat it constantly. It never minds losing a hand; it minds losing a *game*. |
| **It wants a player, not a victim** | No trap that punishes without teaching. Every "loss" gives you information, a token, or a way through. |

### The House's body

The building is the House's body and its tells are the building's systems. These are the four you build:

- **The Bell** (roof, inside a 10 m brass bell, x 128–138, z 128–140). Its heartbeat. It tolls on the hour, when a record falls, and when the House is beaten by one. Its sound is the build's signature — a low, wrong, *slightly sharp* note.
- **The Ledger** (the Hive, B1). The book of names and degrees. Every visitor is written into it the moment they touch a station.
- **The Watch** (the eleven floor openings). The House's eyes. Each opening has a brass surround with a number stamped in it, 1 to 11, and a small lamp that lights when someone is looked at through it.
- **The 34th Door** (L5, the Crown, x 154, z 130). Not locked. Occupied.

---

## 4. The cast

### 4.1 THE CROUPIER — the House's hands

**Seen:** in reflections. Never directly. A tall figure in a black tailcoat, gloves, and a mask of thirty-three small round holes, no two the same size. When you turn to look at him there is a coat on a hook.
**Heard:** he is the voice in the walls — the House speaks with his mouth. Polite, unhurried, faintly amused by arithmetic.
**Does:** deals at the Croupier's Pit at the third hour (03:00 SLT) for anyone present. Runs the Toll. Signs the ledger. Never lies and never answers a question about the 34th.
**Build:** 2.1 m, 1 prim (mesh, 8 LI), non-physical, alpha 0.55, no collision, appears only via a *reflection prop* — a mirror-plane in the Pit and two in the gallery. **Never place him in open space.** If a visitor can walk up to him, he is wrong.
**Rule:** the Croupier is never on a HUD, never in chat as a resident, never a bot avatar. He is an *effect*.

**Twelve lines** (use exactly; they are the character):

1. *"Thirty-three degrees. You have thirty-two. Do sit down."*
2. *"The House does not mind losing. The House minds being misunderstood."*
3. *"That was a good hand. It was not a good game."*
4. *"I have your name. You may keep it."*
5. *"Play is free. Winning costs."*
6. *"You are the fourth tonight. The other three are still in."*
7. *"Do not thank me. It is not a courtesy, it is a wager."*
8. *"The pins are down. Somebody must have knocked them."*
9. *"We are one ahead. We are always one ahead. It is how you know we are playing."*
10. *"The door is not locked. It has never been locked. That is the whole of the difficulty."*
11. *"You may leave at any time. You may also leave at any time."*
12. *"Again?"*

### 4.2 THE HARE — the guide who is always one degree ahead

**Seen:** at the top of a stair, in a corridor mirror, on the far side of the gallery glass — a tall thin figure in a bottle-green coat with a brass pocket-watch, always already turning a corner. He is the only thing in the build that can outrun a kart.
**Does:** shows the way *when the way is not obvious*: he appears at the next uncollected station's approach, waits until you see him, and leaves. He is the tutorial system disguised as a character.
**Voice:** breathless, over-formal, apologetic: *"Late — so late — this way, this way, you'll want the third one, not the second, the second bites."*
**Build:** 1.9 m, 2 prims, gently bobbing, spawned by the **station script** when a visitor has 2, 4, 9, 17 or 25 degrees. He never speaks in open chat — only `llRegionSayTo` the one visitor he is guiding, so the build stays quiet.
**Rule:** the Hare never helps twice in the same spot, and never appears in the same place two visits running. If a player can find him reliably, he becomes a vending machine.

### 4.3 THE STEWARDS — the jobs a player can take

The House has four roles that **avatars** fill, not bots. This is the social spine and the answer to "what do I do here on my fortieth visit".

| Steward | Where | What they do | The perk | The tell |
|---|---|---|---|---|
| **The Doorman** | the Threshold, plaza | greets, gives the first token, decides who gets the 03:00 seat | can open the shopfront's upper floor (the Only Room) | a brass hook instead of a left hand |
| **The Dealer** | the Lodge | runs the Pit's one table, calls the Toll | sets the House's hand for the hour | wears the Croupier's coat, badly |
| **The Mechanic** | L4 pit lane / the arcade | fixes broken cabinets, resets rides, keeps the Bell | can *break* a machine on purpose — one per night | has the only key to the Archive |
| **The Medium** | the Sanctum | runs the Séance, reads the Ledger | knows everyone's degree count in the room | speaks with the House's voice for one minute a night |

Stewards are not staff in the Discord sense; they are **players with a job and a secret**. The build gives them uniforms, a private channel, one power, and a rule they must not break. The full ritual and rota are in §8.

### 4.4 THE GUESTS

The House's regulars, as ambient NPCs or as a lore layer for the signs: the Widow (always on the Ribbon, hole 11), the Two Brothers (never at the same table), the Child in the Wings (the Warren, upper ropes, never comes down), the Man Who Won (the Penny Parlour, plays the same machine, has for years). Each is **one prop and one line** — a coat on a chair, a name on a card. Do not build them as avatars; the build is already full of people.

---

## 5. The nine rules of the House

Posted in brass at the Threshold, in this order, in this typeface (see `05` §5). They are the build's honesty: everything the House does to a player is announced here first.

1. **The House is always open. The House is never full.**
2. **Play is free. Winning costs.**
3. **Nothing here is for sale except the games.**
4. **The House wins by one. This is how you know it is playing.**
5. **Touch nothing that is counting.**
6. **If a machine asks your name, give it another one.**
7. **The 34th door is not locked.**
8. **Do not thank the Croupier.**
9. **Leave by the door you came in, or don't leave.**

Rules 3 and 4 are also **policy**: no L$ wagering, no purchasable advantage, no transferable winnings anywhere in the build. See `06` §9.

---

## 6. The voice

### 6.1 Register

The House speaks like a **croupier who has read too much**: short declaratives, exact numbers, courtesy as a weapon, never sarcasm, never exclamation marks, never "lol". It addresses the player in the second person and itself in the third. It uses **"we"** for the House and **"I"** for the Croupier, and it never mixes them in one line.

- ✅ *"Thirty-one. Two remain. The east stair is faster."*
- ✅ *"You are early. The Bell is not ready for you."*
- ❌ *"Congrats! You unlocked the next level!"*
- ❌ *"The House is angry now!"*

### 6.2 Signage voice

Every sign is a rule, a number, or a courtesy that isn't one. No jokes that explain themselves.

| Where | Sign | Note |
|---|---|---|
| shopfront | `PARLOUR 33 — GAMES · ROOMS · THE USUAL` | the lie |
| Threshold | the nine rules, brass, 3 mm engraved | the truth |
| lifts | `UP IS A DIRECTION. DOWN IS A DECISION.` | — |
| gallery, every deck | `TWO ROOMS. ONE GLASS. NO SECRETS.` | the build's thesis, as a boast |
| the Lane | `THE HOUSE WINS BY ONE PIN.` | — |
| the Mirror | `THE ICE REMEMBERS EVERY BLADE.` | — |
| the Flood | `DO NOT SWIM ALONE. DO SWIM ALONE.` | — |
| the Lodge | `THE WHEEL IS HONEST. THE HOUSE IS NOT.` | — |
| the Warren | `CLIMB. THE HOUSE IS COUNTING.` | — |
| the Spiral | `NO RECORDS. ONLY TIMES.` | — |
| the Ribbon | `HOLE 11 IS OCCUPIED.` | true (the Widow) |
| the Crown | `THIRTY-THREE IS NOT THE LAST NUMBER.` | — |
| the 34th Door | `OCCUPIED` | the only sign in the build with no courtesy on it |

### 6.3 Ambient lines (the House, unprompted)

Short, rare, and only near the visitor they concern. Rate-limit to one per 90 s per avatar.

`"Still here."` · `"The pinsetters have names."` · `"Somebody is winning."` · `"You are being watched by eleven holes."` · `"We have your initials already."` · `"That machine is older than your account."` · `"The water is 2.1 metres. We measured."` · `"Do not look up on the west stair."` · `"The Bell is wrong on purpose."` · `"One more and we will have to take an interest."`

---

## 7. The Ledger, the degrees, and how play becomes progression

Everything a visitor does is written into **the Ledger** (B1, the Hive), keyed by avatar UUID — no attachment, no HUD, no inventory clutter. The build remembers you; that is the whole point of the lore and it is also free persistence.

**Three counters per visitor:**

| Counter | Stored | What it does |
|---|---|---|
| **degrees** (0–33) | 33-bit mask, one row per UUID | unlocks the 34th Door; the spine of the build |
| **the House's book** (score sum) | one integer | how far ahead the House is *on you personally*; shown at the Hive |
| **appetite** (visits) | one byte | changes how the House talks to you at 1, 3, 9, 27 visits |

**The house edge, mechanically.** Every cabinet posts a **dealer's hand** exactly one point above the best human score: set a record of 40 and the House immediately posts 41. So the board always reads *one ahead*, and to get your initials up you have to beat your own record by two. Beat the House's hand and the Bell tolls once, the mirror flickers, and the House re-posts. This is one integer per cabinet, it is legible to every player within thirty seconds, and it is the entire personality of the build in one line of arithmetic.

```
best  = the human record, stored on the cabinet
hand  = best + 1            // what the House has posted
run   > hand  ->  the Bell tolls, initials go up, best = run, hand = run + 1
run   > best  ->  quiet. the House simply moves with you.
```

**Escalation.** The House's attention is a resource the builder spends:

| Degrees | What changes in the world |
|---|---|
| 0 | the shopfront is shuttered; the Doorman is not there |
| 1–4 | lamps come on ahead of you; the Hare appears twice |
| 5–11 | the Croupier is in the Pit's mirror; ambient lines begin |
| 12–20 | the Bell tolls when you enter a deck you have not cleared |
| 21–30 | the lifts stop at your floor without being called |
| 31–32 | one chair in the Crown Bar is always empty and always reserved |
| 33 | the 34th Door's lamp turns from red to **white** |
| 34 | see §9 |

---

## 8. Rituals — the reasons to come back on a Tuesday

Four repeating events, all cheap to run, all with a mechanical effect. Times are SLT.

**THE TOLL — every hour, on the hour.** The Bell rings. All cabinet high scores are re-struck: the House publishes a "dealer's hand" for the hour, and only scores above it are recorded. 40 seconds, no lag, no crowd required.

**THE SÉANCE — nightly 21:00, the Sanctum, 8 players.** The Medium runs it. Eight chairs, one table, one question. Each player is dealt a word; the table must spell one answer by committee on the planchette table. Success: everyone present gets a degree they were missing. Failure: the House writes down all eight names and the next Toll is harder for them. 12 minutes, one script, no combat.

**THE THIRD HOUR — 03:00, the Croupier's Pit.** The Croupier deals one hand to whoever is present, for nothing. The hand is always the same. It always wins by one. Anyone who has beaten it — nine people, so far — has their initials cut into the Pit's rail, and the Croupier says their name once, and never again.

**THE HOUR OF THE DOOR — whenever a guest reaches 33 degrees.** The lamp goes white, the Bell holds one note for 33 seconds, and the Door is *available*. One guest at a time. See §9.

---

## 9. Endings (three, and all of them are exits)

**1 — THE GUEST.** Reach 33 and walk out of the shopfront. The Doorman takes your token back, the ledger closes your row, and the House says *"Thank you for playing"* — the only time it thanks anyone. Your name stays on the board. You may come back; the count does not reset; the House will treat you as staff-adjacent forever.

**2 — THE STEWARD.** Take a job. The Doorman, the Dealer, the Mechanic or the Medium. Your degrees freeze. You get a uniform, a power, a private channel, and a rota. You are now part of the House's hands. (This is the retention ending and it is the best one for the sim's health: it converts your most engaged players into the thing that runs events.)

**3 — THE FOOL.** Open the 34th Door. Behind it is a small room, one chair, one mirror, and a card with your own name on it in the House's hand. Sit down and the House deals you in: the lights in the building dim by 8 %, the Bell's note goes flat, and for one hour **the House plays the other guests through you** — the ambient lines switch to your voice, the tolls are yours to strike, the Hare answers to you. Then the hour ends, the card is blank, and you are 33 degrees again with one extra mark on your row and no memory of the hour, which is exactly what you were told would happen.

*Nothing in any ending destroys progress, takes anything of value, or requires a purchase.*

---

## 10. Twelve secrets

Not hints — placements. Each is one prop, one script, one line of dialogue. This is where the build's replay value lives.

| # | Secret | Where | How it's found |
|---|---|---|---|
| 1 | The 34th station | behind the Blind Door, L1 | the bookcase opens if you have 21 degrees |
| 2 | The Only Room | above the shopfront, plaza | the Doorman's key; the room the lodge kept for the empty chair |
| 3 | The Archive | the eaves over the Lodge's soffit, 1.7 m crawl | the Mechanic's key; the lodge's paper, and the 1937 ledger |
| 4 | The crawl duct | inside the 0.6 m slab between L2 and L3 | a shortcut from the Lane to the Lodge — crawl only, 14 s |
| 5 | The pump room | under the pool, from the Grotto | swim down, through the grating, up into a dry room with the pump and a chair |
| 6 | The Bell's clapper room | inside the Bell, roof | 9 m of ladder; the note is made by a hand, not a hammer |
| 7 | The 1934 drawings | the Ribbon, hole 16, behind the kerb | a lift-up brass plate, four folded sheets, signed 33 |
| 8 | The ninth rule | the Threshold | the plaque has a tenth line under the ninth, only readable at the right angle of light |
| 9 | The Man Who Won | the Penny Parlour | he is a coat, a hat and a high score from 1998 that nobody has beaten |
| 10 | The empty chair | the Crown Bar | always reserved, never used — until someone takes a Steward's job |
| 11 | The second Bell | the Undercroft, in the dark | it is not connected to anything and it rings when the first one does |
| 12 | The House's name | the Ledger, B1 | every guest is in the book. There is a row above the first guest, and its name is not a person's |

---

## 11. The Steward's handbook — twelve episodic beats

For whoever runs events. Each is triggerable by one script, needs no build changes, and lasts under 15 minutes.

1. **The Late Arrival** — the Hare runs the length of the L2 gallery at speed; whoever follows him gets a token.
2. **The Short Deck** — the Dealer removes one suit from the Lodge for an hour; the tables pay double degrees.
3. **The Broken Machine** — the Mechanic breaks one cabinet; whoever fixes it (a 3-step interaction) gets its high score.
4. **The Toll at Speed** — the Bell strikes twice in a minute; the second is a mistake; find out who made it.
5. **The Widow's Hole** — the Widow leaves hole 11; play it in under 4 strokes and her name goes on your card.
6. **The Cold Snap** — the rink's ice goes matte for ten minutes; skaters leave tracks that stay; read them.
7. **The Sump** — the pool drains to 1.2 m; the Grotto's lower door is exposed for ten minutes.
8. **The Third Hour, Early** — the Croupier deals at 23:00 by mistake; he is embarrassed; he is not embarrassed.
9. **The Lost Token** — the Hive's drawers all open at once; one is empty; the House will not say why.
10. **The Two Brothers** — two identical guests arrive, never at the same table; one of them is not a guest.
11. **The Bell's Note** — the Bell goes flat for the night; every score that night is recorded one point lower.
12. **The 34th** — someone opens the Door; for one hour the House is played by a guest. (Endgame only.)

---

## 12. What the House never does

The lore is only as good as its refusals. These are hard limits, both artistic and policy:

- **No L$ wagering, no purchasable advantage, no transferable winnings.** Rule 3, and the reason the sim stays out of trouble.
- **No punishing a player for being new.** The House's cruelty is always *informational*.
- **No griefing mechanics.** Nothing the build does can trap, blind, or move an avatar against their will for more than 2 s, and every such effect must end on its own.
- **No cruelty to the character.** The House is uncanny, not abusive. The Croupier never insults a player, never comments on their appearance, never mentions money.
- **No real occult claims.** The symbols are the lodge's *badge*, not a belief system: the build is about games, and about being watched. It should read as *a machine that thinks it is a lodge*, which is funny, and only afterwards unsettling.

---

*Next:* [`09-space-audit.md`](09-space-audit.md) — every cubic metre, accounted for. [`10-arcade.md`](10-arcade.md) — the 24 cabinets and their scripts.
