// =====================================================================
//  PARLOUR XXXIII  ·  P33_cab_core.lsl
//  Link 1 (root) of every arcade cabinet.  See tools/lsl/README.md
//
//  Owns: the five pads, the marquee, the credit, the House's hand,
//        the high score, the queue, the Tell, the Toll, the Pull,
//        and the hand-off to the House's book.
//
//  Talks in two voices: the House's (capitals, arithmetic) and,
//  once in eight showings, the Root's (lowercase, shorter, true).
//  Never touches a sprite.  Never contains a game.
//
//  1 script.  0 listeners.  0 sensors.  1 timer (idle: set for the next
//  hour boundary; busy: 0.5 s Tell pulse / 1 s cooldown).
// =====================================================================

// ---- input ---------------------------------------------------------
integer IN_UP    = 1;
integer IN_DOWN  = 2;
integer IN_LEFT  = 3;
integer IN_RIGHT = 4;
integer IN_FIRE  = 5;
integer IN_START = 6;

// ---- link messages -------------------------------------------------
integer MSG_START    = 100;   // core -> game
integer MSG_OVER     = 101;   // game -> core, str = score
integer MSG_SCORE    = 102;   // game -> core, str = score, or "!text"
integer MSG_STOP     = 103;   // core -> game
integer MSG_READY    = 104;   // game -> core, str = title
integer MSG_BEAT     = 105;   // game -> core, str = score
integer MSG_DEMO     = 106;   // core -> game, play the tape
integer MSG_DEMO_END = 107;   // game -> core, tape finished
integer MSG_TOLL     = 200;   // the Toll

// ---- channels ------------------------------------------------------
// Derived from the owner, never fixed: a sandbox is full of other
// people's scripts on every negative channel already.
integer chan(integer base)
{
    return -(base + (integer)("0x" + llGetSubString((string)llGetOwner(), 0, 5)));
}

integer CH_BOOK_BASE   = 3302;   // the House's book (scoreboard + Bell)
integer CH_LEDGER_BASE = 3303;   // counters for the Ledger

// ---- colour --------------------------------------------------------
vector CYAN    = <0.137, 0.898, 0.831>;
vector BRASS   = <0.788, 0.635, 0.290>;
vector MAGENTA = <1.000, 0.180, 0.533>;
vector BONE    = <0.910, 0.882, 0.816>;

// ---- state ---------------------------------------------------------
list    padLinks  = [];
list    padDirs   = [];
integer marqLink  = 0;
integer frameLink = 0;
string  gameTitle = "—";
integer running   = FALSE;
integer best      = 0;
integer raised    = 0;     // times the Toll has raised the House's hand
integer hand      = 1;
integer cool      = 0;
key     player    = NULL_KEY;
key     nextPlayer = NULL_KEY;
integer pulsing   = FALSE;
integer pulseOn   = 0;

// the Root gets the marquee one showing in eight. See 14-the-root.md 5.
list ROOT_LINES = [
    "it's always one. go on.",
    "have you eaten.",
    "they're counting again.",
    "we were here first.",
    "the number isn't real.",
    "don't sign anything.",
    "take the seat. it's warm.",
    "you're doing fine."
];


// =====================================================================
//  helpers
// =====================================================================

integer pad_dir(string nm)
{
    if (llSubStringIndex(nm, "PAD_") < 0) return 0;
    string tail = llGetSubString(nm, -2, -1);
    if (tail == "UP")    return IN_UP;
    if (tail == "WN")    return IN_DOWN;
    if (tail == "FT")    return IN_LEFT;
    if (tail == "HT")    return IN_RIGHT;
    if (tail == "RE")    return IN_FIRE;
    return 0;
}

set_marq(string txt, vector col)
{
    if (marqLink > 1)
        llSetLinkPrimitiveParamsFast(marqLink, [PRIM_TEXT, txt, col, 1.0]);
    else
        llSetText(txt, col, 1.0);
}

string who_name(key k)
{
    string n = llGetDisplayName(k);
    if (n == "") n = llKey2Name(k);
    if (n == "") n = "GUEST";
    return llGetSubString(n, 0, 15);
}

integer head_of_house()
{
    return best + 1 + raised;
}

// ---- the Toll ------------------------------------------------------

arm_idle()
{
    // one timer, set for the next hour boundary. No polling.
    integer s = 3600 - (llGetUnixTime() % 3600);
    if (s < 2) s = 2;
    llSetTimerEvent((float)s);
}

// ---- the Tell ------------------------------------------------------

start_pulse()
{
    if (pulsing) return;
    pulsing = TRUE;
    pulseOn = 0;
    llSetTimerEvent(0.5);
}

stop_pulse()
{
    if (!pulsing) return;
    pulsing = FALSE;
    if (frameLink > 1)
        llSetLinkPrimitiveParamsFast(frameLink, [PRIM_GLOW, ALL_SIDES, 0.02]);
}

// ---- states --------------------------------------------------------

attract()
{
    running = FALSE;
    stop_pulse();

    // the marquee war: seven showings in eight the House, one the Root
    if ((integer)llFrand(8.0) == 0) {
        integer i = (integer)llFrand((float)llGetListLength(ROOT_LINES));
        set_marq(llList2String(ROOT_LINES, i), CYAN);
    } else {
        set_marq(gameTitle + "  ·  BEST " + (string)best + "  ·  HOUSE " + (string)hand, BRASS);
    }

    // the Ghost: if the cabinet has something to show, it shows it.
    // TAPE = a recorded run (the Adder). SIGIL = a judged stroke (the Scribe).
    if (llLinksetDataRead("TAPE") != "" || llLinksetDataRead("SIGIL") != "")
        llMessageLinked(LINK_SET, MSG_DEMO, "", NULL_KEY);
    else
        llMessageLinked(LINK_SET, MSG_STOP, "", NULL_KEY);
    arm_idle();
}

begin(key who)
{
    player  = who;
    running = TRUE;
    cool    = 0;
    stop_pulse();
    set_marq("PLAY  ·  " + who_name(who), CYAN);
    llMessageLinked(LINK_SET, MSG_START, (string)who, who);
}

finish(integer score)
{
    integer oldHand = hand;
    if (score > best) {
        best = score;
        llLinksetDataWrite("BEST", (string)best);
    }
    hand = head_of_house();

    running = FALSE;
    stop_pulse();
    llMessageLinked(LINK_SET, MSG_STOP, "", NULL_KEY);

    if (score > oldHand) {
        // the player beat what the House had posted
        set_marq("THE HOUSE NOTICES  ·  " + (string)score, MAGENTA);
        llMessageLinked(LINK_SET, MSG_BEAT, (string)score, player);
        llTriggerSound("P33_BELL", 1.0);   // drop the Bell sound in this prim
        llRegionSay(chan(CH_LEDGER_BASE), "COUNT|BEAT|" + (string)score);
    } else {
        set_marq("YOU " + (string)score + "  ·  HOUSE " + (string)oldHand, BRASS);
    }
    llRegionSay(chan(CH_LEDGER_BASE), "COUNT|RUN|" + (string)score);

    // ---- the Pull: on this cabinet's 33rd run, the Root takes one back
    integer runs = (integer)llLinksetDataRead("RUNS") + 1;
    llLinksetDataWrite("RUNS", (string)runs);
    if (runs % 33 == 0 && raised > 0) {
        raised -= 1;
        hand = head_of_house();
        llLinksetDataWrite("RAISE", (string)raised);
        set_marq("the root pulled  ·  HOUSE " + (string)hand, CYAN);
        llTriggerSound("P33_pull", 0.8);
    }

    string nm = who_name(player);
    nm = llDumpList2String(llParseStringKeepNulls(nm, ["|"], []), " ");
    llRegionSay(chan(CH_BOOK_BASE), "P33|" + (string)llGetKey() + "|" + (string)score + "|" + nm);

    player = NULL_KEY;
    cool = 5;
    llSetTimerEvent(1.0);
}

// =====================================================================
//  events
// =====================================================================

default
{
    state_entry()
    {
        integer n = llGetNumberOfPrims();
        integer i;
        for (i = 1; i <= n; i += 1) {
            string nm = llGetLinkName(i);
            integer d = pad_dir(nm);
            if (d > 0) { padLinks += [i]; padDirs += [d]; }
            if (llGetSubString(nm, -4, -1) == "MARQ") marqLink = i;
            if (llGetSubString(nm, -5, -1) == "FRAME") frameLink = i;
        }
        best   = (integer)llLinksetDataRead("BEST");
        raised = (integer)llLinksetDataRead("RAISE");
        hand   = head_of_house();
        if (frameLink > 1)
            llSetLinkPrimitiveParamsFast(frameLink, [PRIM_GLOW, ALL_SIDES, 0.02]);
        attract();
    }

    touch_start(integer num)
    {
        integer link = llDetectedLinkNumber(0);
        key who = llDetectedKey(0);

        if (!running) {
            if (cool > 0) return;
            begin(who);
            return;
        }

        // a second toucher joins the queue instead of stealing the game
        if (who != player && nextPlayer == NULL_KEY) {
            nextPlayer = who;
            set_marq(who_name(player) + "  ·  NEXT " + who_name(who), CYAN);
            return;
        }

        integer idx = llListFindList(padLinks, [link]);
        if (idx >= 0)
            llMessageLinked(LINK_SET, llList2Integer(padDirs, idx), "", who);
    }

    link_message(integer sender, integer num, string str, key id)
    {
        if (num == MSG_READY) {
            gameTitle = str;
            if (!running && cool == 0) attract();
        }
        else if (num == MSG_SCORE) {
            if (running) {
                if (llGetSubString(str, 0, 0) == "!") {
                    set_marq(llGetSubString(str, 1, -1), CYAN);
                } else {
                    integer s = (integer)str;
                    set_marq("YOU " + str + "  ·  HOUSE " + (string)hand, CYAN);
                    if (s >= hand - 2) start_pulse();
                }
            }
        }
        else if (num == MSG_OVER) {
            if (running) finish((integer)str);
        }
        else if (num == MSG_DEMO_END) {
            if (running) return;           // a guest sat down mid-showing
            // a breath between showings, or the loop reads as a glitch
            cool = 2;
            llSetTimerEvent(1.0);
        }
    }

    timer()
    {
        // the Tell: a slow magenta breath while the run is close
        if (pulsing && running) {
            pulseOn = !pulseOn;
            if (frameLink > 1)
                llSetLinkPrimitiveParamsFast(frameLink,
                    [PRIM_GLOW, ALL_SIDES, 0.02 + 0.33 * (float)pulseOn]);
            return;
        }

        if (cool > 0) {
            cool -= 1;
            if (cool == 0) {
                if (nextPlayer != NULL_KEY) {
                    key q = nextPlayer;
                    nextPlayer = NULL_KEY;
                    begin(q);
                } else {
                    attract();
                }
            }
            return;
        }

        // ---- the hour: the House raises its hand ----
        raised += 1;
        hand = head_of_house();
        llLinksetDataWrite("RAISE", (string)raised);
        set_marq("THE HOUSE HAS RAISED ITS HAND  ·  " + (string)hand, BRASS);
        cool = 4;
        llSetTimerEvent(1.0);
    }

    changed(integer change)
    {
        if (change & CHANGED_LINK) {
            padLinks = [];
            padDirs  = [];
            marqLink = 0;
            frameLink = 0;
            integer n = llGetNumberOfPrims();
            integer i;
            for (i = 1; i <= n; i += 1) {
                string nm = llGetLinkName(i);
                integer d = pad_dir(nm);
                if (d > 0) { padLinks += [i]; padDirs += [d]; }
                if (llGetSubString(nm, -4, -1) == "MARQ") marqLink = i;
                if (llGetSubString(nm, -5, -1) == "FRAME") frameLink = i;
            }
        }
        if (change & CHANGED_REGION) {
            player = NULL_KEY;
            nextPlayer = NULL_KEY;
            attract();
        }
    }
}
