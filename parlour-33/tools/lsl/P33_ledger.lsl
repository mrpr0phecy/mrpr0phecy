// =====================================================================
//  PARLOUR XXXIII  ·  P33_ledger.lsl
//  THE LEDGER.  The book at the Hive (B1, x 120, z 145) — and in the
//  Box, just inside the door.
//
//  Every visitor is written down, by UUID. 33 degrees, one bit each.
//  No attachment, no HUD, no inventory clutter: the House remembers you.
//  Persistence is linkset data on this one prim — one short string per
//  guest, good for tens of thousands of visitors.
//
//  Also the build's only analytics: five integers, counted locally,
//  readable by the owner and by nobody else. See 12-the-loop.md §4.
//
//  1 script.  1 listener.  0 timers.
// =====================================================================

// ---- channels ------------------------------------------------------
// Derived from the owner, never fixed: a sandbox is full of other
// people's scripts on every negative channel already.
integer chan(integer base)
{
    return -(base + (integer)("0x" + llGetSubString((string)llGetOwner(), 0, 5)));
}

integer CH_LEDGER_BASE = 3303;   // stations + cabinets -> ledger
integer CH_CARD_BASE   = 3304;   // ledger -> avatar

vector BRASS   = <0.788, 0.635, 0.290>;
vector CYAN    = <0.137, 0.898, 0.831>;
vector BONE    = <0.910, 0.882, 0.816>;

string degrees_of(key who)
{
    string s = llLinksetDataRead("D|" + (string)who);
    if (s == "") return "0";
    return s;
}

integer count_bits(string mask)
{
    integer v = (integer)mask;
    integer c = 0;
    integer i;
    for (i = 0; i < 33; i += 1) {
        if (v & (1 << i)) c += 1;
    }
    return c;
}

integer bump(string key, integer by)
{
    integer v = (integer)llLinksetDataRead(key) + by;
    llLinksetDataWrite(key, (string)v);
    return v;
}

// "visits|last unix time" — never a reward, only a memory
string visit_of(key who)
{
    string s = llLinksetDataRead("V|" + (string)who);
    if (s == "") return "0|0";
    return s;
}

integer note_visit(key who)
{
    list p = llParseStringKeepNulls(visit_of(who), ["|"], []);
    integer visits = (integer)llList2String(p, 0) + 1;
    integer last = (integer)llList2String(p, 1);
    llLinksetDataWrite("V|" + (string)who, (string)visits + "|" + (string)llGetUnixTime());
    return last;
}

string days_since(integer when)
{
    if (when == 0) return "";
    integer d = (llGetUnixTime() - when) / 86400;
    if (d < 1)  return "";
    if (d == 1) return "  ·  one day.";
    return "  ·  " + (string)d + " days.";
}

say_card(key who)
{
    string mask = degrees_of(who);
    integer c = count_bits(mask);

    list v = llParseStringKeepNulls(visit_of(who), ["|"], []);
    integer visits = (integer)llList2String(v, 0);
    integer last = (integer)llList2String(v, 1);

    string line;
    if (c == 0)      line = "THE HOUSE DOES NOT HAVE YOU YET.";
    else if (c < 33) line = "THE HOUSE HAS " + (string)c + " OF YOUR 33 DEGREES.";
    else             line = "THIRTY-THREE. THE LAMP ON THE 34TH IS WHITE.";

    // the streak: noticed, never paid
    string tail = "";
    if (visits >= 30)     tail = "  the House knows your knock.";
    else if (visits >= 7) tail = "  you come back. the House has noticed.";
    else if (visits >= 3) tail = "  third time. it is a habit now.";

    string waited = "";
    if (visits > 1) waited = days_since(last);

    llRegionSayTo(who, chan(CH_CARD_BASE),
        "P33|CARD|" + (string)c + "|" + mask + "|" + line + waited);
    llRegionSayTo(who, 0, line + waited + tail);
}

owner_readout(key who)
{
    llRegionSayTo(who, 0,
        "THE LEDGER  ·  VISITS " + llLinksetDataRead("N_VISIT") +
        "  ·  RUNS " + llLinksetDataRead("N_RUN") +
        "  ·  BEATEN " + llLinksetDataRead("N_BEAT") + "  ·  " +
        "DOORS " + llLinksetDataRead("N_DOOR"));
}

// =====================================================================

default
{
    state_entry()
    {
        llListen(chan(CH_LEDGER_BASE), "", NULL_KEY, "");
        llSetText("THE LEDGER\n\n  every guest is in the book\n  touch to be read", BRASS, 1.0);
    }

    listen(integer ch, string name, key id, string msg)
    {
        list p = llParseStringKeepNulls(msg, ["|"], []);
        integer n = llGetListLength(p);
        if (n < 2) return;

        string head = llList2String(p, 0);

        // COUNT|RUN|<score>  ·  COUNT|BEAT|<score>   (posted by every cabinet)
        if (head == "COUNT") {
            if (llList2String(p, 1) == "RUN") {
                bump("N_RUN", 1);
            } else if (llList2String(p, 1) == "BEAT") {
                bump("N_BEAT", 1);
            }
            return;
        }

        // STAMP|<uuid>|<degree 1..33>
        if (head != "STAMP") return;
        if (n < 3) return;

        key who = (key)llList2String(p, 1);
        integer deg = (integer)llList2String(p, 2);
        if (deg < 1 || deg > 33) return;

        integer mask = (integer)degrees_of(who);
        integer had = count_bits((string)mask);
        integer bit = 1 << (deg - 1);

        if (!(mask & bit)) {
            mask = mask | bit;
            llLinksetDataWrite("D|" + (string)who, (string)mask);
            integer now = count_bits((string)mask);
            if (now > had + 0) {
                if (now == 33) {
                    llRegionSay(chan(CH_CARD_BASE), "P33|THIRTYTHREE|" + (string)who);
                    llRegionSayTo(who, 0, "THE HOUSE HAS ALL OF YOU. THE LAMP ON THE 34TH IS WHITE.");
                } else {
                    llRegionSayTo(who, 0, "DEGREE " + (string)now + " OF 33.");
                }
            }
        } else {
            llRegionSayTo(who, 0, "Already yours. The House does not count twice.");
        }
    }

    touch_start(integer num)
    {
        integer i;
        for (i = 0; i < num; i += 1) {
            key who = llDetectedKey(i);
            if (who == llGetOwner()) {
                owner_readout(who);
                continue;
            }
            integer last = note_visit(who);
            // a first visit counts once, ever
            if (last == 0) bump("N_VISIT", 1);
            say_card(who);
        }
    }
}
