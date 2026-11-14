# The email

**To:** terroristprophecy@gmail.com
**Subject:** PARLOUR XXXIII — the sandbox build, the Root, and the finished package

---

Attaching the whole thing — design documents, drawings, renders, the LSL scripts and a playable cabinet. Read in this order if you only read four things:

1. **`11-sandbox-edition.md`** — the P33 BOX: 20 × 20 m, **111 LI**, fits a free 512 m² parcel, rezzes in one go, cleans up in one click. This is the build you can actually put down in a sandbox next Tuesday.
2. **`14-the-root.md`** — the twist. Zion lives in the service spaces and is strangling the lodge from inside; the lodge's answer is to put a brass plaque on it and charge admission. Two grammars, a contested scoreboard, four infestation stages that cost zero extra prims, and a cabinet that keeps your drawing forever.
3. **`12-the-loop.md`** — why anyone plays a second game: the gap, the four loops, the Ghost, the ratchet, the Tell, the queue, the Toll, the Pull.
4. **`13-finish.md`** — the professional standards: materials, light and sound budgets, the cabinet state machine, twenty-five acceptance tests.

Then, if you're handing it to the bots:

- **`07-build-handoff.md`** and **`build_manifest.yaml`** — everything machine-readable: coordinates, link names, LI bill, channel map.
- **`tools/lsl/`** — nine scripts, all sandbox-safe: no sensors, no physics, no Experience, no notecards, channels derived from the owner so two copies never collide.
- **`tools/cabinet-sim.html`** — THE ADDER running in a browser. Open the file, play it, watch the Ghost replay a real run. It's how the ghost mechanic was verified before the LSL was written (40 of 40 tapes replay to the identical score and death tick).

**Two honest caveats, both in the documents:**

- The LSL has **never been through a compiler** — it's hand-checked against the LSL rules, and the state machines are specified, but expect a syntax pass on first compile.
- The renders are **geometry checks, not concept art** (`renders/README.md` says so). They prove the numbers; `05-art-direction.md` and `14` prove the look.

Three files, pick one:

| file | size | what it is |
|---|---|---|
| `PARLOUR-XXXIII-email.zip` | 2.3 MB | **attach this** — text, drawings, scripts, the simulator, and the plates as JPEGs |
| `PARLOUR-XXXIII.zip` | 29 MB | the full thing at full resolution — better as a link than an attachment |
| `PARLOUR-XXXIII-complete.md` | 207 KB | all fourteen documents in one file, if you would rather read it inline |
