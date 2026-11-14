// =====================================================================
//  PARLOUR XXXIII  ·  P33_game_scribe.lsl
//  THE SCRIBE.  Cabinet 12, Cabinet Row.  See 14-the-root.md §6.
//
//  One stroke. Sixteen cells. Twenty seconds. Make it mean something.
//
//  The only game in the house whose score is an OPINION — the House
//  judges your mark by symmetry, because the House judges everything by
//  symmetry. And the only game that LEAVES SOMETHING BEHIND: the best
//  stroke is stored in linkset data and redrawn in attract mode, cell by
//  cell, forever. Your graffiti stays in the cabinet after you leave.
//
//  Same hardware as the Adder: 12 x 12 grid, sprites SPR01..SPR16.
//  SPR01 = the cursor, SPR02..SPR17 = the stroke (16 cells).
//
//  1 script.  0 listeners.  1 timer.
// =====================================================================

integer MSG_START    = 100;
integer MSG_OVER     = 101;
integer MSG_SCORE    = 102;
integer MSG_STOP     = 103;
integer MSG_READY    = 104;
integer MSG_DEMO     = 106;
integer MSG_DEMO_END = 107;

integer IN_UP    = 1;
integer IN_DOWN  = 2;
integer IN_LEFT  = 3;
integer IN_RIGHT = 4;
integer IN_FIRE  = 5;

integer W = 12;
integer H = 12;
float   CELL = 0.060;
float   SX   = 0.021;

vector CYAN    = <0.137, 0.898, 0.831>;
vector BONE    = <0.910, 0.882, 0.816>;
vector MAGENTA = <1.000, 0.180, 0.533>;
vector GHOST   = <0.62, 0.55, 0.42>;

list    sprLinks = [];
integer sprCount = 0;

integer cursor   = 66;
list    ink      = [];
integer playing  = FALSE;
integer demo     = FALSE;
integer left     = 20;
integer demoIdx  = 0;
key     who      = NULL_KEY;

// =====================================================================
//  helpers
// =====================================================================

vector pos_of(integer cell)
{
    integer cx = cell % W;
    integer cy = cell / W;
    return <SX, (5.5 - (float)cx) * CELL, ((float)cy - 5.5) * CELL>;
}

show(integer ln, integer cell, vector col, float glow)
{
    llSetLinkPrimitiveParamsFast(ln,
        [PRIM_POS_LOCAL, pos_of(cell),
         PRIM_COLOR, ALL_SIDES, col, 1.0,
         PRIM_GLOW,  ALL_SIDES, glow]);
}

hide(integer ln)
{
    llSetLinkPrimitiveParamsFast(ln, [PRIM_COLOR, ALL_SIDES, <1,1,1>, 0.0, PRIM_GLOW, ALL_SIDES, 0.0]);
}

hide_all()
{
    integer i;
    for (i = 0; i < sprCount; i += 1) hide(llList2Integer(sprLinks, i));
}

integer mirror_axis(integer c)
{
    // the vertical centre line: (cx, cy) -> (11 - cx, cy)
    integer cx = c % W;
    integer cy = c / W;
    return cy * W + (W - 1 - cx);
}

integer mirror_rot(integer c)
{
    // 90 degrees: (cx, cy) -> (cy, 11 - cx)
    integer cx = c % W;
    integer cy = c / W;
    return (W - 1 - cx) * W + cy;
}

integer all_mirrored(list L, integer mode)
{
    integer i;
    for (i = 0; i < llGetListLength(L); i += 1) {
        integer c = llList2Integer(L, i);
        integer m;
        if (mode == 0) m = mirror_axis(c);
        else           m = mirror_rot(c);
        if (llListFindList(L, [m]) < 0) return FALSE;
    }
    return TRUE;
}

integer adjacent(integer a, integer b)
{
    integer ax = a % W; integer ay = a / W;
    integer bx = b % W; integer by = b / W;
    integer dx = ax - bx; if (dx < 0) dx = -dx;
    integer dy = ay - by; if (dy < 0) dy = -dy;
    return (dx + dy == 1);
}

// ---- the judgement --------------------------------------------------

integer judge(list L, integer closed)
{
    integer n = llGetListLength(L);
    if (n == 0) return 0;

    integer axis = all_mirrored(L, 0);
    integer rot  = all_mirrored(L, 1);

    integer s = 0;
    if (axis) s += 3;
    if (rot)  s += 3;
    if (closed) s += 2;
    s += n;
    if (s > 12 + 8) s = 12 + 8;

    // the Heretic's bonus: the House pays more for a contradiction it can file
    if (!axis && closed) s += 4;
    return s;
}

// ---- storage --------------------------------------------------------

save_sigil(list L, integer sc)
{
    integer best = (integer)llLinksetDataRead("SBEST");
    if (sc <= best) return;
    llLinksetDataWrite("SBEST", (string)sc);
    llLinksetDataWrite("SIGIL", llDumpList2String(L, ","));
}

list load_sigil()
{
    string s = llLinksetDataRead("SIGIL");
    if (s == "") return [];
    list raw = llParseStringKeepNulls(s, [","], []);
    list out = [];
    integer i;
    for (i = 0; i < llGetListLength(raw); i += 1)
        out += [(integer)llList2String(raw, i)];
    return out;
}

// ---- drawing --------------------------------------------------------

draw_board()
{
    integer i;
    hide_all();
    if (demo) {
        for (i = 0; i <= demoIdx && i < llGetListLength(ink); i += 1)
            show(llList2Integer(sprLinks, 1 + i), llList2Integer(ink, i), GHOST, 0.18);
        return;
    }
    for (i = 0; i < llGetListLength(ink) && i < sprCount - 1; i += 1)
        show(llList2Integer(sprLinks, 1 + i), llList2Integer(ink, i), CYAN, 0.40);
    show(llList2Integer(sprLinks, 0), cursor, BONE, 0.55);
}

integer ink_here()
{
    if (llGetListLength(ink) >= sprCount - 1) return FALSE;   // 16 cells, no more
    if (llListFindList(ink, [cursor]) >= 0) return FALSE;
    if (llGetListLength(ink) > 0) {
        integer last = llList2Integer(ink, -1);
        if (!adjacent(last, cursor)) return FALSE;            // one continuous stroke
    }
    ink += [cursor];
    return TRUE;
}

integer closed_loop()
{
    if (llGetListLength(ink) < 4) return FALSE;
    return adjacent(llList2Integer(ink, 0), llList2Integer(ink, -1));
}

// ---- run control ----------------------------------------------------

start_run()
{
    demo = FALSE;
    playing = TRUE;
    cursor = 66;
    ink = [];
    left = 20;
    hide_all();
    draw_board();
    llMessageLinked(LINK_SET, MSG_SCORE, "!" + (string)left + "s  ·  INK 0", who);
    llSetTimerEvent(1.0);
}

end_run()
{
    playing = FALSE;
    llSetTimerEvent(0.0);
    integer sc = judge(ink, closed_loop());
    save_sigil(ink, sc);
    hide_all();
    llMessageLinked(LINK_SET, MSG_OVER, (string)sc, who);
}

start_demo()
{
    ink = load_sigil();
    if (llGetListLength(ink) == 0) {
        llMessageLinked(LINK_SET, MSG_DEMO_END, "", NULL_KEY);
        return;
    }
    demo = TRUE;
    playing = FALSE;
    demoIdx = 0;
    hide_all();
    draw_board();
    llSetTimerEvent(0.30);
}

// =====================================================================
default
{
    state_entry()
    {
        integer n = llGetNumberOfPrims();
        integer i;
        list nums = [];
        list links = [];
        for (i = 1; i <= n; i += 1) {
            string nm = llGetLinkName(i);
            if (llSubStringIndex(nm, "SPR") >= 0) {
                nums  += [(integer)llGetSubString(nm, -2, -1)];
                links += [i];
            }
        }
        integer j;
        for (i = 1; i < llGetListLength(nums); i += 1) {
            integer kv = llList2Integer(nums, i);
            integer lnk = llList2Integer(links, i);
            j = i - 1;
            while (j >= 0 && llList2Integer(nums, j) > kv) {
                nums  = llListReplaceList(nums,  [llList2Integer(nums,  j)], j + 1, j + 1);
                links = llListReplaceList(links, [llList2Integer(links, j)], j + 1, j + 1);
                j -= 1;
            }
            nums  = llListReplaceList(nums,  [kv], j + 1, j + 1);
            links = llListReplaceList(links, [lnk], j + 1, j + 1);
        }
        sprLinks = links;
        sprCount = llGetListLength(sprLinks);
        if (sprCount < 10) {
            llSetText("THE SCRIBE NEEDS 17 SPRITES\n(the House will hear of this)", MAGENTA, 1.0);
            return;
        }
        hide_all();
        llMessageLinked(LINK_SET, MSG_READY, "THE SCRIBE", NULL_KEY);
        llSetTimerEvent(0.0);
    }

    link_message(integer sender, integer num, string str, key id)
    {
        if (num == MSG_START) {
            who = id;
            start_run();
            return;
        }
        if (num == MSG_DEMO) {
            start_demo();
            return;
        }
        if (num == MSG_STOP) {
            playing = FALSE;
            demo = FALSE;
            llSetTimerEvent(0.0);
            hide_all();
            return;
        }
        if (!playing || demo) return;

        integer cx = cursor % W;
        integer cy = cursor / W;

        if (num == IN_FIRE) {
            if (ink_here()) {
                draw_board();
                llMessageLinked(LINK_SET, MSG_SCORE,
                    "!" + (string)left + "s  ·  INK " + (string)llGetListLength(ink), who);
            }
            return;
        }
        if (num == IN_UP    && cy < H - 1) cursor += W;
        if (num == IN_DOWN  && cy > 0)     cursor -= W;
        if (num == IN_LEFT  && cx > 0)     cursor -= 1;
        if (num == IN_RIGHT && cx < W - 1) cursor += 1;
        draw_board();
    }

    timer()
    {
        if (demo) {
            demoIdx += 1;
            if (demoIdx >= llGetListLength(ink)) {
                llSetTimerEvent(0.0);
                demo = FALSE;
                llMessageLinked(LINK_SET, MSG_DEMO_END, "", NULL_KEY);
                return;
            }
            draw_board();
            return;
        }
        if (!playing) { llSetTimerEvent(0.0); return; }

        left -= 1;
        if (left <= 0) { end_run(); return; }
        llMessageLinked(LINK_SET, MSG_SCORE,
            "!" + (string)left + "s  ·  INK " + (string)llGetListLength(ink), who);
    }

    changed(integer change)
    {
        if (change & CHANGED_LINK) llResetScript();
    }
}
