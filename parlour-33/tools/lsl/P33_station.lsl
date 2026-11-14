// =====================================================================
//  PARLOUR XXXIII  ·  P33_station.lsl
//  One of the 33 brass plaques.  Put this in the plaque itself.
//
//  A stamp, a degree, a whisper. The plaque remembers *you* — light it
//  for the guest who has it, keep it dark for everyone else.
//
//  Degree number comes from linkset data "DEG" if it is set, otherwise
//  from the last two digits of the object name: P33_L2_DEG_11 -> 11.
//
//  1 script.  0 listeners.  0 timers.
// =====================================================================


// ---- channels ------------------------------------------------------
// Derived from the owner, never fixed: a sandbox is full of other
// people's scripts on every negative channel already.
integer chan(integer base)
{
    return -(base + (integer)("0x" + llGetSubString((string)llGetOwner(), 0, 5)));
}

integer CH_LEDGER_BASE = 3303;

vector BRASS   = <0.788, 0.635, 0.290>;
vector CYAN    = <0.137, 0.898, 0.831>;

integer deg = 0;

// the 33 whispers — index by degree, keep them short
list WHISPERS = [
    "The water is 2.1 metres. We measured.",
    "The ice remembers every blade.",
    "That machine is older than your account.",
    "Do not look up on the west stair.",
    "The pinsetters have names.",
    "The House is one point ahead.",
    "Nothing here is for sale except the games.",
    "If a machine asks your name, give it another one.",
    "The 34th door is not locked.",
    "Do not thank the Croupier.",
    "Somebody is winning.",
    "You are being watched by eleven holes.",
    "We have your initials already.",
    "The Bell is wrong on purpose.",
    "The carpet has 33 motifs and one of them is you.",
    "There is a chair in the pump room.",
    "One of the drawers in the Hive is empty.",
    "The Hare is always a degree ahead.",
    "Somebody has already played this hour.",
    "Leave by the door you came in.",
    "The Widow has never finished hole 11.",
    "Two brothers, one guest.",
    "The second Bell is not connected.",
    "The archive is 1.2 metres high.",
    "The 1937 ledger has one line in it.",
    "There is a room above the shopfront.",
    "You are early. The Bell is not ready for you.",
    "The kart in the infield is never driven.",
    "Every score after midnight is one lower.",
    "The Croupier deals at the third hour.",
    "Somebody has to be the House.",
    "Thirty-three is not the last number.",
    "Again?"
];

// =====================================================================

light(integer on)
{
    if (on)
        llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLOW, ALL_SIDES, 0.45, PRIM_COLOR, ALL_SIDES, CYAN, 1.0]);
    else
        llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLOW, ALL_SIDES, 0.0, PRIM_COLOR, ALL_SIDES, BRASS, 1.0]);
}

whisper(key who)
{
    integer i = deg - 1;
    if (i < 0 || i >= llGetListLength(WHISPERS)) i = 0;
    llRegionSayTo(who, 0, llList2String(WHISPERS, i));
}

// =====================================================================

default
{
    state_entry()
    {
        string d = llLinksetDataRead("DEG");
        if (d == "") {
            string nm = llGetObjectName();
            d = llGetSubString(nm, -2, -1);
        }
        deg = (integer)d;
        if (deg < 1 || deg > 33) deg = 1;
        llSetText("XXXIII\n" + (string)deg, BRASS, 0.9);
        light(FALSE);
    }

    touch_start(integer num)
    {
        key who = llDetectedKey(0);
        string mine = llLinksetDataRead("S|" + (string)who);

        if (mine == "") {
            llLinksetDataWrite("S|" + (string)who, "1");
            llRegionSay(chan(CH_LEDGER_BASE), "STAMP|" + (string)who + "|" + (string)deg);
            llPlaySound("P33_STAMP", 0.8);
            whisper(who);
        } else {
            llRegionSayTo(who, 0, "Already yours. The House does not count twice.");
        }

        light(TRUE);
        llSetTimerEvent(3.0);
    }

    timer()
    {
        llSetTimerEvent(0.0);
        light(FALSE);
    }

    on_rez(integer p) { llResetScript(); }
}
