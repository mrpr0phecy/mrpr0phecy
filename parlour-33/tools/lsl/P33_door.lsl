// =====================================================================
//  PARLOUR XXXIII  ·  P33_door.lsl
//  THE THIRTY-FOURTH DOOR.  08-the-house.md §9, 12-the-loop.md §3.8.
//
//  It says OCCUPIED.  It is not occupied.  It opens for three seconds
//  on the hour, and for the first guest to reach it inside those three
//  seconds — and then not again that day.
//
//  Nothing is behind it. A room with your name on the wall and nothing
//  to do. That is the whole joke, and it is also the reason people come
//  back. It is never sold, never unlocked by spending, never a die roll.
//
//  1 script.  0 listeners.  1 timer.
//  Put this in the door plaque prim. Drop the sound P33_door in root.
// =====================================================================

integer chan(integer base)
{
    return -(base + (integer)("0x" + llGetSubString((string)llGetOwner(), 0, 5)));
}

integer CH_LEDGER_BASE = 3303;

vector BONE    = <0.910, 0.882, 0.816>;
vector MAGENTA = <1.000, 0.180, 0.533>;
vector WHITE   = <0.95, 0.97, 1.0>;

integer openUntil = 0;     // unix time the current window closes
integer openedDay = -1;    // unix day of the last opening
integer doors = 0;
integer poll  = 0;         // window ticks left
string  opener = "";

say(string txt, vector col)
{
    llSetText(txt, col, 1.0);
}

arm_hour()
{
    integer s = 3600 - (llGetUnixTime() % 3600);
    if (s < 2) s = 2;
    llSetTimerEvent((float)s);
}

string hhmmss()
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

closed_text()
{
    string tail = "OCCUPIED";
    if (opener != "") tail = "LAST: " + opener;
    say("THIRTY-FOUR\n\n  " + tail + "\n\n  opens on the hour, for three seconds.", BONE);
}

// =====================================================================

default
{
    state_entry()
    {
        openedDay = (integer)llLinksetDataRead("DAY");
        doors     = (integer)llLinksetDataRead("DOORS");
        closed_text();
        arm_hour();
    }

    timer()
    {
        // ---- inside the three seconds ----
        if (poll > 0) {
            poll -= 1;
            if (poll == 0) {
                openUntil = 0;
                closed_text();
                arm_hour();
            }
            return;
        }

        // ---- the hour ----
        integer now = llGetUnixTime();
        integer day = now / 86400;

        if (openedDay == day) {
            say("THIRTY-FOUR\n\n  OCCUPIED\n\n  it has been opened today.", BONE);
            arm_hour();
            return;
        }

        openUntil = now + 3;
        poll = 12;
        say("THIRTY-FOUR\n\n  OPEN\n\n  " + hhmmss() + "  ·  three seconds.", WHITE);
        llTriggerSound("P33_door", 0.7);
        llSetTimerEvent(0.25);
    }

    touch_start(integer num)
    {
        key who = llDetectedKey(0);
        integer now = llGetUnixTime();
        integer day = now / 86400;

        if (poll == 0 || now > openUntil) {
            llRegionSayTo(who, 0, "Occupied.");
            return;
        }
        if (openedDay == day) {
            llRegionSayTo(who, 0, "Occupied. It opened today, and it opens once.");
            return;
        }

        // ---- the opening ----
        openedDay = day;
        doors += 1;
        llLinksetDataWrite("DAY", (string)day);
        llLinksetDataWrite("DOORS", (string)doors);
        llRegionSay(chan(CH_LEDGER_BASE), "COUNT|DOOR|1");

        string nm = llGetDisplayName(who);
        if (nm == "") nm = llKey2Name(who);
        if (nm == "") nm = "A GUEST";
        opener = llGetSubString(nm, 0, 15);

        llRegionSayTo(who, 0, "THE HOUSE OPENS. Your name is on the wall, " +
                      opener + ". There is nothing to do in there.");
        say("THIRTY-FOUR\n\n  " + opener + "\n\n  " + hhmmss() + "  ·  open.", MAGENTA);
        llTriggerSound("P33_door", 1.0);

        openUntil = 0;
        poll = 12;              // let the glow sit for three seconds
        llSetTimerEvent(0.25);
    }

    changed(integer change)
    {
        if (change & CHANGED_REGION_START) {
            openUntil = 0;
            poll = 0;
            closed_text();
            arm_hour();
        }
    }
}
