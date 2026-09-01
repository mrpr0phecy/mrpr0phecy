// ============================================================================
//  VIGILANT ACTION CAMERA HUD  v2.1.2  --  Second Life (LSL)
//  A sim-wide action camera: orbits stars with flowing cinematic moves and
//  cuts to whatever is happening - new arrivals, nearby speech, fast movers,
//  bursts into action, newly worn items, fast rezzed props (3s close-ups).
//
//  USE: put this script in the ROOT prim of a HUD attachment and wear it,
//  then touch the HUD for the menu. Camera permission is granted silently
//  while attached.
//  Menu: Next / Back / Freeze / On-Off / Lock Focus / Pan / Action / Random /
//        Debug / Text / Dir / Reset
//  Silent commands on channel -123456: NEXT, BACK, FREEZE, ONOFF, FOCUS,
//        SCAN, TOGGLE_PAN, NEXT_TARGET, TOGGLE_ACTION, TOGGLE_DEBUG,
//        TOGGLE_TEXT, TOGGLE_DIR, RESET, STATUS
//  All tunables are in the constants block below and every threshold
//  auto-scales with SENSOR_INTERVAL.
// ============================================================================

// ---------------------------------------------------------------------------
//  Tuning constants - tweak to taste
// ---------------------------------------------------------------------------
float SENSOR_INTERVAL       = 1.0;    // region scan pulse (seconds).
                                      // Raise to 2.0 in very busy regions if
                                      // you want to spend less script time.
float UPDATE_INTERVAL       = 0.1;    // camera update tick (seconds)
integer MAX_SCAN_AGENTS     = 50;     // agents fully scanned per pulse
                                      // (script-time guard for packed sims)
float SENSOR_RANGE          = 96.0;   // object sensor radius (96 m is the max)
integer MAX_AVATARS         = 16;     // stars kept on the books
integer MAX_OBJECTS         = 32;     // moving objects tracked (sensor cap)

// the director
float FOCUS_SWITCH_INTERVAL = 20.0;   // linger on an active star (seconds)
float BORING_SWITCH_INTERVAL = 8.0;   // rotate a resting star out after (s)
float BORING_SCORE          = 2.0;    // below this score a star is "resting"
float MIN_TARGET_DWELL      = 3.0;    // min seconds on a target before an
                                      // interrupt may steal it (anti-strobe)
float SPEED_INTERRUPT       = 3.0;    // m/s that counts as action (run speed+)
                                      // (teleport-style jumps are caught via
                                      //  distance covered per pulse instead)

// close-ups
float ZOOM_DURATION         = 3.0;    // static close-up hold (seconds)
float ZOOM_DISTANCE         = 2.0;    // face close-up distance (metres)
float ZOOM_HEIGHT           = 1.7;    // face close-up height (metres)
float ZOOM_OBJECT_DISTANCE  = 1.6;    // worn item / prop close-up distance
float ZOOM_OBJECT_LIFT      = 0.35;   // worn item / prop close-up lift

// orbit choreography
float PAN_SPEED_BASE        = 0.05;   // max spin (rad per update, ~28.6 deg/s)
float PAN_SPEED_AMPLITUDE   = 0.045;  // speed variation (0.005 to 0.05)
float PAN_SPEED_PERIOD      = 10.0;   // one speed cycle (seconds)
float PAN_DIRECTION_PERIOD  = 20.0;   // clockwise <-> anticlockwise (seconds)
float CAMERA_HEIGHT_BASE    = 1.5;    // crane height above the star's feet
float CAMERA_HEIGHT_AMPLITUDE = 0.5;  // crane range (+/-, so 1.0 to 2.0 m)
float HEIGHT_PERIOD         = 8.0;    // one rise/fall cycle (seconds)
float CAMERA_DISTANCE_BASE  = 5.0;    // orbit radius
float CAMERA_DISTANCE_AMPLITUDE = 1.0; // dolly range (+/-, so 4.0 to 6.0 m)
float DISTANCE_PERIOD       = 12.0;   // one in/out cycle (seconds)
float FOCUS_HEIGHT          = 1.2;    // where the spotlight beam lands (chest)

// action mode extras
float LEAD_TIME             = 0.35;   // how far ahead of velocity we focus (s)
float POS_SMOOTH_TAU        = 0.45;   // camera pursuit time constant (s)
float FOCUS_SMOOTH_TAU      = 0.15;   // focus pursuit time constant (s)
float WHIP_SMOOTH_TAU       = 0.12;   // fast catch-up right after a cut (s)
float WHIP_TIME             = 0.9;    // how long the whip lasts (s)
float SHAKE_AMP             = 0.06;   // handheld shake at full sprint (m)
float EULER_E               = 2.718281828459045; // e (LSL has no llExp();
                                      // smoothing uses llPow(EULER_E, x))

// vigilance shaping
float SCORE_REACH           = 6.0;    // metres of tracking rank that one
                                      // action-score point buys (pulls
                                      // far-away action onto the books)

// bookkeeping
integer ATTACH_CHECKS_PER_SCAN = 4;   // outfits diffed per pulse (the star
                                      // is always checked first, on top)
float NEW_OBJECT_RADIUS      = 12.0;  // "action prop" must be this near a
                                      // star or the director
float KNOWN_ATTACH_TTL       = 180.0; // remember worn items for (seconds)
float DEDUP_TTL              = 12.0;  // don't re-cut to the same thing for (s)
integer MEMORY_FLOOR         = 6000;  // free bytes before caches are shed

// toggles and channels
integer DEBUG_MODE           = FALSE; // chatter from the control room
integer FLOATING_TEXT        = FALSE; // spotlight name on the HUD prim
integer RELAY_CHAT           = TRUE;  // relay the star's chat to you
integer DIALOG_CHANNEL       = -987654;
integer HUD_CHANNEL          = -123456;

// interrupt priorities (higher wins)
integer PRIORITY_PROP   = 0;   // freshly rezzed moving object near a star
integer PRIORITY_ACTION = 1;   // mover, traveller, burst, newly worn item
integer PRIORITY_SPEECH = 2;   // someone nearby is talking
integer PRIORITY_NEW    = 3;   // a brand new arrival (headline news)

// ---------------------------------------------------------------------------
//  Globals
// ---------------------------------------------------------------------------
key owner;                        // the director (HUD wearer)

integer cam_perm = FALSE;         // PERMISSION_CONTROL_CAMERA held?
integer cinematic = FALSE;        // are we rolling?
integer pending_start = FALSE;    // start as soon as permission arrives

list av_keys;                     // tracked stars (parallel lists)
list av_pos;
list av_score;
list av_anim;                     // last known animation state per star
list ob_keys;                     // tracked moving objects (parallel lists)
list ob_pos;

list last_agents;                 // FULL agent roster from the last pulse
list last_pos;                    // parallel positions (ZERO = unknown)
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
integer target_lost = 0;          // unix time target first went missing
integer target_boring = FALSE;    // is the star resting? (early rotation)

integer focus_locked = FALSE;     // stay on this target, ignore interrupts
integer halted = FALSE;           // freeze the camera
integer panning = TRUE;           // orbit spin on/off
integer pan_direction = 1;        // 1 = clockwise, -1 = anticlockwise
integer action_mode = TRUE;       // lead-cam, whip cuts, dolly-out, shake
float   pan_angle = 0.0;          // current orbit angle

float   elapsed = 0.0;            // our own smooth-motion clock
float   last_tick = 0.0;
float   whip_until = 0.0;         // whip-pan ends at this elapsed time
float   last_dir_switch = 0.0;    // last automatic CW/CCW direction change
vector  cam_pos = ZERO_VECTOR;    // smoothed camera position
vector  cam_focus = ZERO_VECTOR;  // smoothed focus point
integer cam_init = FALSE;         // has the camera snapped to its first frame?
integer attach_cursor = 0;        // round-robin outfit-check pointer

key     last_announced = NULL_KEY; // dedup for announcements
integer no_targets_said = FALSE;   // said "no stars" already?
integer last_star_count = -1;      // for quiet count reporting
integer mem_warned = FALSE;        // low-memory warning said once?

integer listen_hud = 0;            // listen handles
integer listen_dialog = 0;
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

// Ask for camera control again if it slipped away (e.g. after a reset).
refresh_perms()
{
    if (llGetPermissionsKey() == owner && (llGetPermissions() & PERMISSION_CONTROL_CAMERA))
    {
        cam_perm = TRUE;
    }
    else
    {
        cam_perm = FALSE;
        llRequestPermissions(owner, PERMISSION_CONTROL_CAMERA);
    }
}

// Is this animation state an "action" state worth cutting to?
integer is_action_anim(string a)
{
    return (a == "Running" || a == "CrouchWalking" || a == "Striding" ||
            a == "Flying" || a == "FlyingSlow" || a == "Hovering" ||
            a == "Taking Off" || a == "Jumping" || a == "PreJumping" ||
            a == "FallingDown" || a == "Soft Landing");
}

// Smallest of two floats. (LSL has no llMin()/llMax() - this hand-rolled
// helper keeps the script compiling on every viewer and server.)
float min_ff(float a, float b)
{
    if (a < b)
        return a;
    return b;
}

// ---------------------------------------------------------------------------
//  Targets, announcements, no-targets handling
// ---------------------------------------------------------------------------

clear_target()
{
    target_key = NULL_KEY;
    target_kind = "none";
    is_zoomed = FALSE;
    target_lost = 0;
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
        if (cam_perm)
            llClearCameraParams();
        if (FLOATING_TEXT)
            llSetText("", <1.0, 1.0, 1.0>, 0.0);
        last_announced = NULL_KEY;
    }
}

// Give up on a vanished target: clear the camera and say so once.
give_up_target()
{
    clear_target();
    if (cam_perm)
        llClearCameraParams();
    if (FLOATING_TEXT)
        llSetText("", <1.0, 1.0, 1.0>, 0.0);
    if (!no_targets_said)
    {
        llOwnerSay("Lost the star - waiting for the next scan...");
        no_targets_said = TRUE;
    }
}

// Announce only when the spotlight actually changes hands.
announce_target(key id, string reason)
{
    if (id == last_announced)
        return;
    last_announced = id;
    no_targets_said = FALSE;
    llOwnerSay(reason);
    if (FLOATING_TEXT)
        llSetText("Spotlight: " + get_name(id), <1.0, 1.0, 1.0>, 1.0);
}

// Put someone/something in the spotlight.
// (Does NOT touch 'halted': an automatic zoom-release must never unfreeze a
//  camera the director froze on purpose. Manual commands clear it themselves.)
set_target(key k, string kind, string reason, integer zoom)
{
    integer changed_target = (k != target_key);
    target_key = k;
    target_kind = kind;
    last_cut = llGetUnixTime();
    target_lost = 0;
    if (zoom)
    {
        is_zoomed = TRUE;
        zoom_until = llGetUnixTime() + (integer)(ZOOM_DURATION + 0.5);
    }
    else
    {
        is_zoomed = FALSE;
    }
    if (changed_target)
    {
        pan_angle = llFrand(TWO_PI);        // fresh angle for a fresh star
        whip_until = elapsed + WHIP_TIME;   // glide there fast, then settle
    }
    if (reason != "")
        announce_target(k, reason);
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
//  Rolling / wrapping
// ---------------------------------------------------------------------------

start_cinematic()
{
    if (!cam_perm)
    {
        pending_start = TRUE;
        llOwnerSay("Requesting camera control to start cinematic mode...");
        llRequestPermissions(owner, PERMISSION_CONTROL_CAMERA);
        return;
    }
    cinematic = TRUE;
    pending_start = FALSE;
    halted = FALSE;
    llOwnerSay("Lights, camera, action! Scanning the whole region for stars and action...");
    av_keys = []; av_pos = []; av_score = []; av_anim = [];
    ob_keys = []; ob_pos = [];
    last_agents = []; last_pos = [];
    has_scanned = FALSE;
    chat_keys = []; chat_time = [];
    target_boring = FALSE;
    last_sensor = 0;                 // force an immediate pulse
    attach_cursor = 0;
    elapsed = 0.0;
    whip_until = 0.0;
    last_dir_switch = 0.0;
    last_tick = llGetTime();
    cam_init = FALSE;
    no_targets_said = FALSE;
    if (listen_chat)
        llListenRemove(listen_chat);
    listen_chat = llListen(0, "", NULL_KEY, "");   // hear all nearby chatter
    if (llGetAgentInfo(owner) & AGENT_MOUSELOOK)
        llOwnerSay("Note: scripted cameras cannot drive mouselook - leave mouselook (or press Esc) to hand the lens back to the HUD.");
    llSetTimerEvent(UPDATE_INTERVAL);
}

stop_cinematic()
{
    cinematic = FALSE;
    pending_start = FALSE;
    llSetTimerEvent(0.0);
    if (cam_perm)
        llClearCameraParams();
    if (FLOATING_TEXT)
        llSetText("", <1.0, 1.0, 1.0>, 0.0);
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
    av_keys = []; av_pos = []; av_score = []; av_anim = [];
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
    while (llGetListLength(known_att) > 128)   // hard cap, oldest first
    {
        known_att = llDeleteSubList(known_att, 0, 0);
        known_att_time = llDeleteSubList(known_att_time, 0, 0);
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

// Shed caches before the 64 KB script budget is threatened.
memory_guard()
{
    if (llGetFreeMemory() < MEMORY_FLOOR)
    {
        integer half = llGetListLength(known_att) / 2;
        if (half > 0)
        {
            known_att = llDeleteSubList(known_att, 0, half - 1);
            known_att_time = llDeleteSubList(known_att_time, 0, half - 1);
        }
        if (!mem_warned)
        {
            llOwnerSay("Low script memory - trimming caches to stay vigilant.");
            mem_warned = TRUE;
        }
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
//  The region pulse: roster, scores, interrupts, outfits
// ---------------------------------------------------------------------------

scan_avatars()
{
    integer now = llGetUnixTime();
    prune_lists(now);
    memory_guard();

    // previous pulse state (by key, so nothing depends on list order)
    list prev_tracked_keys = av_keys;
    list prev_tracked_anim = av_anim;
    list prev_agents = last_agents;
    list prev_pos = last_pos;

    // distance reference: near the camera means near the action
    vector base = cam_pos;
    if (!cam_init)
        base = llList2Vector(llGetObjectDetails(owner, [OBJECT_POS]), 0);

    // candidates: one cheap position+velocity lookup per agent
    list cand_keys = [];
    list cand_pos = [];
    list cand_score = [];
    list cand_rank = [];
    list roster = [];        // FULL agent roster for the next pulse
    list roster_pos = [];    // parallel positions (ZERO = not scanned)

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
        roster += [a];
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
                            integer li = llListFindList(prev_agents, [a]);
                            if (li != -1)
                            {
                                vector lastp = llList2Vector(prev_pos, li);
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
                cand_keys += [a];
                cand_pos += [pos];
                cand_score += [score];
                cand_rank += [llVecDist(pos, base) - min_ff(score, 15.0) * SCORE_REACH];
            }
        }
        roster_pos += [pos];
    }
    last_agents = roster;
    last_pos = roster_pos;
    has_scanned = TRUE;

    // ---- pick the tracked cast: best rank first, sentinel-mark as used ----
    av_keys = [];
    av_pos = [];
    av_score = [];
    av_anim = [];
    integer ncand = llGetListLength(cand_keys);
    integer kept = 0;
    integer done_sel = FALSE;
    while (kept < MAX_AVATARS && kept < ncand && !done_sel)
    {
        integer best = -1;
        float bestr = 0.0;
        integer j;
        for (j = 0; j < ncand; j++)
        {
            float rj = llList2Float(cand_rank, j);
            if (rj < 99998.0 && (best == -1 || rj < bestr))
            {
                bestr = rj;
                best = j;
            }
        }
        if (best == -1)
        {
            done_sel = TRUE;
        }
        else
        {
            av_keys += [llList2Key(cand_keys, best)];
            av_pos += [llList2Vector(cand_pos, best)];
            av_score += [llList2Float(cand_score, best)];
            av_anim += [""];
            cand_rank = llListReplaceList(cand_rank, [99999.0], best, best);
            kept++;
        }
    }

    // ---- enrich the cast (only 16 agents get the expensive calls) ----
    for (i = 0; i < kept; i++)
    {
        key a = llList2Key(av_keys, i);
        integer info = llGetAgentInfo(a);
        string anim = llGetAnimation(a);
        float score = llList2Float(av_score, i);
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
        av_score = llListReplaceList(av_score, [score], i, i);
        av_anim = llListReplaceList(av_anim, [anim], i, i);

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
                }
            }
        }
    }

    // ---- is the star resting? (drives the early 8 s rotation) ----
    target_boring = FALSE;
    integer tci = llListFindList(cand_keys, [target_key]);
    if (tci != -1 && llList2Float(cand_score, tci) < BORING_SCORE)
        target_boring = TRUE;

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

// ---------------------------------------------------------------------------
//  The camera itself
// ---------------------------------------------------------------------------

apply_camera()
{
    if (!cam_perm)
        return;
    llSetCameraParams([
        CAMERA_ACTIVE, TRUE,
        CAMERA_FOCUS, cam_focus,
        CAMERA_POSITION, cam_pos,
        CAMERA_FOCUS_LOCKED, TRUE,
        CAMERA_POSITION_LOCKED, TRUE,
        CAMERA_FOCUS_LAG, 0.0,
        CAMERA_POSITION_LAG, 0.0
    ]);
}

update_camera(float dt)
{
    list det = llGetObjectDetails(target_key, [OBJECT_POS, OBJECT_VELOCITY, OBJECT_ROT]);
    vector tpos = llList2Vector(det, 0);
    if (tpos == ZERO_VECTOR)
    {
        // target vanished (left the region / item detached / object removed)
        if (focus_locked)
        {
            if (target_lost == 0)
            {
                target_lost = llGetUnixTime();
            }
            else if (llGetUnixTime() - target_lost > 5)
            {
                focus_locked = FALSE;
                target_lost = 0;
                llOwnerSay("Focus target vanished - unlocking focus.");
            }
            return;    // hold the last frame while we wait
        }
        is_zoomed = FALSE;
        if (llGetListLength(av_keys) > 0)
            random_target();
        else
            give_up_target();
        return;
    }
    target_lost = 0;

    vector vel = llList2Vector(det, 1);
    rotation trot = llList2Rot(det, 2);
    float speed = llVecMag(vel);

    vector want_pos;
    vector want_focus;

    if (is_zoomed)
    {
        // ---- static close-up ----
        if (target_kind == "avatar")
        {
            vector f = llRot2Fwd(trot);
            vector flat = <f.x, f.y, 0.0>;
            if (llVecMag(flat) < 0.05)
                flat = <1.0, 0.0, 0.0>;
            else
                flat = llVecNorm(flat);
            want_focus = tpos + <0.0, 0.0, ZOOM_HEIGHT>;
            want_pos = tpos + flat * ZOOM_DISTANCE + <0.0, 0.0, ZOOM_HEIGHT - 0.15>;
        }
        else
        {
            want_focus = tpos + <0.0, 0.0, 0.05>;
            want_pos = tpos + <llCos(pan_angle), llSin(pan_angle), 0.0> * ZOOM_OBJECT_DISTANCE
                             + <0.0, 0.0, ZOOM_OBJECT_LIFT>;
        }
    }
    else
    {
        // ---- flowing orbit ----
        float radius = CAMERA_DISTANCE_BASE + CAMERA_DISTANCE_AMPLITUDE * llSin(TWO_PI * elapsed / DISTANCE_PERIOD);
        float height = CAMERA_HEIGHT_BASE + CAMERA_HEIGHT_AMPLITUDE * llSin(TWO_PI * elapsed / HEIGHT_PERIOD);
        float spin = (PAN_SPEED_BASE - PAN_SPEED_AMPLITUDE * (0.5 - 0.5 * llSin(TWO_PI * elapsed / PAN_SPEED_PERIOD))) * pan_direction;
        // alternate clockwise <-> anticlockwise for variety
        if (elapsed - last_dir_switch >= PAN_DIRECTION_PERIOD)
        {
            pan_direction = -pan_direction;
            last_dir_switch = elapsed;
        }
        if (action_mode)
        {
            // pull back and circle faster as the action speeds up
            radius = radius * (1.0 + min_ff(speed / 8.0, 1.0) * 0.5);
            spin = spin + min_ff(speed / 10.0, 1.0) * 0.03 * pan_direction;
        }
        if (panning)
        {
            pan_angle += spin * dt;
            if (pan_angle >= TWO_PI)
                pan_angle -= TWO_PI;
            else if (pan_angle < 0.0)
                pan_angle += TWO_PI;
        }
        want_focus = tpos + <0.0, 0.0, FOCUS_HEIGHT>;
        if (action_mode)
            want_focus = want_focus + vel * LEAD_TIME;   // anticipate the action
        want_pos = tpos + <llCos(pan_angle) * radius, llSin(pan_angle) * radius, height>;
    }

    // ---- smooth pursuit: whip in fast after a cut, then glide ----
    float tau = POS_SMOOTH_TAU;
    if (elapsed < whip_until)
        tau = WHIP_SMOOTH_TAU;
    float kp = 1.0 - llPow(EULER_E, -dt / tau);
    float kf = 1.0 - llPow(EULER_E, -dt / FOCUS_SMOOTH_TAU);
    if (!cam_init)
    {
        cam_pos = want_pos;
        cam_focus = want_focus;
        cam_init = TRUE;
    }
    else
    {
        cam_pos = cam_pos + (want_pos - cam_pos) * kp;
        cam_focus = cam_focus + (want_focus - cam_focus) * kf;
    }

    // ---- handheld energy on fast action ----
    if (action_mode && !is_zoomed && speed > 4.0)
    {
        float amp = min_ff(speed / 20.0, 1.0) * SHAKE_AMP;
        cam_pos = cam_pos + <llSin(elapsed * 13.0),
                              llSin(elapsed * 17.0 + 1.3),
                              llSin(elapsed * 11.0 + 2.1)> * amp;
    }

    apply_camera();
}

// ---------------------------------------------------------------------------
//  Menu, commands, status
// ---------------------------------------------------------------------------

show_dialog()
{
    string status = "Off";
    if (cinematic)
        status = "On";
    string freeze = "Freeze";
    if (halted)
        freeze = "Resume";
    string focus = "Lock Focus";
    if (focus_locked)
        focus = "Unlock Focus";
    string pan = "On";
    if (!panning)
        pan = "Off";
    string act = "On";
    if (!action_mode)
        act = "Off";
    string dbg = "Off";
    if (DEBUG_MODE)
        dbg = "On";
    string txt = "Off";
    if (FLOATING_TEXT)
        txt = "On";
    string dir = "CW";
    if (pan_direction < 0)
        dir = "CCW";
    string tname = "(none)";
    if (target_key != NULL_KEY)
        tname = get_name(target_key);
    llDialog(owner,
        "VIGILANT ACTION CAMERA\n" +
        "Status: " + status + "  |  Target: " + tname + "\n" +
        "Stars: " + (string)llGetListLength(av_keys) +
        "  |  Scan: " + (string)((integer)SENSOR_INTERVAL) + "s\n" +
        "Pan: " + pan + "  |  Action: " + act + "  |  Dir: " + dir + "\n" +
        "Debug: " + dbg + "  |  Text: " + txt,
        ["Next", "Back", freeze,
         "On/Off", focus, "Pan",
         "Action", "Random", "Debug",
         "Text", "Dir", "Reset"],
        DIALOG_CHANNEL);
}

status_report()
{
    string mode = "OFF";
    if (cinematic)
        mode = "ON";
    string t = "(none)";
    if (target_key != NULL_KEY)
        t = get_name(target_key) + " [" + target_kind + "]";
    string pan = "off";
    if (panning)
        pan = "on";
    string act = "off";
    if (action_mode)
        act = "on";
    string lk = "no";
    if (focus_locked)
        lk = "yes";
    string boring = "active";
    if (target_boring)
        boring = "resting";
    llOwnerSay("VIGILANT CAM " + mode +
        " | Scan: " + (string)((integer)SENSOR_INTERVAL) + "s" +
        " | Stars: " + (string)llGetListLength(av_keys) +
        " | Objects: " + (string)llGetListLength(ob_keys) +
        " | Target: " + t + " (" + boring + ")" +
        " | Pan: " + pan + " | Action: " + act + " | Locked: " + lk +
        " | Mem: " + (string)llGetFreeMemory());
}

handle_command(string cmd)
{
    if (cmd == "Next")
    {
        halted = FALSE;        // a manual choice resumes a frozen camera
        cycle_target(1);
    }
    else if (cmd == "Back")
    {
        halted = FALSE;
        cycle_target(-1);
    }
    else if (cmd == "Freeze" || cmd == "Resume")
    {
        halted = !halted;
        if (halted)
        {
            if (DEBUG_MODE)
                llOwnerSay("Camera frozen! Choose 'Resume' to continue.");
        }
        else
        {
            if (DEBUG_MODE)
                llOwnerSay("Camera resumed!");
        }
    }
    else if (cmd == "On/Off")
    {
        if (cinematic)
        {
            stop_cinematic();
            llOwnerSay("That's a wrap! Cinematic mode off.");
        }
        else
        {
            start_cinematic();
        }
    }
    else if (cmd == "Lock Focus" || cmd == "Unlock Focus")
    {
        if (target_key == NULL_KEY && !focus_locked)
        {
            llOwnerSay("No target to lock onto yet.");
        }
        else
        {
            focus_locked = !focus_locked;
            if (focus_locked)
            {
                string tn = get_name(target_key);
                if (DEBUG_MODE)
                    llOwnerSay("Focus locked on " + tn + " - interrupts disabled.");
            }
            else
            {
                if (DEBUG_MODE)
                    llOwnerSay("Focus unlocked - auto-switching re-enabled.");
            }
        }
    }
    else if (cmd == "Pan")
    {
        panning = !panning;
        if (DEBUG_MODE)
        {
            if (panning)
                llOwnerSay("Panning on, flowing with dynamic spins!");
            else
                llOwnerSay("Panning off, holding still!");
        }
    }
    else if (cmd == "Action")
    {
        action_mode = !action_mode;
        if (DEBUG_MODE)
        {
            if (action_mode)
                llOwnerSay("Action mode ON: lead-cam, whip cuts, speed dolly and handheld energy!");
            else
                llOwnerSay("Action mode OFF: calm, classic orbit.");
        }
    }
    else if (cmd == "Random")
    {
        halted = FALSE;
        random_target();
    }
    else if (cmd == "Debug")
    {
        DEBUG_MODE = !DEBUG_MODE;
        if (DEBUG_MODE)
            llOwnerSay("Debug mode ON: all messages will show!");
        else
            llOwnerSay("Debug mode OFF: only key messages will show.");
    }
    else if (cmd == "Text")
    {
        FLOATING_TEXT = !FLOATING_TEXT;
        if (FLOATING_TEXT)
        {
            llOwnerSay("Floating text ON: target names will hover on the HUD.");
            if (target_key != NULL_KEY)
                llSetText("Spotlight: " + get_name(target_key), <1.0, 1.0, 1.0>, 1.0);
        }
        else
        {
            llOwnerSay("Floating text OFF.");
            llSetText("", <1.0, 1.0, 1.0>, 0.0);
        }
    }
    else if (cmd == "Dir")
    {
        pan_direction = -pan_direction;
        if (DEBUG_MODE)
        {
            if (pan_direction > 0)
                llOwnerSay("Panning clockwise.");
            else
                llOwnerSay("Panning anticlockwise.");
        }
    }
    else if (cmd == "Reset")
    {
        llOwnerSay("Resetting the director's chair...");
        llResetScript();
    }
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
        if (listen_dialog)
            llListenRemove(listen_dialog);
        listen_dialog = llListen(DIALOG_CHANNEL, "", owner, "");
        if (listen_chat)
        {
            llListenRemove(listen_chat);
            listen_chat = 0;
        }
        llSetTimerEvent(0.0);
        if (!FLOATING_TEXT)
            llSetText("", <1.0, 1.0, 1.0>, 0.0);
        refresh_perms();
        llOwnerSay("Vigilant Action Camera v2.1.2 loaded! Touch the HUD for controls - 'On/Off' starts filming.");
    }

    on_rez(integer start_param)
    {
        owner = llGetOwner();
        refresh_perms();
        // refresh listens (never stack duplicates)
        if (listen_hud)
            llListenRemove(listen_hud);
        listen_hud = llListen(HUD_CHANNEL, "", owner, "");
        if (listen_dialog)
            llListenRemove(listen_dialog);
        listen_dialog = llListen(DIALOG_CHANNEL, "", owner, "");
        // tracking data from a previous life is stale, but the agent ROSTER
        // stays valid (same keys) so nobody is misread as a new arrival
        if (cinematic)
        {
            clear_target();
            av_keys = []; av_pos = []; av_score = []; av_anim = [];
            ob_keys = []; ob_pos = [];
            last_pos = [];
            dedup_keys = []; dedup_time = [];
            chat_keys = []; chat_time = [];
            known_att = []; known_att_time = [];
            outfit_keys = []; outfit_count = [];
            last_sensor = 0;
            cam_init = FALSE;
            target_boring = FALSE;
        }
        no_targets_said = FALSE;
    }

    attach(key id)
    {
        if (id != NULL_KEY)
        {
            owner = llGetOwner();
            refresh_perms();     // camera control is auto-granted while worn
        }
        else
        {
            // detached: camera control is revoked by the sim; go quiet
            cinematic = FALSE;
            pending_start = FALSE;
            llSetTimerEvent(0.0);
            if (listen_chat)
            {
                llListenRemove(listen_chat);
                listen_chat = 0;
            }
            clear_target();
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
            cam_init = FALSE;
            target_lost = 0;
            target_boring = FALSE;
            refresh_perms();   // the viewer resets the camera on teleport;
                               // the 0.1 s loop re-asserts it from here on
        }
    }

    run_time_permissions(integer perm)
    {
        if (perm & PERMISSION_CONTROL_CAMERA)
        {
            cam_perm = TRUE;
            if (DEBUG_MODE)
                llOwnerSay("Camera control granted!");
            if (pending_start && !cinematic)
            {
                pending_start = FALSE;
                start_cinematic();
            }
        }
        else
        {
            cam_perm = FALSE;
            pending_start = FALSE;
            if (cinematic)
                stop_cinematic();
            llOwnerSay("Camera permission not granted - the HUD needs to be worn to direct your camera.");
        }
    }

    touch_start(integer total_number)
    {
        if (llDetectedKey(0) == owner)
        {
            if (!cam_perm)
                refresh_perms();
            show_dialog();
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
            string c = "";
            if (message == "TOGGLE_PAN")
                c = "Pan";
            else if (message == "NEXT_TARGET")
                c = "Random";
            else if (message == "NEXT")
                c = "Next";
            else if (message == "BACK")
                c = "Back";
            else if (message == "FREEZE")
                c = "Freeze";
            else if (message == "ONOFF")
                c = "On/Off";
            else if (message == "FOCUS")
                c = "Lock Focus";
            else if (message == "TOGGLE_ACTION")
                c = "Action";
            else if (message == "TOGGLE_DEBUG")
                c = "Debug";
            else if (message == "TOGGLE_TEXT")
                c = "Text";
            else if (message == "TOGGLE_DIR")
                c = "Dir";
            else if (message == "RESET")
                c = "Reset";
            else if (message == "STATUS")
                status_report();
            if (c != "")
                handle_command(c);
            return;
        }

        // ---- dialog menu ----
        if (channel == DIALOG_CHANNEL)
        {
            if (id != owner)
                return;
            handle_command(message);
            if (message != "Reset")
                show_dialog();      // keep the menu up, machinima-style
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
                is_zoomed = TRUE;
                zoom_until = now + (integer)(ZOOM_DURATION + 0.5);
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

        if (!cam_perm)
        {
            llOwnerSay("Camera control lost - stopping. Touch the HUD to try again.");
            stop_cinematic();
            return;
        }

        // ---- our own clock for smooth motion ----
        float now_t = llGetTime();
        if (now_t > 604800.0)       // weekly precision refresh
        {
            llResetTime();
            now_t = llGetTime();
            last_tick = now_t;
        }
        float dt = now_t - last_tick;
        last_tick = now_t;
        if (dt <= 0.0)
            dt = 0.05;
        if (dt > 0.5)
            dt = 0.5;
        elapsed += dt;

        integer now = llGetUnixTime();

        // ---- the 1-second region pulse ----
        if (now - last_sensor >= (integer)SENSOR_INTERVAL)
        {
            last_sensor = now;
            scan_avatars();
            if (cinematic)
                llSensor("", NULL_KEY, ACTIVE, SENSOR_RANGE, PI);
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

        // ---- aim the camera ----
        if (target_key != NULL_KEY && !halted)
            update_camera(dt);
    }
}

// ============================================================================
//  NOTES: llGetAttachedList() (Dec 2021+ servers) finds worn items - sensors
//  never see attachments. The sensor is ACTIVE-only on purpose (moving props
//  only, no static clutter). If a packed sim makes the 1s pulse feel heavy,
//  set SENSOR_INTERVAL to 2.0 - every threshold scales itself.
//  LSL has no llMin()/llMax()/llExp(); min_ff() and llPow(EULER_E, x) are
//  the stand-ins. Scripted cameras cannot run in mouselook and are silently
//  overridden while you hold Alt-cam (free camera) - press Esc to hand the
//  lens back to the HUD.
// ============================================================================
