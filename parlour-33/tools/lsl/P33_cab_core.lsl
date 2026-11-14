// =====================================================================
//  PARLOUR XXXIII  ·  P33_cab_core.lsl
//  Link 1 (root) of every arcade cabinet.  See tools/lsl/README.md
//
//  Owns: the five pads, the marquee, the credit, the House's hand,
//        the high score, and the hand-off to the House's book.
//  Never touches a sprite.  Never contains a game.
//
//  1 script.  0 listeners.  0 sensors.  1 timer, and only when busy.
// =====================================================================

// ---- input ---------------------------------------------------------
integer IN_UP    = 1;
integer IN_DOWN  = 2;
integer IN_LEFT  = 3;
integer IN_RIGHT = 4;
integer IN_FIRE  = 5;
integer IN_START = 6;

// ---- link messages -------------------------------------------------
integer MSG_START = 100;   // core -> game
integer MSG_OVER  = 101;   // game -> core, str = score
integer MSG_SCORE = 102;   // game -> core, str = score, or "!text" for the marquee
integer MSG_STOP  = 103;   // core -> game
integer MSG_READY = 104;   // game -> core, str = title
integer MSG_BEAT  = 105;   // game -> core, str = score (player beat the House's hand)
integer MSG_TOLL  = 200;   // the Toll


// ---- channels ------------------------------------------------------
// Derived from the owner, never fixed: a sandbox is full of other
// people's scripts on every negative channel already.
integer chan(integer base)
{
    return -(base + (integer)("0x" + llGetSubString((string)llGetOwner(), 0, 5)));
}

integer CH_BOOK_BASE = 3302;   // the House's book (scoreboard)

// ---- colour --------------------------------------------------------
vector CYAN    = <0.137, 0.898, 0.831>;
vector BRASS   = <0.788, 0.635, 0.290>;
vector MAGENTA = <1.000, 0.180, 0.533>;
vector BONE    = <0.910, 0.882, 0.816>;

// ---- state ---------------------------------------------------------
list   padLinks  = [];
list   padDirs   = [];
integer marqLink = 0;
string  gameTitle = "—";
integer running  = FALSE;
integer best     = 0;
integer hand     = 1;
integer cool     = 0;
key     player   = NULL_KEY;

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

attract()
{
    running = FALSE;
    llSetTimerEvent(0.0);
    set_marq(gameTitle + "  ·  BEST " + (string)best + "  ·  HOUSE " + (string)hand, BRASS);
    llMessageLinked(LINK_SET, MSG_STOP, "", NULL_KEY);
}

begin(key who)
{
    player  = who;
    running = TRUE;
    cool    = 0;
    set_marq("PLAY  ·  " + who_name(who), CYAN);
    llMessageLinked(LINK_SET, MSG_START, (string)who, who);
}

finish(integer score)
{
    integer oldHand = hand;
    if (score > best) best = score;
    hand = best + 1;
    llLinksetDataWrite("BEST", (string)best);

    running = FALSE;
    llMessageLinked(LINK_SET, MSG_STOP, "", NULL_KEY);

    if (score > oldHand) {
        // the player beat what the House had posted
        set_marq("THE HOUSE NOTICES  ·  " + (string)score, MAGENTA);
        llMessageLinked(LINK_SET, MSG_BEAT, (string)score, player);
        llTriggerSound("P33_BELL", 1.0);   // the builder drops the Bell sound in this prim
    } else {
        set_marq("YOU " + (string)score + "  ·  HOUSE " + (string)oldHand, BRASS);
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
        }
        best = (integer)llLinksetDataRead("BEST");
        hand = best + 1;
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

        integer idx = llListFindList(padLinks, [link]);
        if (idx >= 0)
            llMessageLinked(LINK_SET, llList2Integer(padDirs, idx), "", who);
    }

    link_message(integer sender, integer num, string str, key id)
    {
        if (num == MSG_READY) {
            gameTitle = str;
            if (!running) attract();
        }
        else if (num == MSG_SCORE) {
            if (running) {
                if (llGetSubString(str, 0, 0) == "!")
                    set_marq(llGetSubString(str, 1, -1), CYAN);
                else
                    set_marq("SCORE " + str + "  ·  HOUSE " + (string)hand, CYAN);
            }
        }
        else if (num == MSG_OVER) {
            if (running) finish((integer)str);
        }
    }

    timer()
    {
        if (cool > 0) {
            cool -= 1;
            if (cool == 0) attract();
        } else {
            llSetTimerEvent(0.0);
        }
    }

    changed(integer change)
    {
        if (change & CHANGED_LINK) {
            padLinks = [];
            padDirs  = [];
            marqLink = 0;
            integer n = llGetNumberOfPrims();
            integer i;
            for (i = 1; i <= n; i += 1) {
                string nm = llGetLinkName(i);
                integer d = pad_dir(nm);
                if (d > 0) { padLinks += [i]; padDirs += [d]; }
                if (llGetSubString(nm, -4, -1) == "MARQ") marqLink = i;
            }
        }
        if (change & CHANGED_REGION) attract();
    }
}
