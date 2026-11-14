// =====================================================================
//  PARLOUR XXXIII  ·  P33_ledger.lsl
//  THE LEDGER.  The book at the Hive (B1, x 120, z 145).
//
//  Every visitor is written down, by UUID. 33 degrees, one bit each.
//  No attachment, no HUD, no inventory clutter: the House remembers you.
//  Persistence is linkset data on this one prim — one short string per
//  guest, good for tens of thousands of visitors.
//
//  1 script.  1 listener.  0 timers.
// =====================================================================

integer CH_LEDGER = -3303;   // stations -> ledger
integer CH_CARD   = -3304;   // ledger -> avatar

vector BRASS   = <0.788, 0.635, 0.290>;
vector CYAN    = <0.137, 0.898, 0.831>;

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

say_card(key who)
{
    string mask = degrees_of(who);
    integer c = count_bits(mask);
    string nm = llGetDisplayName(who);
    if (nm == "") nm = llKey2Name(who);
    string line;
    if (c == 0)      line = "THE HOUSE DOES NOT HAVE YOU YET.";
    else if (c < 33) line = "THE HOUSE HAS " + (string)c + " OF YOUR 33 DEGREES.";
    else             line = "THIRTY-THREE. THE LAMP ON THE 34TH IS WHITE.";
    llRegionSayTo(who, CH_CARD, "P33|CARD|" + nm + "|" + (string)c + "|" + mask + "|" + line);
    llRegionSayTo(who, 0, line);
}

// =====================================================================

default
{
    state_entry()
    {
        llListen(CH_LEDGER, "", NULL_KEY, "");
        llSetText("THE LEDGER\n\n  every guest is in the book\n  touch to be read", BRASS, 1.0);
    }

    listen(integer chan, string name, key id, string msg)
    {
        // STAMP|<uuid>|<degree 1..33>
        list p = llParseStringKeepNulls(msg, ["|"], []);
        if (llGetListLength(p) < 3) return;
        if (llList2String(p, 0) != "STAMP") return;

        key who = (key)llList2String(p, 1);
        integer n = (integer)llList2String(p, 2);
        if (n < 1 || n > 33) return;

        integer mask = (integer)degrees_of(who);
        integer had = count_bits((string)mask);
        integer bit = 1 << (n - 1);

        if (!(mask & bit)) {
            mask = mask | bit;
            llLinksetDataWrite("D|" + (string)who, (string)mask);
            integer now = count_bits((string)mask);
            if (now == 33) {
                llRegionSay(CH_CARD, "P33|THIRTYTHREE|" + (string)who);
                llRegionSayTo(who, 0, "THE HOUSE HAS ALL OF YOU. THE LAMP ON THE 34TH IS WHITE.");
            } else if (now > had) {
                llRegionSayTo(who, 0, "DEGREE " + (string)now + " OF 33.");
            }
        } else {
            llRegionSayTo(who, 0, "Already yours. The House does not count twice.");
        }
    }

    touch_start(integer num)
    {
        integer i;
        for (i = 0; i < num; i += 1) say_card(llDetectedKey(i));
    }
}
