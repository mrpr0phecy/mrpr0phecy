// ============================================================================
//  VIGILANT ACTION CAMERA - DIRECTOR  v5.0  --  Second Life (LSL)
//  SCRIPT 1 OF 2. The director watches the whole region and decides what to
//  film: new arrivals, speech, movers, action bursts, newly worn items and
//  fast rezzed props. Every star carries a HEAT value (new arrivals +18,
//  action bursts +15, speech +10, movement +8, halving every pulse): hot
//  stars win the spotlight, stay on the books, and their heat is reported
//  to the CAMERA script once a second so the lens physically tightens its
//  orbit around them. The channel scanner and the CHANNELS report live in
//  the camera script (vigilant-camera-hud.lsl).
//
//  USE: put BOTH scripts in the ROOT prim of a HUD attachment and wear it.
//  Two scripts = two separate 64 KB Mono budgets; that is what finally cures
//  the Stack-Heap Collision that killed the single-script versions (v2.2,
//  v4.0 and v4.1 all died on boot).
//  This script needs no permissions - the camera script takes camera control.
//
//  Silent commands on channel -123456 (the ones this script answers):
//        SCAN, STATUS, NEXT, BACK, NEXT_TARGET, FREEZE, FOCUS, ONOFF,
//        TOGGLE_DEBUG, RESET (the motion toggles, CHANNELS and the scanner
//        live in the camera script)
//  All tunables are in the constants block below and every threshold
//  auto-scales with SENSOR_INTERVAL.
// ============================================================================

// ---------------------------------------------------------------------------
//  Tuning constants - tweak to taste
// ---------------------------------------------------------------------------
float SENSOR_INTERVAL        = 1.0;   // region scan pulse (seconds)
integer MAX_SCAN_AGENTS      = 24;    // agents fully scanned per pulse
float SENSOR_RANGE           = 96.0;  // object sensor radius (96 m is the max)
integer MAX_AVATARS          = 8;     // stars kept on the books
integer MAX_OBJECTS          = 12;    // moving objects tracked

// the director
float FOCUS_SWITCH_INTERVAL  = 20.0;  // linger on an active star (seconds)
float BORING_SWITCH_INTERVAL = 8.0;   // rotate a resting star out after (s)
float BORING_SCORE           = 2.0;   // below this score a star is "resting"
float MIN_TARGET_DWELL       = 3.0;   // min seconds on a target before an
                                      // interrupt may steal it (anti-strobe)
float SPEED_INTERRUPT        = 3.0;   // m/s that counts as action (run speed+)
                                      // (teleport-style jumps are caught via
                                      //  distance covered per pulse instead)

// new-activity heat (hone in on fresh action)
float HEAT_NEW               = 18.0;  // a star just arrived on the region
float HEAT_BURST             = 15.0;  // just switched into an action anim
float HEAT_SPEECH            = 10.0;  // spoke within the last 10 s
float HEAT_MOVE              = 8.0;   // currently a mover / traveller
float HEAT_DECAY             = 0.5;   // heat halves every pulse
                                      // (HEAT_CAP / HEAT_DOLLY - how the lens
                                      //  reacts to heat - live in the camera
                                      //  script with the orbit constants)

// close-up timing (the framing distances live in the camera script)
float ZOOM_DURATION          = 3.0;   // static close-up hold (seconds)

// vigilance shaping
float SCORE_REACH            = 6.0;   // metres of tracking rank that one
                                      // action-score point buys (pulls
                                      // far-away action onto the books)

// bookkeeping
integer ATTACH_CHECKS_PER_SCAN = 2;   // outfits diffed per pulse (the star
                                      // is always checked first, on top)
float NEW_OBJECT_RADIUS      = 12.0;  // "action prop" must be this near a
                                      // star or the director
float KNOWN_ATTACH_TTL       = 180.0; // remember worn items for (seconds)
integer KNOWN_ATTACH_CAP     = 48;    // hard cap on remembered worn items
float DEDUP_TTL              = 12.0;  // don't re-cut to the same thing for (s)
integer MEMORY_FLOOR         = 15000; // free bytes before caches are shed

// toggles and channels
integer DEBUG_MODE           = FALSE; // chatter from the control room
integer RELAY_CHAT           = TRUE;  // relay the star's chat to you
integer HUD_CHANNEL          = -123456;

// interrupt priorities (higher wins)
integer PRIORITY_PROP   = 0;   // freshly rezzed moving object near a star
integer PRIORITY_ACTION = 1;   // mover, traveller, burst, newly worn item
integer PRIORITY_SPEECH = 2;   // someone nearby is talking
integer PRIORITY_NEW    = 3;   // a brand new arrival (headline news)

// ---------------------------------------------------------------------------
//  Link messages. The camera script sends 210-214, the director sends
//  220-225. Each script only ever REACTS to the other's numbers, so a
//  message echoing back to its own sender (llMessageLinked does that when
//  the sender is in the target prims) is harmlessly ignored.
// ---------------------------------------------------------------------------
integer MSG_POWER      = 210;   // camera -> director: str "1"/"0" = roll/stop
integer MSG_CMD        = 211;   // camera -> director: "NEXT"/"BACK"/"RANDOM"
integer MSG_FLAG       = 212;   // camera -> director: "HALT:1" etc
integer MSG_LOST       = 213;   // camera -> director: id = vanished target
integer MSG_DIE        = 214;   // camera -> director: reset yourself
integer MSG_CUT_ORBIT  = 220;   // director -> camera: id = target, str = kind
integer MSG_CUT_ZOOM   = 221;   // director -> camera: id = target, str = kind
integer MSG_ZOOMEND    = 222;   // director -> camera: close-up is over
integer MSG_CLEAR      = 223;   // director -> camera: release the lens
integer MSG_FLAG_BACK  = 224;   // director -> camera: "LOCK:0"/"HALT:0"
integer MSG_HEAT       = 225;   // director -> camera: str = target's heat

// ---------------------------------------------------------------------------
//  Globals
// ---------------------------------------------------------------------------
key owner;                        // the director (HUD wearer)

integer cinematic = FALSE;        // are we rolling?

list av_keys;                     // tracked stars (parallel lists)
list av_pos;
list av_score;
list av_anim;                     // last known animation state per star
list av_heat;                     // new-activity heat per tracked star
list ob_keys;                     // tracked moving objects (parallel lists)
list ob_pos;

list last_agents;                 // FULL agent roster from the last pulse
list last_pos;                    // strided [key, pos] of scanned agents
integer has_scanned = FALSE;      // completed at least one pulse?

list known_att;                   // attachment keys we have already seen
list known_att_time;
list outfit_keys;                 // per-avatar attachment counts (parallel)
list outfit_count;                // a grown count = something new was worn
list dedup_keys;                  // things we recently cut to (no re-cuts)
list dedup_time;
list chat_keys;                   // recent speakers (for scoring bonus)
list chat_time;

key    target_key  = NULL_KEY;    // who is in the spotlight
string target_kind = "none";      // "avatar" or "object"
integer is_zoomed  = FALSE;       // holding a static close-up?
integer zoom_until = 0;           // unix time the close-up ends
integer last_cut   = 0;           // unix time of the last target change
integer last_sensor = 0;          // unix time of the last region pulse
integer target_boring = FALSE;    // is the star resting? (early rotation)
integer vanish_since = 0;         // unix time a locked target went missing

integer focus_locked = FALSE;     // stay on this target, ignore interrupts
integer halted = FALSE;           // freeze the camera
integer attach_cursor = 0;        // round-robin outfit-check pointer

key     last_announced = NULL_KEY; // dedup for announcements
integer no_targets_said = FALSE;   // said "no stars" already?
integer last_star_count = -1;      // for quiet count reporting
integer mem_warned = FALSE;        // low-memory warning said once?

integer listen_hud = 0;            // listen handles
integer listen_chat = 0;

// ---------------------------------------------------------------------------
//  Small utilities
// ---------------------------------------------------------------------------

// Region-wide name lookup (llKey2Name alone is unreliable at distance).
string get_name(key id)
{
    string n = llList2String(llGetObjectDetails(id, [OBJECT_NAME]), 0);
    if (n == "")
        n = llKey2Name(id);
    return n;
}

// Smallest of two floats. (LSL has no llMin()/llMax() - this hand-rolled
// helper keeps the script compiling on every viewer and server.)
float min_ff(float a, float b)
{
    if (a < b)
        return a;
    return b;
}

// Is this animation state an "action" state worth cutting to?
integer is_action_anim(string a)
{
    return (a == "Running" || a == "CrouchWalking" || a == "Striding" ||
            a == "Flying" || a == "FlyingSlow" || a == "Hovering" ||
            a == "Taking Off" || a == "Jumping" || a == "PreJumping" ||
            a == "FallingDown" || a == "Soft Landing");
}

// ---------------------------------------------------------------------------
//  Targets, announcements, no-targets handling
// ---------------------------------------------------------------------------

clear_target()
{
    target_key = NULL_KEY;
    target_kind = "none";
    is_zoomed = FALSE;
    vanish_since = 0;
}

// Announce only when the spotlight actually changes hands.
announce_target(key id, string reason)
{
    if (id == last_announced)
        return;
    last_announced = id;
    no_targets_said = FALSE;
    llOwnerSay(reason);
}

// Put someone/something in the spotlight and tell the camera script.
// (Never touches 'halted': an automatic zoom-release must never unfreeze a
//  camera the director froze on purpose. Manual commands clear it themselves.)
set_target(key k, string kind, string reason, integer zoom)
{
    target_key = k;
    target_kind = kind;
    last_cut = llGetUnixTime();
    vanish_since = 0;
    if (zoom)
    {
        is_zoomed = TRUE;
        zoom_until = llGetUnixTime() + (integer)(ZOOM_DURATION + 0.5);
        if (reason != "")
            announce_target(k, reason);
        llMessageLinked(LINK_SET, MSG_CUT_ZOOM, kind, k);
    }
    else
    {
        is_zoomed = FALSE;
        if (reason != "")
            announce_target(k, reason);
        llMessageLinked(LINK_SET, MSG_CUT_ORBIT, kind, k);
    }
}

// May this interrupt steal the spotlight right now?
//   NEW    : immediately (>= 1 s dwell), breaks ANY close-up
//   SPEECH : after MIN_TARGET_DWELL, may steal an ITEM close-up only
//   others : after MIN_TARGET_DWELL, never break a close-up
integer interrupt_allowed(integer priority)
{
    if (!cinematic || focus_locked || halted)
        return FALSE;
    integer dwell = llGetUnixTime() - last_cut;
    if (priority >= PRIORITY_NEW)
    {
        if (dwell < 1)
            return FALSE;                 // anti-strobe only for headline news
    }
    else
    {
        if (dwell < (integer)MIN_TARGET_DWELL)
            return FALSE;
        if (is_zoomed)
        {
            // only speech may take the lens off an item close-up
            if (priority < PRIORITY_SPEECH)
                return FALSE;
            if (target_kind != "object")
                return FALSE;
        }
    }
    return TRUE;
}

handle_no_targets()
{
    if (llGetListLength(av_keys) == 0 && llGetListLength(ob_keys) == 0)
    {
        if (!no_targets_said)
        {
            llOwnerSay("No stars or items in sight. Waiting for the next scan...");
            no_targets_said = TRUE;
        }
        clear_target();
        focus_locked = FALSE;
        halted = FALSE;
        llMessageLinked(LINK_SET, MSG_FLAG_BACK, "LOCK:0", NULL_KEY);
        llMessageLinked(LINK_SET, MSG_FLAG_BACK, "HALT:0", NULL_KEY);
        llMessageLinked(LINK_SET, MSG_CLEAR, "", NULL_KEY);
        last_announced = NULL_KEY;
    }
}

// Give up on a vanished target: release the camera and say so once.
give_up_target()
{
    clear_target();
    llMessageLinked(LINK_SET, MSG_CLEAR, "", NULL_KEY);
    if (!no_targets_said)
    {
        llOwnerSay("Lost the star - waiting for the next scan...");
        no_targets_said = TRUE;
    }
}

// ---------------------------------------------------------------------------
//  Choosing stars
// ---------------------------------------------------------------------------

// Weighted random pick from the score sheet (current star heavily discounted).
integer pick_weighted()
{
    integer n = llGetListLength(av_keys);
    if (n == 0)
        return -1;
    float total = 0.0;
    integer i;
    for (i = 0; i < n; i++)
    {
        float s = llList2Float(av_score, i);
        if (target_key != NULL_KEY && llList2Key(av_keys, i) == target_key)
            s = s * 0.05;
        if (s < 0.1)
            s = 0.1;
        total += s;
    }
    float r = llFrand(total);
    float cum = 0.0;
    for (i = 0; i < n; i++)
    {
        float s = llList2Float(av_score, i);
        if (target_key != NULL_KEY && llList2Key(av_keys, i) == target_key)
            s = s * 0.05;
        if (s < 0.1)
            s = 0.1;
        cum += s;
        if (r <= cum)
            return i;
    }
    return (integer)llFrand(n);
}

// Weighted random re-cast ("Random" / NEXT_TARGET command).
random_target()
{
    if (!cinematic)
    {
        llOwnerSay("The camera is off - choose 'On/Off' to start filming.");
        return;
    }
    integer n = llGetListLength(av_keys);
    if (n == 0)
    {
        handle_no_targets();
        return;
    }
    integer idx = pick_weighted();
    key k = llList2Key(av_keys, idx);
    set_target(k, "avatar", "Spotlight on: " + get_name(k) + "!", FALSE);
}

// Step through the cast list ("Next" / "Back").
cycle_target(integer dir)
{
    if (!cinematic)
    {
        llOwnerSay("The camera is off - choose 'On/Off' to start filming.");
        return;
    }
    integer n = llGetListLength(av_keys);
    if (n == 0)
    {
        handle_no_targets();
        return;
    }
    integer idx = llListFindList(av_keys, [target_key]);
    if (idx == -1)
        idx = 0;
    else
        idx = (idx + dir + n) % n;
    key k = llList2Key(av_keys, idx);
    set_target(k, "avatar", "Spotlight on: " + get_name(k) + "!", FALSE);
}

// ---------------------------------------------------------------------------
//  Rolling / wrapping (the camera script drives its own half of this)
// ---------------------------------------------------------------------------

power_on()
{
    cinematic = TRUE;
    av_keys = []; av_pos = []; av_score = []; av_anim = []; av_heat = [];
    ob_keys = []; ob_pos = [];
    last_agents = []; last_pos = [];
    has_scanned = FALSE;
    chat_keys = []; chat_time = [];
    known_att = []; known_att_time = [];
    outfit_keys = []; outfit_count = [];
    dedup_keys = []; dedup_time = [];
    target_boring = FALSE;
    last_sensor = 0;                 // force an immediate pulse
    attach_cursor = 0;
    clear_target();
    last_announced = NULL_KEY;
    no_targets_said = FALSE;
    if (listen_chat)
        llListenRemove(listen_chat);
    listen_chat = llListen(0, "", NULL_KEY, "");   // hear all nearby chatter
    llSetTimerEvent(SENSOR_INTERVAL);
}

power_off()
{
    cinematic = FALSE;
    llSetTimerEvent(0.0);
    if (listen_chat)
    {
        llListenRemove(listen_chat);
        listen_chat = 0;
    }
    clear_target();
    last_announced = NULL_KEY;
    no_targets_said = FALSE;
    focus_locked = FALSE;
    halted = FALSE;
    last_star_count = -1;
    target_boring = FALSE;
    av_keys = []; av_pos = []; av_score = []; av_anim = []; av_heat = [];
    ob_keys = []; ob_pos = [];
    last_agents = []; last_pos = [];
    has_scanned = FALSE;
    known_att = []; known_att_time = [];
    outfit_keys = []; outfit_count = [];
    dedup_keys = []; dedup_time = [];
    chat_keys = []; chat_time = [];
}

// ---------------------------------------------------------------------------
//  Bookkeeping (prune stale memory so lists stay small)
// ---------------------------------------------------------------------------

prune_lists(integer now)
{
    list k2 = [];
    list t2 = [];
    integer i;

    // worn-item memory
    integer n = llGetListLength(known_att);
    for (i = 0; i < n; i++)
    {
        if (now - llList2Integer(known_att_time, i) < (integer)KNOWN_ATTACH_TTL)
        {
            k2 += [llList2Key(known_att, i)];
            t2 += [llList2Integer(known_att_time, i)];
        }
    }
    known_att = k2;
    known_att_time = t2;
    integer kn = llGetListLength(known_att);
    if (kn > KNOWN_ATTACH_CAP)          // hard cap, oldest first, one cut
    {
        known_att = llDeleteSubList(known_att, 0, kn - KNOWN_ATTACH_CAP - 1);
        known_att_time = llDeleteSubList(known_att_time, 0, kn - KNOWN_ATTACH_CAP - 1);
    }

    // recent-cut dedup
    n = llGetListLength(dedup_keys);
    k2 = [];
    t2 = [];
    for (i = 0; i < n; i++)
    {
        if (now - llList2Integer(dedup_time, i) < (integer)DEDUP_TTL)
        {
            k2 += [llList2Key(dedup_keys, i)];
            t2 += [llList2Integer(dedup_time, i)];
        }
    }
    dedup_keys = k2;
    dedup_time = t2;

    // recent chatter
    n = llGetListLength(chat_keys);
    k2 = [];
    t2 = [];
    for (i = 0; i < n; i++)
    {
        if (now - llList2Integer(chat_time, i) <= 15)
        {
            k2 += [llList2Key(chat_keys, i)];
            t2 += [llList2Integer(chat_time, i)];
        }
    }
    chat_keys = k2;
    chat_time = t2;
}

// Shed caches before the 64 KB Mono budget is threatened.
memory_guard()
{
    integer free_mem = llGetFreeMemory();
    if (free_mem < MEMORY_FLOOR)
    {
        integer half = llGetListLength(known_att) / 2;
        if (half > 0)
        {
            known_att = llDeleteSubList(known_att, 0, half - 1);
            known_att_time = llDeleteSubList(known_att_time, 0, half - 1);
        }
        if (!mem_warned)
        {
            llOwnerSay("Low script memory (" + (string)free_mem +
                       " bytes free) - trimming caches to stay vigilant.");
            mem_warned = TRUE;
        }
    }
    if (free_mem < 9000)
    {
        // critical: drop the outfit bookkeeping and chatter too
        outfit_keys = [];
        outfit_count = [];
        chat_keys = [];
        chat_time = [];
    }
}

// ---------------------------------------------------------------------------
//  Outfit watch: did this star put something new on?
// ---------------------------------------------------------------------------

// Diff one avatar's outfit. Returns TRUE if it triggered a close-up cut.
integer check_outfit(integer idx, integer now)
{
    key wr = llList2Key(av_keys, idx);
    list atts = llGetAttachedList(wr);
    integer m = llGetListLength(atts);
    // llGetAttachedList can return ["NOT ON REGION"]-style strings; a single
    // non-key entry means there is nothing to work with.
    if (m == 1 && llList2Key(atts, 0) == NULL_KEY)
        m = 0;

    // per-avatar outfit count: grew = something new was put on
    integer oi = llListFindList(outfit_keys, [wr]);
    integer prev_count = -1;
    if (oi != -1)
        prev_count = llList2Integer(outfit_count, oi);
    if (oi == -1)
    {
        outfit_keys += [wr];
        outfit_count += [m];
    }
    else
    {
        outfit_count = llListReplaceList(outfit_count, [m], oi, oi);
    }
    integer grew = (prev_count != -1 && m > prev_count);

    integer made_cut = FALSE;
    if (grew)
    {
        integer wj;
        for (wj = 0; wj < m; wj++)
        {
            key it = llList2Key(atts, wj);
            if (it != NULL_KEY && llListFindList(known_att, [it]) == -1)
            {
                // the key we have never seen before is the new item
                list d = llGetObjectDetails(it, [OBJECT_ATTACHED_POINT, OBJECT_POS]);
                integer pt = llList2Integer(d, 0);
                vector ip = llList2Vector(d, 1);
                if (pt > 0 && ip != ZERO_VECTOR &&
                    llListFindList(dedup_keys, [it]) == -1 &&
                    interrupt_allowed(PRIORITY_ACTION))
                {
                    made_cut = TRUE;
                    dedup_keys += [it];
                    dedup_time += [now];
                    set_target(it, "object", "New item worn by " + get_name(wr) + "!", TRUE);
                    if (DEBUG_MODE)
                        llOwnerSay("Close-up on the new item worn by " + get_name(wr) +
                                   " for " + (string)((integer)ZOOM_DURATION) + "s!");
                    wj = m;    // stop this outfit (no break in LSL)
                }
            }
        }
    }

    // remember every attachment we have now seen (keeps memory accurate)
    integer lj;
    for (lj = 0; lj < m; lj++)
    {
        key it = llList2Key(atts, lj);
        if (it != NULL_KEY && llListFindList(known_att, [it]) == -1)
        {
            known_att += [it];
            known_att_time += [now];
        }
    }
    return made_cut;
}

// ---------------------------------------------------------------------------
//  The region pulse: roster, scores, heat, interrupts, outfits
// ---------------------------------------------------------------------------

scan_avatars()
{
    integer now = llGetUnixTime();
    prune_lists(now);
    memory_guard();

    // previous pulse state (by key, so nothing depends on list order)
    list prev_tracked_keys = av_keys;
    list prev_tracked_anim = av_anim;
    list prev_tracked_heat = av_heat;
    list prev_agents = last_agents;
    list prev_pos = last_pos;

    // distance reference: near the director means near the action
    vector base = llList2Vector(llGetObjectDetails(owner, [OBJECT_POS]), 0);

    // candidates as one strided list: [rank, key, pos, score, speed] per agent
    list cand = [];
    list pos_list = [];      // strided [key, pos] of this pulse's scans

    // best interrupt candidate found this pulse (reason built only if used)
    key cut_key = NULL_KEY;
    integer cut_pri = -1;
    float cut_speed = 0.0;
    string cut_kind = "";

    // teleport-ish detection threshold, auto-scaled to the pulse length
    float travel_need = SPEED_INTERRUPT * SENSOR_INTERVAL;

    list agents = llGetAgentList(AGENT_LIST_REGION, []);
    integer na = llGetListLength(agents);
    integer scanned = 0;
    integer i;
    for (i = 0; i < na; i++)
    {
        key a = llList2Key(agents, i);
        vector pos = ZERO_VECTOR;
        if (a != owner && scanned < MAX_SCAN_AGENTS)
        {
            list det = llGetObjectDetails(a, [OBJECT_POS, OBJECT_VELOCITY]);
            vector p = llList2Vector(det, 0);
            if (p != ZERO_VECTOR)
            {
                pos = p;
                scanned++;
                vector vel = llList2Vector(det, 1);
                float speed = llVecMag(vel);

                // ---- cheap score (no per-agent library calls) ----
                float score = 0.5 + speed * 4.0;
                integer is_new = (has_scanned && llListFindList(prev_agents, [a]) == -1);
                if (is_new)
                    score += 6.0;
                integer ci = llListFindList(chat_keys, [a]);
                if (ci != -1 && now - llList2Integer(chat_time, ci) <= 10)
                    score += 12.0;     // recent chatter makes you interesting

                // ---- interrupt candidates (never the current star) ----
                if (a != target_key)
                {
                    integer pri = -1;
                    string kind = "";
                    if (is_new)
                    {
                        pri = PRIORITY_NEW;
                        kind = "new";
                    }
                    else
                    {
                        integer mover = FALSE;
                        if (speed >= SPEED_INTERRUPT)
                        {
                            mover = TRUE;
                        }
                        else
                        {
                            integer li = llListFindList(prev_pos, [a]);
                            if (li != -1)
                            {
                                vector lastp = llList2Vector(prev_pos, li + 1);
                                if (lastp != ZERO_VECTOR &&
                                    llVecDist(pos, lastp) >= travel_need)
                                    mover = TRUE;
                            }
                        }
                        if (mover)
                        {
                            pri = PRIORITY_ACTION;
                            kind = "move";
                        }
                    }
                    if (pri > cut_pri ||
                        (pri == cut_pri && pri == PRIORITY_ACTION && speed > cut_speed))
                    {
                        cut_pri = pri;
                        cut_key = a;
                        cut_speed = speed;
                        cut_kind = kind;
                    }
                }

                // tracking rank: action pulls an avatar in from range
                cand += [llVecDist(pos, base) - min_ff(score, 15.0) * SCORE_REACH, a, pos, score, speed];
                pos_list += [a, pos];
            }
        }
    }
    last_agents = agents;      // the roster IS the scan result, no copy
    last_pos = pos_list;
    has_scanned = TRUE;

    // ---- pick the tracked cast: one strided sort, best rank first ----
    av_keys = [];
    av_pos = [];
    av_score = [];
    av_anim = [];
    av_heat = [];
    cand = llListSort(cand, 5, TRUE);
    integer ncand = llGetListLength(cand) / 5;
    integer kept = ncand;
    if (kept > MAX_AVATARS)
        kept = MAX_AVATARS;
    for (i = 0; i < kept; i++)
    {
        av_keys += [llList2Key(cand, i * 5 + 1)];
        av_pos += [llList2Vector(cand, i * 5 + 2)];
        av_score += [llList2Float(cand, i * 5 + 3)];
        av_anim += [""];
        av_heat += [0.0];
    }

    // ---- enrich the cast (only the tracked stars get the expensive calls) ----
    for (i = 0; i < kept; i++)
    {
        key a = llList2Key(av_keys, i);
        integer info = llGetAgentInfo(a);
        string anim = llGetAnimation(a);
        float score = llList2Float(av_score, i);
        float hspeed = llList2Float(cand, i * 5 + 4);
        vector hpos = llList2Vector(cand, i * 5 + 2);

        // ---- heat: carried over, halved, fed by fresh activity ----
        float heat = 0.0;
        integer hci = llListFindList(prev_tracked_keys, [a]);
        if (hci != -1)
            heat = llList2Float(prev_tracked_heat, hci) * HEAT_DECAY;
        if (has_scanned && llListFindList(prev_agents, [a]) == -1)
            heat += HEAT_NEW;            // brand new on the region: hottest
        if (hspeed >= SPEED_INTERRUPT)
        {
            heat += HEAT_MOVE;           // a mover
        }
        else
        {
            integer hli = llListFindList(prev_pos, [a]);
            if (hli != -1)
            {
                vector hlast = llList2Vector(prev_pos, hli + 1);
                if (hlast != ZERO_VECTOR && llVecDist(hpos, hlast) >= travel_need)
                    heat += HEAT_MOVE;   // teleport-ish traveller
            }
        }
        integer hchi = llListFindList(chat_keys, [a]);
        if (hchi != -1 && now - llList2Integer(chat_time, hchi) <= 10)
            heat += HEAT_SPEECH;         // spoke recently

        if (is_action_anim(anim))
            score += 3.0;
        else if (anim == "Sitting" || anim == "Sitting on Ground")
            score -= 2.0;
        if (info & AGENT_MOUSELOOK)
            score += 8.0;      // aiming something - that's action
        if (info & AGENT_TYPING)
            score += 3.0;      // about to speak
        if (info & AGENT_IN_AIR)
            score += 2.0;
        if (info & AGENT_ALWAYS_RUN)
            score += 1.0;
        if (info & AGENT_AWAY)
            score *= 0.05;     // AFK is not action
        score += heat;         // hot stars pull the camera in and hold it

        // burst: a tracked star just switched into an action animation
        if (a != target_key && PRIORITY_ACTION > cut_pri)
        {
            integer pki = llListFindList(prev_tracked_keys, [a]);
            if (pki != -1)
            {
                string olda = llList2String(prev_tracked_anim, pki);
                if (olda != "" && olda != anim && is_action_anim(anim))
                {
                    cut_pri = PRIORITY_ACTION;
                    cut_key = a;
                    cut_speed = 999.0;   // bursts outrank plain movers
                    cut_kind = "burst";
                    heat += HEAT_BURST;
                }
            }
        }
        av_score = llListReplaceList(av_score, [score], i, i);
        av_anim = llListReplaceList(av_anim, [anim], i, i);
        av_heat = llListReplaceList(av_heat, [heat], i, i);
    }

    // ---- is the star resting? (drives the early 8 s rotation) ----
    target_boring = FALSE;
    integer tci = llListFindList(cand, [target_key]);
    if (tci != -1 && llList2Float(cand, tci + 2) < BORING_SCORE)
        target_boring = TRUE;

    // ---- feed the lens: the star's heat, once a pulse (hone-in dolly) ----
    integer thi = llListFindList(av_keys, [target_key]);
    if (thi != -1)
        llMessageLinked(LINK_SET, MSG_HEAT,
                        (string)llList2Float(av_heat, thi), target_key);

    // ---- outfits: the star every pulse, plus a rotating sample ----
    integer n = llGetListLength(av_keys);
    if (n > 0)
    {
        integer checks = ATTACH_CHECKS_PER_SCAN;
        if (checks > n)
            checks = n;
        integer ti = llListFindList(av_keys, [target_key]);
        integer used = 0;
        if (ti != -1)
        {
            check_outfit(ti, now);       // the star's outfit, every pulse
            used = 1;
        }
        integer k = 0;
        while (used < checks && k < n)
        {
            integer idx = (attach_cursor + k) % n;
            if (idx != ti)
            {
                check_outfit(idx, now);
                used++;
            }
            k++;
        }
        attach_cursor = (attach_cursor + k) % n;
    }

    // ---- act on the best avatar interrupt (name looked up only now) ----
    if (cut_key != NULL_KEY && interrupt_allowed(cut_pri))
    {
        string nm = get_name(cut_key);
        string reason;
        if (cut_kind == "new")
            reason = "New star just arrived: " + nm + "!";
        else if (cut_kind == "burst")
            reason = "Cut to " + nm + " - they burst into action!";
        else
            reason = "Cut to " + nm + " - they're on the move!";
        set_target(cut_key, "avatar", reason, TRUE);
        if (DEBUG_MODE)
            llOwnerSay("Close-up on " + nm +
                       " for " + (string)((integer)ZOOM_DURATION) + "s!");
    }

    // ---- status sanity ----
    if (llGetListLength(av_keys) == 0 && llGetListLength(ob_keys) == 0)
    {
        handle_no_targets();
    }
    else if (target_key == NULL_KEY && !focus_locked)
    {
        random_target();
    }
    else if (target_kind == "object" && !focus_locked && !is_zoomed &&
             llGetListLength(av_keys) > 0)
    {
        random_target();     // stars always outrank set pieces
    }

    // drop outfit bookkeeping for avatars that left the books
    integer on = llGetListLength(outfit_keys);
    if (on > 0)
    {
        list ok2 = [];
        list oc2 = [];
        integer oi;
        for (oi = 0; oi < on; oi++)
        {
            key ak = llList2Key(outfit_keys, oi);
            if (llListFindList(av_keys, [ak]) != -1)
            {
                ok2 += [ak];
                oc2 += [llList2Integer(outfit_count, oi)];
            }
        }
        outfit_keys = ok2;
        outfit_count = oc2;
    }

    if (DEBUG_MODE)
    {
        integer nstars = llGetListLength(av_keys);
        if (nstars != last_star_count)
        {
            llOwnerSay("Tracking " + (string)nstars + " stars and " +
                       (string)llGetListLength(ob_keys) + " moving objects.");
            last_star_count = nstars;
        }
    }
}

// The camera script lost the target (left the region / detached / derezzed).
handle_target_lost(key k)
{
    if (k != target_key)
        return;                       // stale report, already re-cast
    if (focus_locked)
    {
        if (vanish_since == 0)
            vanish_since = llGetUnixTime();   // hold the frame, wait a bit
        return;
    }
    is_zoomed = FALSE;
    if (llGetListLength(av_keys) > 0)
        random_target();
    else
        give_up_target();
}

// ---------------------------------------------------------------------------
//  Status
// ---------------------------------------------------------------------------

status_report()
{
    string mode = "OFF";
    if (cinematic)
        mode = "ON";
    string t = "(none)";
    if (target_key != NULL_KEY)
        t = get_name(target_key) + " [" + target_kind + "]";
    string boring = "active";
    if (target_boring)
        boring = "resting";
    string ht = "0";
    integer hti = llListFindList(av_keys, [target_key]);
    if (hti != -1)
        ht = (string)llList2Integer(av_heat, hti);
    llOwnerSay("VIGILANT DIRECTOR " + mode +
        " | Scan: " + (string)((integer)SENSOR_INTERVAL) + "s" +
        " | Stars: " + (string)llGetListLength(av_keys) +
        " | Objects: " + (string)llGetListLength(ob_keys) +
        " | Target: " + t + " (" + boring + ", heat " + ht + ")" +
        " | Mem: " + (string)llGetFreeMemory());
}

// ---------------------------------------------------------------------------
//  Main state
// ---------------------------------------------------------------------------

default
{
    state_entry()
    {
        owner = llGetOwner();
        cinematic = FALSE;
        if (listen_hud)
            llListenRemove(listen_hud);
        listen_hud = llListen(HUD_CHANNEL, "", owner, "");
        if (listen_chat)
        {
            llListenRemove(listen_chat);
            listen_chat = 0;
        }
        llSetTimerEvent(0.0);
        llOwnerSay("Vigilant director v5.0 online. Free memory: " +
                   (string)llGetFreeMemory() + " bytes.");
        if (llGetInventoryNumber(INVENTORY_SCRIPT) < 2)
            llOwnerSay("WARNING: the camera script (vigilant-camera-hud.lsl) should be in this prim too - without it nothing gets filmed!");
    }

    on_rez(integer start_param)
    {
        owner = llGetOwner();
        // refresh listens (never stack duplicates)
        if (listen_hud)
            llListenRemove(listen_hud);
        listen_hud = llListen(HUD_CHANNEL, "", owner, "");
        // tracking data from a previous life is stale, but the agent ROSTER
        // stays valid (same keys) so nobody is misread as a new arrival
        if (cinematic)
        {
            clear_target();
            av_keys = []; av_pos = []; av_score = []; av_anim = []; av_heat = [];
            ob_keys = []; ob_pos = [];
            last_pos = [];
            dedup_keys = []; dedup_time = [];
            chat_keys = []; chat_time = [];
            known_att = []; known_att_time = [];
            outfit_keys = []; outfit_count = [];
            last_sensor = 0;
            target_boring = FALSE;
        }
        no_targets_said = FALSE;
    }

    attach(key id)
    {
        owner = llGetOwner();
        if (id == NULL_KEY)
        {
            // detached: the camera script goes quiet on its own; so do we
            power_off();
        }
    }

    changed(integer change)
    {
        if (change & CHANGED_OWNER)
        {
            llResetScript();     // cleanest hand-off to a new director
        }
        else if (change & (CHANGED_REGION | CHANGED_TELEPORT))
        {
            // old-region positions are meaningless; agent keys stay valid
            av_pos = [];
            av_score = [];
            av_anim = [];
            av_heat = [];
            ob_keys = [];
            ob_pos = [];
            last_pos = [];
            chat_keys = [];
            chat_time = [];
            dedup_keys = [];
            dedup_time = [];
            last_sensor = 0;
            last_announced = NULL_KEY;
            no_targets_said = FALSE;
            vanish_since = 0;
            target_boring = FALSE;
        }
    }

    link_message(integer sender_num, integer num, string str, key id)
    {
        // only camera-script messages (210-214) are handled here; our own
        // 220-225 messages echo back to us and are ignored on purpose
        if (num == MSG_POWER)
        {
            if (str == "1")
                power_on();
            else if (str == "0")
                power_off();
        }
        else if (num == MSG_CMD)
        {
            if (str == "NEXT")
            {
                halted = FALSE;        // a manual choice resumes a frozen camera
                cycle_target(1);
            }
            else if (str == "BACK")
            {
                halted = FALSE;
                cycle_target(-1);
            }
            else if (str == "RANDOM")
            {
                halted = FALSE;
                random_target();
            }
        }
        else if (num == MSG_FLAG)
        {
            if (str == "HALT:1")
                halted = TRUE;
            else if (str == "HALT:0")
                halted = FALSE;
            else if (str == "LOCK:1")
                focus_locked = TRUE;
            else if (str == "LOCK:0")
                focus_locked = FALSE;
            else if (str == "DEBUG:1")
                DEBUG_MODE = TRUE;
            else if (str == "DEBUG:0")
                DEBUG_MODE = FALSE;
        }
        else if (num == MSG_LOST)
        {
            handle_target_lost(id);
        }
        else if (num == MSG_DIE)
        {
            llResetScript();
        }
    }

    listen(integer channel, string name, key id, string message)
    {
        // ---- silent HUD commands ----
        if (channel == HUD_CHANNEL)
        {
            if (id != owner)
                return;
            if (message == "SCAN")
            {
                last_sensor = 0;    // force a pulse on the next tick
                llOwnerSay("Scan requested - pulse on the next tick.");
                return;
            }
            if (message == "NEXT")
            {
                halted = FALSE;
                cycle_target(1);
                return;
            }
            if (message == "BACK")
            {
                halted = FALSE;
                cycle_target(-1);
                return;
            }
            if (message == "NEXT_TARGET")
            {
                halted = FALSE;
                random_target();
                return;
            }
            if (message == "FREEZE")
            {
                halted = !halted;
                return;
            }
            if (message == "FOCUS")
            {
                if (target_key == NULL_KEY && !focus_locked)
                {
                    llOwnerSay("No target to lock onto yet.");
                    return;
                }
                focus_locked = !focus_locked;
                return;
            }
            if (message == "ONOFF")
            {
                if (cinematic)
                    power_off();
                else
                    power_on();
                return;
            }
            if (message == "TOGGLE_DEBUG")
            {
                DEBUG_MODE = !DEBUG_MODE;
                return;
            }
            if (message == "STATUS")
            {
                status_report();
                return;
            }
            if (message == "RESET")
            {
                llResetScript();
                return;
            }
            return;
        }

        // ---- nearby chatter: ANY agent in the region can steal the lens ----
        if (channel == 0)
        {
            if (!cinematic)
                return;
            if (id == owner)
                return;
            if (llListFindList(last_agents, [id]) == -1)
                return;    // objects or strangers we have not rostered yet
            integer now = llGetUnixTime();
            integer ci = llListFindList(chat_keys, [id]);
            if (ci == -1)
            {
                chat_keys += [id];
                chat_time += [now];
            }
            else
            {
                chat_time = llListReplaceList(chat_time, [now], ci, ci);
            }
            if (id == target_key)
            {
                if (RELAY_CHAT)
                    llOwnerSay(name + " says: " + message);
                if (!is_zoomed && DEBUG_MODE)
                    llOwnerSay("Close-up on " + name + " for " +
                               (string)((integer)ZOOM_DURATION) + "s - they're talking!");
                set_target(id, "avatar", "", TRUE);   // re-zoom the speaker
            }
            else if (interrupt_allowed(PRIORITY_SPEECH))
            {
                if (RELAY_CHAT)
                    llOwnerSay(name + " says: " + message);
                set_target(id, "avatar", "Cut to " + name + " - they're talking!", TRUE);
            }
            return;
        }
    }

    sensor(integer num_detected)
    {
        if (!cinematic)
        {
            ob_keys = [];
            ob_pos = [];
            return;
        }
        integer now = llGetUnixTime();
        list new_ob_keys = [];
        list new_ob_pos = [];
        integer made_cut = FALSE;
        // the director's own position, once per sweep
        vector opos = llList2Vector(llGetObjectDetails(owner, [OBJECT_POS]), 0);
        integer i;
        for (i = 0; i < num_detected; i++)
        {
            key o = llDetectedKey(i);
            vector p = llDetectedPos(i);
            if (o != llGetKey() && p != ZERO_VECTOR && llGetListLength(new_ob_keys) < MAX_OBJECTS)
            {
                new_ob_keys += [o];
                new_ob_pos += [p];
                // freshly detected + moving + near a star or the director
                // (never our own rezdings) = action prop
                if (!made_cut &&
                    llDetectedOwner(i) != owner &&
                    llListFindList(ob_keys, [o]) == -1 &&
                    llListFindList(dedup_keys, [o]) == -1)
                {
                    vector v = llDetectedVel(i);
                    if (llVecMag(v) > 0.5)
                    {
                        integer hot = FALSE;
                        if (opos != ZERO_VECTOR && llVecDist(p, opos) <= NEW_OBJECT_RADIUS)
                            hot = TRUE;
                        integer a;
                        integer n = llGetListLength(av_keys);
                        for (a = 0; a < n && !hot; a++)
                        {
                            if (llVecDist(p, llList2Vector(av_pos, a)) <= NEW_OBJECT_RADIUS)
                                hot = TRUE;
                        }
                        if (hot && interrupt_allowed(PRIORITY_PROP))
                        {
                            made_cut = TRUE;
                            dedup_keys += [o];
                            dedup_time += [now];
                            set_target(o, "object", "Action prop spotted: " + get_name(o) + "!", TRUE);
                            if (DEBUG_MODE)
                                llOwnerSay("Quick cut to " + get_name(o) + " for " +
                                           (string)((integer)ZOOM_DURATION) + "s!");
                        }
                    }
                }
            }
        }
        ob_keys = new_ob_keys;
        ob_pos = new_ob_pos;

        // nothing to film? orbit the nearest moving set piece until a star
        // arrives (the region pulse hands the lens back the moment one does)
        if (llGetListLength(av_keys) == 0 && target_key == NULL_KEY &&
            !focus_locked && llGetListLength(new_ob_keys) > 0)
        {
            key sp = llList2Key(new_ob_keys, 0);   // sensors return nearest first
            set_target(sp, "object", "Filming the set: " + get_name(sp) + "!", FALSE);
        }
    }

    no_sensor()
    {
        ob_keys = [];
        ob_pos = [];
    }

    timer()
    {
        if (!cinematic)
            return;

        integer now = llGetUnixTime();

        // ---- the region pulse ----
        if (now - last_sensor >= (integer)SENSOR_INTERVAL)
        {
            last_sensor = now;
            scan_avatars();
            if (cinematic)
                llSensor("", NULL_KEY, ACTIVE, SENSOR_RANGE, PI);
        }

        // ---- a locked target that vanished: hold 5 s, then unlock ----
        if (vanish_since != 0 && now - vanish_since > 5)
        {
            vanish_since = 0;
            focus_locked = FALSE;
            llOwnerSay("Focus target vanished - unlocking focus.");
            llMessageLinked(LINK_SET, MSG_FLAG_BACK, "LOCK:0", NULL_KEY);
            if (llGetListLength(av_keys) > 0)
                random_target();
            else
                give_up_target();
        }

        // ---- release the close-up when its time is up ----
        if (is_zoomed && now >= zoom_until)
        {
            is_zoomed = FALSE;
            if (DEBUG_MODE)
                llOwnerSay("Zooming out to the wide shot.");
            if (target_kind == "object" && !focus_locked &&
                llGetListLength(av_keys) > 0)
            {
                // worn item / prop close-up is over: back to the stars
                random_target();
            }
            else
            {
                // linger on this star (or set piece) with the flowing orbit
                last_cut = now;
                llMessageLinked(LINK_SET, MSG_ZOOMEND, "", NULL_KEY);
            }
        }

        // ---- the director's rotation: 20 s on a star, 8 s on a snoozer ----
        integer dwell_need = (integer)FOCUS_SWITCH_INTERVAL;
        if (target_boring)
            dwell_need = (integer)BORING_SWITCH_INTERVAL;
        if (!focus_locked && !halted && !is_zoomed && target_kind != "object" &&
            now - last_cut >= dwell_need &&
            llGetListLength(av_keys) > 0)
        {
            random_target();
        }
    }
}

// ============================================================================
//  NOTES: This is the DIRECTOR half of a two-script team. The camera script
//  (vigilant-camera-hud.lsl) must be in the same prim - it owns the lens,
//  the touch menu, the channel scanner and camera permission. They talk over
//  link messages with disjoint numbers (we send 220-225, handle 210-214) so
//  a message echoing back to its sender is always ignored.
//  Heat: arrivals (+18), action bursts (+15), speech (+10) and movement
//  (+8) heat a star up; heat halves every pulse, pulls hot stars onto the
//  books, biases the spotlight rotation toward them, and is reported to the
//  camera script once a second so the orbit tightens around them (STATUS
//  shows the current star's heat).
//  llGetAttachedList() (Dec 2021+ servers) finds worn items - sensors never
//  see attachments. The sensor is ACTIVE-only on purpose (moving props only,
//  no static clutter). If a packed sim makes the 1s pulse feel heavy, set
//  SENSOR_INTERVAL to 2.0 - every threshold scales itself.
//  LSL has no llMin()/llMax()/llExp(); min_ff() and llPow(EULER_E, x) (in the
//  camera script) are the stand-ins.
//  Memory: each script gets its own 64 KB Mono budget, which is why the team
//  exists - the single-script versions (v2.2, v4.0, v4.1) kept dying of
//  Stack-Heap Collision, including at boot. If the load-time "Free memory"
//  line ever drops under ~10000, lower MAX_SCAN_AGENTS / MAX_AVATARS.
// ============================================================================
