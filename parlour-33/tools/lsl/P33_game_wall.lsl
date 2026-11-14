// =====================================================================
//  PARLOUR XXXIII  ·  P33_game_wall.lsl
//  THE WALL.  A game module.  18 bricks, 3 lives, one ball.
//  The wall is the rough ashlar; you are the tool that makes it smooth.
//
//  20 sprites: SPR01 paddle, SPR02 ball, SPR03..SPR20 the 18 bricks.
//  1 script.  0 listeners.  1 timer.
// =====================================================================

integer MSG_START = 100;
integer MSG_OVER  = 101;
integer MSG_SCORE = 102;
integer MSG_STOP  = 103;
integer MSG_READY = 104;

integer IN_LEFT  = 3;
integer IN_RIGHT = 4;

integer W    = 12;
float   CELL = 0.060;
float   SX   = 0.021;

vector CYAN    = <0.137, 0.898, 0.831>;
vector BRASS   = <0.788, 0.635, 0.290>;
vector BONE    = <0.910, 0.882, 0.816>;
vector MAGENTA = <1.000, 0.180, 0.533>;

list    sprLinks = [];
integer sprCount = 0;

list    balive = [];      // 18 flags
list    bcol   = [];      // 18 base columns
list    brow   = [];      // 18 rows

integer paddle   = 5;     // centre column
integer bx       = 5;
integer by       = 1;
integer dx       = 1;
integer dy       = 1;
integer lives    = 3;
integer score    = 0;
integer alive    = FALSE;
float   tick     = 0.09;
key     who      = NULL_KEY;

// =====================================================================
//  helpers
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

draw()
{
    integer i;
    // paddle: three cells wide, drawn as one stretched sprite
    place(llList2Integer(sprLinks, 0), (float)paddle, 0.0, BRASS, 0.35);
    // ball
    place(llList2Integer(sprLinks, 1), (float)bx, (float)by, CYAN, 0.6);
    // bricks
    for (i = 0; i < 18; i += 1) {
        integer ln = llList2Integer(sprLinks, 2 + i);
        if (llList2Integer(balive, i)) {
            place(ln, (float)llList2Integer(bcol, i) + 0.5, (float)llList2Integer(brow, i), BONE, 0.12);
        } else {
            hide(ln);
        }
    }
    llMessageLinked(LINK_SET, MSG_SCORE, (string)score, who);
}

reset_ball()
{
    bx = paddle;
    by = 1;
    dy = 1;
    dx = 1;
    if (llFrand(1.0) > 0.5) dx = -1;
}

end_run()
{
    alive = FALSE;
    llSetTimerEvent(0.0);
    integer i;
    for (i = 0; i < sprCount; i += 1) hide(llList2Integer(sprLinks, i));
    llMessageLinked(LINK_SET, MSG_OVER, (string)score, who);
}

brick_at(integer cx, integer cy)
{
    integer i;
    for (i = 0; i < 18; i += 1) {
        if (llList2Integer(balive, i)
            && llList2Integer(brow, i) == cy
            && cx >= llList2Integer(bcol, i)
            && cx <= llList2Integer(bcol, i) + 1)
            return i;
    }
    return -1;
}

step()
{
    integer nx = bx + dx;
    integer ny = by + dy;

    // side walls
    if (nx < 0)  { nx = 0;  dx = 1;  }
    if (nx > W - 1) { nx = W - 1; dx = -1; }
    // ceiling
    if (ny > 11) { ny = 11; dy = -1; }

    // bricks
    integer hit = brick_at(nx, ny);
    if (hit >= 0) {
        balive = llListReplaceList(balive, [0], hit, hit);
        score += 10;
        dy = -dy;
        ny = by;                 // no penetration
        nx = bx;
        if (score % 40 == 0 && tick > 0.055) { tick -= 0.004; llSetTimerEvent(tick); }
        // win?
        integer left = 0;
        integer i;
        for (i = 0; i < 18; i += 1) if (llList2Integer(balive, i)) left += 1;
        if (left == 0) { score += 25; end_run(); return; }
    }

    // floor
    if (ny <= 0) {
        if (nx >= paddle - 1 && nx <= paddle + 1) {
            ny = 0;
            dy = 1;
            if (nx == paddle - 1 && dx == 0) dx = -1;
            if (nx == paddle + 1) dx = 1;
            if (llFrand(1.0) > 0.6) dx = -dx;
        } else {
            lives -= 1;
            if (lives <= 0) { end_run(); return; }
            reset_ball();
            draw();
            return;
        }
    }

    bx = nx;
    by = ny;
    draw();
}

reset()
{
    balive = [];
    bcol = [];
    brow = [];
    integer r; integer k;
    for (r = 0; r < 3; r += 1) {
        for (k = 0; k < 6; k += 1) {
            balive += [1];
            bcol += [k * 2];
            brow += [9 + r];
        }
    }
    paddle = 5;
    lives = 3;
    score = 0;
    tick = 0.09;
    alive = TRUE;
    reset_ball();
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
        if (sprCount < 20) {
            llSetText("THE WALL NEEDS 20 SPRITES\n(report to the Mechanic)", MAGENTA, 1.0);
            return;
        }
        // shape: paddle is a bar, everything else a dot
        llSetLinkPrimitiveParamsFast(llList2Integer(sprLinks, 0), [PRIM_SIZE, <0.05, 0.19, 0.045>]);
        for (i = 1; i < 20; i += 1) {
            if (i < 2) llSetLinkPrimitiveParamsFast(llList2Integer(sprLinks, i), [PRIM_SIZE, <0.05, 0.05, 0.05>]);
            else       llSetLinkPrimitiveParamsFast(llList2Integer(sprLinks, i), [PRIM_SIZE, <0.05, 0.115, 0.04>]);
        }
        for (i = 0; i < sprCount; i += 1) hide(llList2Integer(sprLinks, i));
        llMessageLinked(LINK_SET, MSG_READY, "THE WALL", NULL_KEY);
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
            if (alive && paddle > 2) { paddle -= 1; draw(); }
        }
        else if (num == IN_RIGHT) {
            if (alive && paddle < 9) { paddle += 1; draw(); }
        }
    }

    timer()
    {
        if (alive) step();
    }

    changed(integer change)
    {
        if (change & CHANGED_LINK) llResetScript();
    }
}
