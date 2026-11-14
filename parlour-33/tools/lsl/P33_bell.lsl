// =====================================================================
//  PARLOUR XXXIII  ·  P33_bell.lsl
//  THE BELL.  On the roof.  It is the only thing in the build that can
//  be heard from the parcel edge, and it rings for exactly three things:
//  a guest beating the House, the Toll on the hour, and the Hour of the
//  Door at 03:00.
//
//  Drop the sound P33_bell (4.2 s, full perm, mono) into the ROOT prim.
//  Link names: BELL (root), CLAPPER, FRAME (optional).
//
//  1 script.  1 listener.  1 timer.
//  Sandbox-safe: no sensor, no physics, no HTTP, no llRegionSayTo loop.
// =====================================================================

// ---- channels ------------------------------------------------------
integer chan(integer base)
{
    return -(base + (integer)("0x" + llGetSubString((string)llGetOwner(), 0, 5)));
}

integer CH_BOOK_BASE = 3302;   // cabinets post "P33|<key>|<score>|<name>"

vector BRASS   = <0.788, 0.635, 0.290>;
vector MAGENTA = <1.000, 0.180, 0.533>;
vector BONE    = <0.910, 0.882, 0.816>;

// ---- state ---------------------------------------------------------
integer clapLink = 0;
integer frameLink = 0;
integer swinging = 0;      // clapper ticks left
integer swingDir = 1;
integer beaters = 0;       // who rang it today, for the hovertext
integer tolls  = 0;
integer lastBeat = 0;      // unix time of the last ring

// the twelve lines the Bell speaks. index 0..11, chosen by beat count.
list LINES = [
    "THE HOUSE KNEW YOU WOULD.",
    "ONE POINT. THAT IS THE WHOLE GAME.",
    "SOMEBODY HAS BEEN PRACTISING.",
    "THE BELL RINGS FOR THE GUEST, NOT THE HOUSE.",
    "YOU ARE AHEAD. IT WILL NOT LAST.",
    "THAT ONE GOES IN THE BOOK.",
    "THE HOUSE IS NOT ANGRY. THE HOUSE IS INTERESTED.",
    "MIND THE PINS ON YOUR WAY OUT.",
    "THIRTY-THREE DEGREES AND YOU ARE STILL HERE.",
    "THE CLAPPER IS WARM NOW.",
    "THANK YOU. GENUINELY.",
    "AGAIN?"
];

// =====================================================================
//  helpers
// =====================================================================

ring(integer n)
{
    // n = number of clapper strokes. Each stroke is one bell sound.
    swinging = n * 2;
    swingDir = 1;
    llSetTimerEvent(0.16);
    if (clapLink > 1) {
        llSetLinkPrimitiveParamsFast(clapLink, [PRIM_GLOW, ALL_SIDES, 0.45]);
    }
}

stop_ring()
{
    swinging = 0;
    llSetTimerEvent(0.0);
    if (clapLink > 1)
        llSetLinkPrimitiveParamsFast(clapLink, [PRIM_GLOW, ALL_SIDES, 0.0]);
    if (frameLink > 1)
        llSetLinkPrimitiveParamsFast(frameLink, [PRIM_GLOW, ALL_SIDES, 0.05]);
    arm_hour();
}

arm_hour()
{
    // one timer, set for the next hour boundary. No polling.
    integer s = 3600 - (llGetUnixTime() % 3600);
    if (s < 2) s = 2;
    llSetTimerEvent((float)s);
}

say(string txt, vector col)
{
    llSetText(txt, col, 1.0);
}

string hhmm()
{
    integer t = llGetUnixTime() % 86400;
    integer h = t / 3600;
    integer m = (t % 3600) / 60;
    string hs = (string)h;
    string ms = (string)m;
    if (h < 10) hs = "0" + hs;
    if (m < 10) ms = "0" + ms;
    return hs + ":" + ms;
}

idle_text()
{
    say("THE BELL\n\n  " + (string)beaters + " beat the House today\n  " +
        (string)tolls + " Tolls\n  now " + hhmm(), BRASS);
}

// =====================================================================
default
{
    state_entry()
    {
        integer n = llGetNumberOfPrims();
        integer i;
        for (i = 1; i <= n; i += 1) {
            string nm = llGetLinkName(i);
            if (llSubStringIndex(nm, "CLAPPER") >= 0) clapLink = i;
            if (llSubStringIndex(nm, "FRAME") >= 0)   frameLink = i;
        }
        if (clapLink > 1)
            llSetLinkPrimitiveParamsFast(clapLink, [PRIM_GLOW, ALL_SIDES, 0.0]);

        tolls = (integer)llLinksetDataRead("TOLLS");
        beaters = 0;
        idle_text();

        // the cabinet channel: a ring for every guest who beats the House
        llListen(chan(CH_BOOK_BASE), "", NULL_KEY, "");
        arm_hour();
    }

    listen(integer ch, string name, key id, string msg)
    {
        // "P33|<cabinet key>|<score>|<name>" — the cabinets' own book.
        if (llGetSubString(msg, 0, 3) != "P33|") return;
        list p = llParseStringKeepNulls(msg, ["|"], []);
        if (llGetListLength(p) < 3) return;

        integer now = llGetUnixTime();
        if (now - lastBeat < 3) return;   // no machine-gun bells
        lastBeat = now;
        beaters += 1;

        integer score = (integer)llList2String(p, 2);
        string nm = llList2String(p, 3);
        if (nm == "") nm = "A GUEST";

        ring(3);
        say("THE HOUSE NOTICES\n\n  " + nm + "  ·  " + (string)score + "\n\n  " +
            llList2String(LINES, beaters % 12), MAGENTA);
        llLinksetDataWrite("BEATERS", (string)beaters);
    }

    touch_start(integer num)
    {
        key who = llDetectedKey(0);
        if (who != llGetOwner()) {
            llRegionSayTo(who, 0, "The Bell is rung by the House, not by guests.");
            return;
        }
        // owner: a test ring and the numbers
        llRegionSayTo(who, 0, "TOLLS " + (string)tolls + "  ·  TODAY'S BEATERS " +
                      (string)beaters + "  ·  door opens " + hhmm());
        ring(1);
    }

    timer()
    {
        // ---- swinging ----
        if (swinging > 0) {
            if (clapLink > 1) {
                vector p = llList2Vector(llGetLinkPrimitiveParams(clapLink, [PRIM_POS_LOCAL]), 0);
                llSetLinkPrimitiveParamsFast(clapLink, [PRIM_POS_LOCAL, p + <0.0, 0.02 * (float)swingDir, 0.0>]);
            }
            swingDir = -swingDir;
            if (swinging % 2 == 0) llTriggerSound("P33_bell", 1.0);
            swinging -= 1;
            if (swinging == 0) {
                if (clapLink > 1)
                    llSetLinkPrimitiveParamsFast(clapLink, [PRIM_GLOW, ALL_SIDES, 0.0]);
                idle_text();
                arm_hour();
            }
            return;
        }

        // ---- the hour ----
        tolls += 1;
        llLinksetDataWrite("TOLLS", (string)tolls);
        ring(1);

        integer t = llGetUnixTime() % 86400;
        if (t >= 75600 && t < 79200) {              // 21:00 — the Séance
            say("THE SÉANCE\n\n  eight seats, eight silences\n\n  it has begun.", MAGENTA);
            ring(8);
        } else if (t >= 10800 && t < 11160) {       // 03:00 — the Hour of the Door
            say("THE THIRD HOUR\n\n  the door is open for three seconds.\n\n  run.",
                <0.95, 0.97, 1.0>);
            ring(2);
        } else {
            say("THE HOUSE HAS RAISED ITS HAND\n\n  " + hhmm() + "\n\n  it is one further away.",
                BRASS);
        }
    }

    changed(integer change)
    {
        if (change & CHANGED_REGION_START) {
            swinging = 0;
            arm_hour();
            idle_text();
        }
    }
}
