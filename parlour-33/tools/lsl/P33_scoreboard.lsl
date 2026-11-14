// =====================================================================
//  PARLOUR XXXIII  ·  P33_scoreboard.lsl
//  THE HOUSE'S BOOK.  The board in Cabinet Row (L2, x 141, z 154).
//
//  Hears every finished run in the region, keeps the top ten, and
//  strikes the board on the hour — the Toll.
//
//  1 script.  1 listener.  1 timer (20 s).
// =====================================================================

integer CH_BOOK = -3302;
integer MAX_ROWS = 10;

list   rows     = [];       // "score|name|uuid"
integer hourmark = -1;

vector BRASS   = <0.788, 0.635, 0.290>;
vector CYAN    = <0.137, 0.898, 0.831>;
vector MAGENTA = <1.000, 0.180, 0.533>;

string pad2(integer n)
{
    if (n < 10) return "0" + (string)n;
    return (string)n;
}

draw()
{
    integer i;
    string out = "THE HOUSE'S BOOK\n";
    if (llGetListLength(rows) == 0) {
        out += "\n  no hands played yet";
    } else {
        for (i = 0; i < llGetListLength(rows); i += 1) {
            list p = llParseStringKeepNulls(llList2String(rows, i), ["|"], []);
            out += pad2(i + 1) + "  " + llList2String(p, 1) + "   " + llList2String(p, 0) + "\n";
        }
        list top = llParseStringKeepNulls(llList2String(rows, 0), ["|"], []);
        out += "\nHOUSE  " + (string)((integer)llList2String(top, 0) + 1);
    }
    llSetText(out, BRASS, 1.0);
}

insert_row(integer score, string name, string uuid)
{
    string row = (string)score + "|" + name + "|" + uuid;
    integer at = llGetListLength(rows);
    integer i;
    for (i = 0; i < llGetListLength(rows); i += 1) {
        list p = llParseStringKeepNulls(llList2String(rows, i), ["|"], []);
        if (score > (integer)llList2String(p, 0)) { at = i; i = 9999; }
    }
    if (at < MAX_ROWS) {
        rows = llListInsertList(rows, [row], at);
        if (llGetListLength(rows) > MAX_ROWS)
            rows = llDeleteSubList(rows, MAX_ROWS, -1);
        llLinksetDataWrite("BOOK", llDumpList2String(rows, "~"));
        draw();
    }
}

default
{
    state_entry()
    {
        rows = llParseStringKeepNulls(llLinksetDataRead("BOOK"), ["~"], []);
        if (rows == [""]) rows = [];
        integer t = llGetUnixTime() / 3600;
        hourmark = (integer)t;
        llListen(CH_BOOK, "", NULL_KEY, "");
        draw();
        llSetTimerEvent(20.0);
    }

    listen(integer chan, string name, key id, string msg)
    {
        // P33|<cabinet uuid>|<score>|<name>
        list p = llParseStringKeepNulls(msg, ["|"], []);
        if (llGetListLength(p) < 4) return;
        if (llList2String(p, 0) != "P33") return;
        insert_row((integer)llList2String(p, 2), llList2String(p, 3), llList2String(p, 1));
    }

    timer()
    {
        integer t = (integer)(llGetUnixTime() / 3600);
        if (t != hourmark) {
            hourmark = t;
            llLinksetDataWrite("BEFORE", llDumpList2String(rows, "~"));
            rows = [];
            llLinksetDataWrite("BOOK", "");
            llSetText("THE TOLL\n\n  the board is struck\n  the House has posted its hand", CYAN, 1.0);
            llSetTimerEvent(4.0);
            return;
        }
        llSetTimerEvent(20.0);
        draw();
    }

    touch_start(integer n)
    {
        key who = llDetectedKey(0);
        string before = llLinksetDataRead("BEFORE");
        if (before != "") {
            llRegionSayTo(who, 0, "BEFORE THE TOLL: " + llDumpList2String(llParseStringKeepNulls(before, ["~"], []), " / "));
        }
        llRegionSayTo(who, 0, "The House is one point ahead. It is always one point ahead.");
    }
}
