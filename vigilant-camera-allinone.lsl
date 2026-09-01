// ============================================================================
//  VIGILANT ACTION CAMERA HUD  v4.0  --  Second Life (LSL)
//  All-in-one edition. A sim-wide action camera: orbits stars with flowing
//  cinematic moves and cuts to whatever is happening - new arrivals, nearby
//  speech, fast movers, people bursting into action. Also includes a channel
//  scanner that relays nearby chat spoken on other channels.
//
//  USE: put this script in the ROOT prim of a HUD attachment and wear it,
//  then touch the HUD for the menu. Camera permission is granted silently
//  while attached.
//  Menu: Next / Back / Freeze / On-Off / Lock Focus / Pan / Action / Random /
//        Scanner / Debug / Text / Reset
//  Silent commands on channel -123456: NEXT, BACK, FREEZE, ONOFF, FOCUS,
//        SCAN, STATUS, TOGGLE_PAN, TOGGLE_DIR, NEXT_TARGET, TOGGLE_ACTION,
//        TOGGLE_DEBUG, TOGGLE_TEXT, TOGGLE_SCANNER, RESET
//
//  MEMORY NOTE: one script = one 64 KB Mono budget. To make the all-in-one
//  fit, the outfit-watch and prop-spotting features of the old two-script
//  edition are trimmed away. If the load-time "Free memory" line shows a
//  healthy number you can raise MAX_SCAN_AGENTS / MAX_AVATARS.
// ============================================================================

// ---------------------------------------------------------------------------
//  Tuning constants - tweak to taste
// ---------------------------------------------------------------------------
float SENSOR_INTERVAL       = 1.0;    // region scan pulse (seconds)
float UPDATE_INTERVAL       = 0.1;    // camera update tick (seconds)
integer MAX_SCAN_AGENTS     = 28;     // agents fully scanned per pulse
integer MAX_AVATARS         = 10;     // stars kept on the books

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

// orbit choreography
float PAN_SPEED_BASE        = 0.05;   // max spin (rad per update)
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
                                      // action-score point buys

// channel scanner
integer SPY_MODE            = TRUE;   // relay chat heard on other channels
integer SCAN_CH_MIN         = 1;      // first channel scanned
integer SCAN_CH_MAX         = 24;     // last channel scanned (the script
                                      // holds one listen per channel; LSL
                                      // allows 65 listens per script, the
                                      // range is clamped to 60 for safety)

// bookkeeping
integer MEMORY_FLOOR        = 15000;  // free bytes before caches are shed

// toggles and channels
integer DEBUG_MODE          = FALSE;  // chatter from the control room
integer FLOATING_TEXT       = FALSE;  // spotlight name on the HUD prim
integer RELAY_CHAT          = TRUE;   // relay the star's chat to you
integer DIALOG_CHANNEL      = -987654;
integer HUD_CHANNEL         = -123456;

// interrupt priorities (higher wins)
integer PRIORITY_ACTION     = 1;      // mover, traveller, burst
integer PRIORITY_SPEECH     = 2;      // someone nearby is talking
integer PRIORITY_NEW        = 3;      // a brand new arrival (headline news)

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

list last_agents;                 // FULL agent roster from the last pulse
list last_pos;                    // strided [key, pos] of scanned agents
integer has_scanned = FALSE;      // completed at least one pulse?

list chat_keys;                   // recent speakers (for scoring bonus)
list chat_time;

key    target_key  = NULL_KEY;    // who is in the spotlight
integer is_zoomed  = FALSE;       // holding a static close-up?
integer zoom_until = 0;           // unix time the close-up ends
integer last_cut   = 0;           // unix time of the last target change
integer last_sensor = 0;          // unix time of the last region pulse
integer target_boring = FALSE;    // is the star resting? (early rotation)
integer target_lost = 0;          // unix time target first went missing

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

key     last_announced = NULL_KEY; // dedup for announcements
integer no_targets_said = FALSE;   // said "no stars" already?
integer last_star_count = -1;      // for quiet count reporting
integer mem_warned = FALSE;        // low-memory warning said once?

list    spy_handles;               // scanner listen handles
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

// ---------------------------------------------------------------------------
//  Targets, announcements, no-targets handling
// ---------------------------------------------------------------------------

clear_target()
{
    target_key = NULL_KEY;
    is_zoomed = FALSE;
    target_lost = 0;
}

handle_no_targets()
{
    if (llGetListLength(av_keys) == 0)
    {
        if (!no_targets_said)
        {
            llOwnerSay("No stars in sight - waiting for the next scan...");
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

// Put someone in the spotlight.
// (Does NOT touch 'halted': an automatic zoom-release must never unfreeze a
//  camera the director froze on purpose. Manual commands clear it themselves.)
set_target(key k, string reason, integer zoom)
{
    integer changed_target = (k != target_key);
    target_key = k;
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
//   NEW    : immediately (>= 1 s dwell), breaks any close-up
//   SPEECH : after MIN_TARGET_DWELL, may steal a close-up
//   ACTION : after MIN_TARGET_DWELL, never breaks a close-up
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
        if (is_zoomed && priority < PRIORITY_SPEECH)
            return FALSE;                 // only speech breaks a close-up
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
    set_target(k, "Spotlight on: " + get_name(k) + "!", FALSE);
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
    set_target(k, "Spotlight on: " + get_name(k) + "!", FALSE);
}

// ---------------------------------------------------------------------------
//  Channel scanner: relay chat spoken on other channels
// ---------------------------------------------------------------------------
// LSL has no "listen to every channel" call - a script must hold one listen
// per channel (65 listens max per script). Typed /N chat is heard within
// normal say range (20 m); llRegionSay on a scanned channel is heard
// region-wide. IMs and group chat can never be heard by any script.

spy_on()
{
    if (llGetListLength(spy_handles) > 0)
        return;                         // already listening
    integer lo = SCAN_CH_MIN;
    integer hi = SCAN_CH_MAX;
    if (hi < lo)
        hi = lo;
    if (hi - lo > 59)                   // keep well under the 65-listen cap
        hi = lo + 59;
    integer ch;
    for (ch = lo; ch <= hi; ch++)
        spy_handles += [llListen(ch, "", NULL_KEY, "")];
}

spy_off()
{
    integer n = llGetListLength(spy_handles);
    integer i;
    for (i = 0; i < n; i++)
        llListenRemove(llList2Integer(spy_handles, i));
    spy_handles = [];
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
    llOwnerSay("Rolling! Scanning the whole region for stars and action...");
    av_keys = []; av_pos = []; av_score = []; av_anim = [];
    last_agents = []; last_pos = [];
    has_scanned = FALSE;
    chat_keys = []; chat_time = [];
    target_boring = FALSE;
    last_sensor = 0;                 // force an immediate pulse
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
        llOwnerSay("Leave mouselook (or press Esc) - scripted cameras cannot drive it.");
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
    last_agents = []; last_pos = [];
    has_scanned = FALSE;
    chat_keys = []; chat_time = [];
}

// ---------------------------------------------------------------------------
//  Bookkeeping (prune stale memory so lists stay small)
// ---------------------------------------------------------------------------

prune_lists(integer now)
{
    list k2 = [];
    list t2 = [];
    integer n = llGetListLength(chat_keys);
    integer i;
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
        if (llGetListLength(chat_keys) > 0)
        {
            chat_keys = [];
            chat_time = [];
        }
        if (!mem_warned)
        {
            llOwnerSay("Low script memory (" + (string)free_mem +
                       " bytes free) - trimming caches.");
            mem_warned = TRUE;
        }
    }
    if (free_mem < 9000)
    {
        last_pos = [];    // critical: drop the movement history too
    }
}

// ---------------------------------------------------------------------------
//  The region pulse: roster, scores, interrupts
// ---------------------------------------------------------------------------

scan_avatars()
{
    integer now = llGetUnixTime();
    prune_lists(now);
    memory_guard();

    // previous pulse state (by key, so nothing depends on list order)
    list prev_agents = last_agents;
    list prev_pos = last_pos;
    list prev_tracked_keys = av_keys;
    list prev_tracked_anim = av_anim;

    // distance reference: near the camera means near the action
    vector base = cam_pos;
    if (!cam_init)
        base = llList2Vector(llGetObjectDetails(owner, [OBJECT_POS]), 0);

    // candidates as one strided list: [rank, key, pos, score] per agent
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
                cand += [llVecDist(pos, base) - min_ff(score, 15.0) * SCORE_REACH, a, pos, score];
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
    cand = llListSort(cand, 4, TRUE);
    integer kept = llGetListLength(cand) / 4;
    if (kept > MAX_AVATARS)
        kept = MAX_AVATARS;
    for (i = 0; i < kept; i++)
    {
        av_keys += [llList2Key(cand, i * 4 + 1)];
        av_pos += [llList2Vector(cand, i * 4 + 2)];
        av_score += [llList2Float(cand, i * 4 + 3)];
        av_anim += [""];
    }

    // ---- enrich the cast (only the tracked stars get the expensive calls) ----
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
    integer ti = llListFindList(av_keys, [target_key]);
    if (ti != -1 && llList2Float(av_score, ti) < BORING_SCORE)
        target_boring = TRUE;

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
        set_target(cut_key, reason, TRUE);
    }

    // ---- status sanity ----
    if (llGetListLength(av_keys) == 0)
    {
        handle_no_targets();
    }
    else if (target_key == NULL_KEY && !focus_locked)
    {
        random_target();
    }

    if (DEBUG_MODE)
    {
        integer nstars = llGetListLength(av_keys);
        if (nstars != last_star_count)
        {
            llOwnerSay("Tracking " + (string)nstars + " stars.");
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
        // target vanished (left the region)
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
        // ---- static close-up: in front of the face ----
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
    string spy = "On";
    if (!SPY_MODE)
        spy = "Off";
    string dbg = "Off";
    if (DEBUG_MODE)
        dbg = "On";
    string txt = "Off";
    if (FLOATING_TEXT)
        txt = "On";
    string tname = "(none)";
    if (target_key != NULL_KEY)
        tname = get_name(target_key);
    llDialog(owner,
        "VIGILANT ACTION CAMERA v4\n" +
        "Status: " + status + "  |  Target: " + tname + "\n" +
        "Pan: " + pan + "  |  Action: " + act + "  |  Scanner: " + spy + "\n" +
        "Debug: " + dbg + "  |  Text: " + txt,
        ["Next", "Back", freeze,
         "On/Off", focus, "Pan",
         "Action", "Random", "Scanner",
         "Debug", "Text", "Reset"],
        DIALOG_CHANNEL);
}

status_report()
{
    string mode = "OFF";
    if (cinematic)
        mode = "ON";
    string t = "(none)";
    if (target_key != NULL_KEY)
        t = get_name(target_key);
    string pan = "off";
    if (panning)
        pan = "on";
    string act = "off";
    if (action_mode)
        act = "on";
    string spy = "off";
    if (SPY_MODE)
        spy = "on";
    string lk = "no";
    if (focus_locked)
        lk = "yes";
    llOwnerSay("VIGILANT " + mode +
        " | Stars: " + (string)llGetListLength(av_keys) +
        " | Target: " + t +
        " | Pan: " + pan + " | Action: " + act + " | Scanner: " + spy +
        " | Locked: " + lk +
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
        if (DEBUG_MODE)
        {
            if (halted)
                llOwnerSay("Camera frozen!");
            else
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
            if (DEBUG_MODE)
            {
                if (focus_locked)
                    llOwnerSay("Focus locked on " + get_name(target_key) + ".");
                else
                    llOwnerSay("Focus unlocked.");
            }
        }
    }
    else if (cmd == "Pan")
    {
        panning = !panning;
        if (DEBUG_MODE)
        {
            if (panning)
                llOwnerSay("Panning on!");
            else
                llOwnerSay("Panning off!");
        }
    }
    else if (cmd == "Action")
    {
        action_mode = !action_mode;
        if (DEBUG_MODE)
        {
            if (action_mode)
                llOwnerSay("Action mode ON!");
            else
                llOwnerSay("Action mode OFF.");
        }
    }
    else if (cmd == "Random")
    {
        halted = FALSE;
        random_target();
    }
    else if (cmd == "Scanner")
    {
        SPY_MODE = !SPY_MODE;
        if (SPY_MODE)
        {
            spy_on();
            llOwnerSay("Scanner ON: channels " + (string)SCAN_CH_MIN + "-" +
                       (string)SCAN_CH_MAX + " (about 20 m range).");
        }
        else
        {
            spy_off();
            llOwnerSay("Scanner OFF.");
        }
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
        spy_off();                  // never stack duplicate listens
        if (SPY_MODE)
            spy_on();
        refresh_perms();
        llOwnerSay("Vigilant Action Camera v4.0 loaded! Free memory: " +
                   (string)llGetFreeMemory() +
                   " bytes. Touch the HUD for controls - 'On/Off' starts filming.");
        if (SPY_MODE)
            llOwnerSay("Scanner ON: channels " + (string)SCAN_CH_MIN + "-" +
                       (string)SCAN_CH_MAX + ".");
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
        spy_off();
        if (SPY_MODE)
            spy_on();
        // tracking data from a previous life is stale, but the agent ROSTER
        // stays valid (same keys) so nobody is misread as a new arrival
        if (cinematic)
        {
            clear_target();
            av_keys = []; av_pos = []; av_score = []; av_anim = [];
            last_pos = [];
            chat_keys = []; chat_time = [];
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
            last_pos = [];
            chat_keys = [];
            chat_time = [];
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
            if (message == "TOGGLE_DIR")
            {
                pan_direction = -pan_direction;
                return;
            }
            if (message == "STATUS")
            {
                status_report();
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
            else if (message == "TOGGLE_SCANNER")
                c = "Scanner";
            else if (message == "RESET")
                c = "Reset";
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
                is_zoomed = TRUE;    // the star is talking: hold the close-up
                zoom_until = now + (integer)(ZOOM_DURATION + 0.5);
            }
            else if (interrupt_allowed(PRIORITY_SPEECH))
            {
                if (RELAY_CHAT)
                    llOwnerSay(name + " says: " + message);
                set_target(id, "Cut to " + name + " - they're talking!", TRUE);
            }
            return;
        }

        // ---- channel scanner: any other channel we hold a listen on ----
        if (SPY_MODE)
            llOwnerSay("[ch " + (string)channel + "] " + name + ": " + message);
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
        }

        // ---- release the close-up when its time is up ----
        if (is_zoomed && now >= zoom_until)
        {
            is_zoomed = FALSE;
            if (DEBUG_MODE)
                llOwnerSay("Zooming out to the wide shot.");
            last_cut = now;         // linger with the flowing orbit
        }

        // ---- the director's rotation: 20 s on a star, 8 s on a snoozer ----
        integer dwell_need = (integer)FOCUS_SWITCH_INTERVAL;
        if (target_boring)
            dwell_need = (integer)BORING_SWITCH_INTERVAL;
        if (!focus_locked && !halted && !is_zoomed &&
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
//  NOTES: All-in-one edition - one script, one 64 KB Mono budget. The
//  outfit-watch (new item worn) and action-prop features were trimmed to
//  make it fit; the two-script v3.0 edition (vigilant-camera-director.lsl +
//  vigilant-camera-hud.lsl) still has them if you ever want them back.
//  Channel scanner: LSL cannot listen to "every" channel - this script holds
//  one listen per channel from SCAN_CH_MIN to SCAN_CH_MAX (65-listen cap per
//  script, range auto-clamped to 60). Typed /N chat is heard within normal
//  say range (~20 m); llRegionSay on a scanned channel is heard region-wide;
//  IMs, group chat and object link messages can never be heard by a script.
//  LSL has no llMin()/llMax()/llExp(); min_ff() and llPow(EULER_E, x) are
//  the stand-ins. Scripted cameras cannot run in mouselook and are silently
//  overridden while you hold Alt-cam (free camera) - press Esc to hand the
//  lens back to the HUD. If the load-time "Free memory" line drops under
//  ~10000, lower MAX_SCAN_AGENTS / MAX_AVATARS.
// ============================================================================
