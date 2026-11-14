// =====================================================================
//  PARLOUR XXXIII  ·  P33_game_adder.lsl
//  THE ADDER.  A game module.  Put it in any child prim of a cabinet
//  built to the contract in tools/lsl/README.md.
//
//  12 x 12 grid.  The snake is the ouroboros and it is always hungry.
//  The apple is placed one cell further away than fair.
//
//  1 script.  0 listeners.  1 timer.
// =====================================================================

integer MSG_START = 100;
integer MSG_OVER  = 101;
integer MSG_SCORE = 102;
integer MSG_STOP  = 103;
integer MSG_READY = 104;

integer IN_UP    = 1;
integer IN_DOWN  = 2;
integer IN_LEFT  = 3;
integer IN_RIGHT = 4;

// ---- board ---------------------------------------------------------
integer W    = 12;
integer H    = 12;
float   CELL = 0.060;
float   SX   = 0.021;

vector CYAN    = <0.137, 0.898, 0.831>;
vector DIM     = <0.055, 0.400, 0.380>;
vector MAGENTA = <1.000, 0.180, 0.533>;

// ---- state ---------------------------------------------------------
list    sprLinks  = [];    // [0] = the apple, [1..] = the body
integer sprCount  = 0;
list    body      = [];    // head first, cell indices
integer foodCell  = 0;
integer dir       = 1;     // 0 up  1 right  2 down  3 left
integer nextDir   = 1;
integer score     = 0;
integer alive     = FALSE;
float   tick      = 0.30;
integer dying     = 0;
key     who       = NULL_KEY;

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

integer rand_free_cell()
{
    integer tries = 0;
    integer head = llList2Integer(body, 0);
    while (tries < 40) {
        integer c = (integer)llFrand((float)(W * H));
        if (llListFindList(body, [c]) < 0) {
            // the House's edge: never right next to the head
            integer dx = (c % W) - (head % W);
            integer dy = (c / W) - (head / W);
            if (dx < 0) dx = -dx;
            if (dy < 0) dy = -dy;
            if (dx + dy >= 2) return c;
        }
        tries += 1;
    }
    return (integer)llFrand((float)(W * H));
}

draw()
{
    integer i; integer n = llGetListLength(body);
    for (i = 0; i < n; i += 1) {
        integer ln = llList2Integer(sprLinks, 1 + i);
        if (i == 0) show(ln, llList2Integer(body, i), CYAN, 0.45);
        else        show(ln, llList2Integer(body, i), DIM, 0.15);
    }
    for (i = n; i < sprCount - 1; i += 1) hide(llList2Integer(sprLinks, 1 + i));
    show(llList2Integer(sprLinks, 0), foodCell, MAGENTA, 0.55);
    llMessageLinked(LINK_SET, MSG_SCORE, (string)score, who);
}

die()
{
    alive = FALSE;
    dying = 4;
    integer i;
    for (i = 0; i < llGetListLength(body); i += 1)
        show(llList2Integer(sprLinks, 1 + i), llList2Integer(body, i), MAGENTA, 0.7);
    llSetTimerEvent(0.12);
}

end_run()
{
    llSetTimerEvent(0.0);
    hide(llList2Integer(sprLinks, 0));
    integer i;
    for (i = 1; i < sprCount; i += 1) hide(llList2Integer(sprLinks, i));
    llMessageLinked(LINK_SET, MSG_OVER, (string)score, who);
    alive = FALSE;
}

step()
{
    if (nextDir != (dir + 2) % 4) dir = nextDir;

    integer head = llList2Integer(body, 0);
    integer hx = head % W;
    integer hy = head / W;

    if (dir == 0)      hy += 1;
    else if (dir == 1) hx += 1;
    else if (dir == 2) hy -= 1;
    else               hx -= 1;

    if (hx < 0 || hx >= W || hy < 0 || hy >= H) { die(); return; }

    integer nc = hy * W + hx;
    if (llListFindList(body, [nc]) >= 0) { die(); return; }

    body = [nc] + body;

    if (nc == foodCell) {
        score += 3;
        tick = 0.30 - (float)score * 0.006;
        if (tick < 0.18) tick = 0.18;
        llSetTimerEvent(tick);
        if (llGetListLength(body) >= sprCount - 1) {  // filled the board
            score += 10;
            end_run();
            return;
        }
        foodCell = rand_free_cell();
    } else {
        body = llDeleteSubList(body, -1, -1);
    }
    draw();
}

reset()
{
    integer i;
    for (i = 0; i < sprCount; i += 1) hide(llList2Integer(sprLinks, i));
    body = [66, 65, 64];       // centre-ish, heading right
    dir = 1;
    nextDir = 1;
    score = 0;
    tick = 0.30;
    alive = TRUE;
    dying = 0;
    foodCell = rand_free_cell();
    draw();
    llSetTimerEvent(tick);
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
        // collect sprites in index order (SPR01 .. SPR16)
        list nums = [];
        list links = [];
        for (i = 1; i <= n; i += 1) {
            string nm = llGetLinkName(i);
            if (llSubStringIndex(nm, "SPR") >= 0) {
                nums  += [(integer)llGetSubString(nm, -2, -1)];
                links += [i];
            }
        }
        // insertion sort by sprite number
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
        if (sprCount < 4) {
            llSetText("THE ADDER NEEDS 17 SPRITES\n(report to the Mechanic)", MAGENTA, 1.0);
            return;
        }
        for (i = 0; i < sprCount; i += 1) hide(llList2Integer(sprLinks, i));
        llMessageLinked(LINK_SET, MSG_READY, "THE ADDER", NULL_KEY);
        llSetTimerEvent(0.0);
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
        else if (num >= IN_UP && num <= IN_RIGHT) {
            if (!alive) return;
            if (num == IN_UP)    nextDir = 0;
            if (num == IN_RIGHT) nextDir = 1;
            if (num == IN_DOWN)  nextDir = 2;
            if (num == IN_LEFT)  nextDir = 3;
        }
    }

    timer()
    {
        if (dying > 0) {
            dying -= 1;
            if (dying == 0) end_run();
            return;
        }
        if (alive) step();
    }

    changed(integer change)
    {
        if (change & CHANGED_LINK) llResetScript();
    }
}
