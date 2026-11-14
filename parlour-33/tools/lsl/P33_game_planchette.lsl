// =====================================================================
//  PARLOUR XXXIII  ·  P33_game_planchette.lsl
//  THE PLANCHETTE.  A game module.  The House offers letters; you
//  choose which to take. One of them is a trap.
//
//  Sprites: SPR01 planchette, SPR02..04 falling tokens,
//           SPR05..07 strike lamps.
//  1 script.  0 listeners.  1 timer.
// =====================================================================

integer MSG_START = 100;
integer MSG_OVER  = 101;
integer MSG_SCORE = 102;
integer MSG_STOP  = 103;
integer MSG_READY = 104;

integer IN_LEFT  = 3;
integer IN_RIGHT = 4;

float   CELL = 0.060;
float   SX   = 0.021;

vector CYAN    = <0.137, 0.898, 0.831>;
vector BONE    = <0.910, 0.882, 0.816>;
vector MAGENTA = <1.000, 0.180, 0.533>;
vector BRASS   = <0.788, 0.635, 0.290>;

string WORD = "PARLOUR";

list    sprLinks = [];
integer sprCount = 0;

integer pc       = 5;       // planchette column
list    tcol     = [];      // float columns
list    trow     = [];      // float rows
list    ttype    = [];      // 0 letter, 1 decoy, 2 trap
integer letters  = 0;
integer strikes  = 0;
integer score    = 0;
integer alive    = FALSE;
float   speed    = 0.75;
key     who      = NULL_KEY;

// =====================================================================

vector pos_of(float cx, float cy)
{
    return <SX, (5.5 - cx) * CELL, (cy - 5.5) * CELL>;
}

place(integer ln, float cx, float cy, vector col, float glow)
{
    llSetLinkPrimitiveParamsFast(ln,
        [PRIM_POS_LOCAL, pos_of(cx, cy),
         PRIM_COLOR, ALL_SIDES, col, 1.0,
         PRIM_GLOW,  ALL_SIDES, glow]);
}

hide(integer ln)
{
    llSetLinkPrimitiveParamsFast(ln, [PRIM_COLOR, ALL_SIDES, <1,1,1>, 0.0, PRIM_GLOW, ALL_SIDES, 0.0]);
}

string board()
{
    string out = "";
    integer i;
    for (i = 0; i < 7; i += 1) {
        if (i < letters) out += llGetSubString(WORD, i, i);
        else out += "_";
    }
    return "!" + out + "  ×" + (string)strikes;
}

draw()
{
    integer i;
    place(llList2Integer(sprLinks, 0), (float)pc, 0.0, BRASS, 0.45);
    for (i = 0; i < 3; i += 1) {
        integer ln = llList2Integer(sprLinks, 1 + i);
        if (llList2Integer(ttype, i) == 0)
            place(ln, llList2Float(tcol, i), llList2Float(trow, i), CYAN, 0.6);
        else if (llList2Integer(ttype, i) == 1)
            place(ln, llList2Float(tcol, i), llList2Float(trow, i), BONE, 0.15);
        else
            place(ln, llList2Float(tcol, i), llList2Float(trow, i), MAGENTA, 0.6);
    }
    for (i = 0; i < 3; i += 1) {
        integer ln = llList2Integer(sprLinks, 4 + i);
        if (i < strikes) place(ln, (float)i + 0.4, 11.0, MAGENTA, 0.7);
        else             place(ln, (float)i + 0.4, 11.0, <0.10,0.10,0.12>, 0.0);
    }
    llMessageLinked(LINK_SET, MSG_SCORE, board(), who);
}

integer spawn_type()
{
    float r = llFrand(1.0);
    if (r < 0.52) return 0;
    if (r < 0.84) return 1;
    return 2;
}

respawn(integer i)
{
    tcol  = llListReplaceList(tcol,  [(float)((integer)llFrand(11.0) + 0.5)], i, i);
    trow  = llListReplaceList(trow,  [11.0], i, i);
    ttype = llListReplaceList(ttype, [spawn_type()], i, i);
}

end_run()
{
    alive = FALSE;
    llSetTimerEvent(0.0);
    integer i;
    for (i = 0; i < sprCount; i += 1) hide(llList2Integer(sprLinks, i));
    llMessageLinked(LINK_SET, MSG_OVER, (string)score, who);
}

reset()
{
    pc = 5;
    letters = 0;
    strikes = 0;
    score = 0;
    speed = 0.75;
    alive = TRUE;
    tcol = [1.5, 5.5, 9.5];
    trow = [10.0, 6.0, 2.0];
    ttype = [0, 1, 2];
    draw();
    llSetTimerEvent(0.14);
}

// =====================================================================

default
{
    state_entry()
    {
        integer n = llGetNumberOfPrims();
        integer i; integer j;
        list nums = []; list links = [];
        for (i = 1; i <= n; i += 1) {
            string nm = llGetLinkName(i);
            if (llSubStringIndex(nm, "SPR") >= 0) {
                nums  += [(integer)llGetSubString(nm, -2, -1)];
                links += [i];
            }
        }
        for (i = 1; i < llGetListLength(nums); i += 1) {
            integer kv = llList2Integer(nums, i);
            integer ln = llList2Integer(links, i);
            j = i - 1;
            while (j >= 0 && llList2Integer(nums, j) > kv) {
                nums  = llListReplaceList(nums,  [llList2Integer(nums,  j)], j + 1, j + 1);
                links = llListReplaceList(links, [llList2Integer(links, j)], j + 1, j + 1);
                j -= 1;
            }
            nums  = llListReplaceList(nums,  [kv], j + 1, j + 1);
            links = llListReplaceList(links, [ln], j + 1, j + 1);
        }
        sprLinks = links;
        sprCount = llGetListLength(sprLinks);
        if (sprCount < 7) {
            llSetText("THE PLANCHETTE NEEDS 7 SPRITES\n(report to the Mechanic)", MAGENTA, 1.0);
            return;
        }
        llSetLinkPrimitiveParamsFast(llList2Integer(sprLinks, 0), [PRIM_SIZE, <0.05, 0.13, 0.045>]);
        for (i = 0; i < sprCount; i += 1) hide(llList2Integer(sprLinks, i));
        llMessageLinked(LINK_SET, MSG_READY, "THE PLANCHETTE", NULL_KEY);
    }

    link_message(integer sender, integer num, string str, key id)
    {
        if (num == MSG_START) {
            who = id;
            reset();
        }
        else if (num == MSG_STOP) {
            alive = FALSE;
            llSetTimerEvent(0.0);
        }
        else if (num == IN_LEFT) {
            if (alive && pc > 1) { pc -= 1; draw(); }
        }
        else if (num == IN_RIGHT) {
            if (alive && pc < 10) { pc += 1; draw(); }
        }
    }

    timer()
    {
        if (!alive) return;
        integer i;
        for (i = 0; i < 3; i += 1) {
            float r = llList2Float(trow, i) - speed;
            float c = llList2Float(tcol, i);
            trow = llListReplaceList(trow, [r], i, i);

            if (r <= 0.7 && r > -1.0) {
                if (c >= (float)pc - 1.2 && c <= (float)pc + 1.2) {
                    integer t = llList2Integer(ttype, i);
                    if (t == 0) {
                        letters += 1;
                        score += 10;
                        if (letters >= 7) { score += 50; end_run(); return; }
                        if (speed < 1.9) speed += 0.12;
                    } else if (t == 1) {
                        score += 2;
                    } else {
                        strikes += 1;
                        if (strikes >= 3) { end_run(); return; }
                    }
                    respawn(i);
                }
            }
            if (r < -0.5) respawn(i);
        }
        draw();
    }

    changed(integer change)
    {
        if (change & CHANGED_LINK) llResetScript();
    }
}
