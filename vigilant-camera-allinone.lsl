// ============================================================================
//  VIGILANT ACTION CAMERA HUD  v6.1  --  Second Life (LSL)
//  SLIM SINGLE-SCRIPT EDITION. One script, one 64 KB Mono budget. Earlier
//  single-script builds (v2.2, v4.0, v4.1) died of Stack-Heap Collision, so
//  this one was rebuilt lean on purpose: same brain, less bulk.
//
//  What it does: a sim-wide action camera that orbits stars with flowing
//  moves and snap-zooms to whatever is happening - new arrivals, nearby
//  speech, fast movers, people bursting into action, and stars who put on
//  or take off attachments (clothing watcher). New activity builds HEAT:
//  a hot star wins the spotlight and the camera physically tightens its
//  orbit around them until they cool off. Also includes a channel scanner
//  that relays nearby chat spoken on other channels and reports which
//  channels are busiest.
//
//  USE: put this script in the ROOT prim of a HUD attachment and wear it,
//  then touch the HUD for the menu. Camera permission is granted silently
//  while attached.
//  Menu: Next / Back / Freeze / On-Off / Lock Focus / Pan / Action / Random /
//        Scanner / Reset
//  Silent commands on channel -123456: NEXT, BACK, FREEZE, ONOFF, FOCUS,
//        STATUS, CHANNELS, NEXT_TARGET, TOGGLE_PAN, TOGGLE_ACTION,
//        TOGGLE_SCANNER, RESET
//
//  Clothing watcher limits (Second Life itself, not this script): it sees
//  prim attachments (collars, shoes, hair, worn outfits) via
//  llGetAttachedList - no script can see another avatar's system clothing
//  layers, and HUD attachments are never reported by design. A same-pulse
//  one-for-one swap can slip by unnoticed.
//  What was trimmed to fit one script: whip-pan and handheld-shake polish,
//  floating text, debug chatter, prop spotting. The full-fat edition is the
//  v5.0 two-script team (vigilant-camera-director.lsl +
//  vigilant-camera-hud.lsl).
//  NOTE: scripted cameras cannot run in mouselook and are overridden while
//  you hold Alt-cam - press Esc to hand the lens back to the HUD. In
//  no-script parcels/regions the HUD freezes with every other script - the
//  viewer's own Alt-click camera still works there.
// ============================================================================

// ---------------------------------------------------------------------------
//  Tuning constants - tweak to taste
// ---------------------------------------------------------------------------
float SENSOR_INTERVAL       = 1.0;    // region scan pulse (seconds)
float UPDATE_INTERVAL       = 0.1;    // camera update tick (seconds)
integer MAX_SCAN_AGENTS     = 12;     // agents fully scanned per pulse
integer MAX_AVATARS         = 6;      // stars kept on the books
                                      // (if the boot "Free memory" line is
                                      // healthy you can raise both numbers)

// the director
float FOCUS_SWITCH_INTERVAL = 20.0;   // linger on an active star (seconds)
float BORING_SWITCH_INTERVAL = 8.0;   // rotate a resting star out after (s)
float BORING_SCORE          = 2.0;    // below this score a star is "resting"
float MIN_TARGET_DWELL      = 3.0;    // min seconds on a target before an
                                      // interrupt may steal it (anti-strobe)
float SPEED_INTERRUPT       = 3.0;    // m/s that counts as action (run speed+)

// new-activity heat (hone in on fresh action)
float HEAT_NEW              = 18.0;   // a star just arrived on the region
float HEAT_BURST            = 15.0;   // just switched into an action anim
float HEAT_SPEECH           = 10.0;   // spoke within the last 10 s
float HEAT_MOVE             = 8.0;    // currently a mover / traveller
float HEAT_OUTFIT           = 12.0;   // put on / took off an attachment
float HEAT_DECAY            = 0.5;    // heat halves every pulse
float HEAT_CAP              = 15.0;   // heat treated as "max hot" for dolly
float HEAT_DOLLY            = 0.35;   // fraction the orbit tightens when hot

// clothing watcher
integer ATTACH_CHECKS_PER_SCAN = 2;   // extra outfits diffed per pulse (the
                                      // star is always checked first, on top)

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
float EULER_E               = 2.718281828459045; // e (LSL has no llExp();
                                      // smoothing uses llPow(EULER_E, x))

// vigilance shaping
float SCORE_REACH           = 6.0;    // metres of tracking rank that one
                                      // action-score point buys

// channel scanner
integer SPY_MODE            = TRUE;   // relay chat heard on other channels
list   SPY_EXTRA            = [665, 666, 667, -666];  // always-on channels
integer SCAN_CH_MIN         = 1;      // positive block: always listened
integer SCAN_CH_MAX         = 33;
integer NEG_SCAN_MIN        = -33;    // negative block: listened through a
integer NEG_SCAN_MAX        = -1;     // rotating window (LSL caps a script
integer NEG_BATCH           = 17;     // at 65 simultaneous listens; extras +
float   SWEEP_DWELL         = 10.0;   // positives + one window + the three
                                      // camera channels stay safely under)
integer CHAN_LOG_CAP        = 12;     // channels tracked in the activity log
integer CHAN_TTL            = 600;    // log entries expire after (seconds)

// bookkeeping
integer MEMORY_FLOOR        = 15000;  // free bytes before caches are shed

// toggles and channels
integer RELAY_CHAT          = TRUE;   // relay the star's chat to you
integer DIALOG_CHANNEL      = -987654;
integer HUD_CHANNEL         = -123456;

// interrupt priorities (higher wins)
integer PRIORITY_ACTION     = 1;      // mover, traveller, burst, outfit
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
list av_heat;                     // new-activity heat per tracked star

list last_agents;                 // FULL agent roster from the last pulse
list last_pos;                    // strided [key, pos] of scanned agents
integer has_scanned = FALSE;      // completed at least one pulse?

list chat_keys;                   // recent speakers (for scoring bonus)
list chat_time;

list outfit_keys;                 // per-star attachment counts (parallel)
list outfit_count;                // a changed count = something put on/off
integer attach_cursor = 0;        // round-robin outfit-check pointer

key     target_key  = NULL_KEY;    // who is in the spotlight
integer is_zoomed  = FALSE;        // holding a static close-up?
integer zoom_until = 0;            // unix time the close-up ends
integer last_cut   = 0;            // unix time of the last target change
integer last_sensor = 0;           // unix time of the last region pulse
integer target_boring = FALSE;     // is the star resting? (early rotation)

integer focus_locked = FALSE;     // stay on this target, ignore interrupts
integer halted = FALSE;           // freeze the camera
integer panning = TRUE;           // orbit spin on/off
integer pan_direction = 1;        // 1 = clockwise, -1 = anticlockwise
integer action_mode = TRUE;       // speed dolly, lead-cam focus, fast spin
float   pan_angle = 0.0;          // current orbit angle

float   elapsed = 0.0;            // our own smooth-motion clock
float   last_tick = 0.0;
float   last_dir_switch = 0.0;    // last automatic CW/CCW direction change
vector  cam_pos = ZERO_VECTOR;    // smoothed camera position
vector  cam_focus = ZERO_VECTOR;  // smoothed focus point
integer cam_init = FALSE;         // has the camera snapped to its first frame?

key     last_announced = NULL_KEY; // dedup for announcements
integer no_targets_said = FALSE;   // said "no stars" already?
integer mem_warned = FALSE;        // low-memory warning said once?

list    spy_handles;               // scanner: fixed listen handles
list    neg_handles;               // scanner: rotating window handles
integer neg_cursor = 0;            // first channel of the current window
integer last_sweep = 0;            // unix time of the last window rotation
list    chan_log_ch;               // channel activity log (parallel lists)
list    chan_log_ct;
list    chan_log_tm;
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
//  Channel scanner: relay chat spoken on other channels + activity hunting
// ---------------------------------------------------------------------------
// LSL has no "listen to every channel" call - a script must hold one listen
// per channel (65 listens max per script, and the camera needs three of
// them). So: the extras and the positive block are always on, and the
// negative block rotates through windows every SWEEP_DWELL seconds. Every
// channel that produces traffic is logged; first traffic is announced, and
// the CHANNELS command ranks the busiest channels so you can pin your
// favourites in SPY_EXTRA. Typed /N chat is heard within normal say range
// (20 m); llRegionSay on a scanned channel is heard region-wide. IMs and
// group chat can never be heard by any script.

// Open the rotating negative window starting at neg_cursor.
spy_window()
{
    integer i;
    for (i = 0; i < llGetListLength(neg_handles); i++)
        llListenRemove(llList2Integer(neg_handles, i));
    neg_handles = [];
    integer ch = neg_cursor;
    integer opened = 0;
    while (ch <= NEG_SCAN_MAX && opened < NEG_BATCH)
    {
        if (llListFindList(SPY_EXTRA, [ch]) == -1)   // never double-listen
        {
            neg_handles += [llListen(ch, "", NULL_KEY, "")];
            opened++;
        }
        ch++;
    }
}

spy_on()
{
    if (llGetListLength(spy_handles) > 0)
        return;                         // fixed block already up
    integer i;
    for (i = 0; i < llGetListLength(SPY_EXTRA); i++)
        spy_handles += [llListen(llList2Integer(SPY_EXTRA, i), "", NULL_KEY, "")];
    for (i = SCAN_CH_MIN; i <= SCAN_CH_MAX; i++)
        spy_handles += [llListen(i, "", NULL_KEY, "")];
    neg_cursor = NEG_SCAN_MIN;
    spy_window();
}

// Rotate the negative window (called from the timer, even while idle).
spy_rotate()
{
    neg_cursor += NEG_BATCH;
    if (neg_cursor > NEG_SCAN_MAX)
        neg_cursor = NEG_SCAN_MIN;
    spy_window();
}

spy_off()
{
    integer i;
    for (i = 0; i < llGetListLength(spy_handles); i++)
        llListenRemove(llList2Integer(spy_handles, i));
    spy_handles = [];
    for (i = 0; i < llGetListLength(neg_handles); i++)
        llListenRemove(llList2Integer(neg_handles, i));
    neg_handles = [];
    neg_cursor = NEG_SCAN_MIN;
}

// Timer speed: fast while filming, slow sweep tick while only scanning.
apply_tick_rate()
{
    if (cinematic)
        llSetTimerEvent(UPDATE_INTERVAL);
    else if (SPY_MODE)
        llSetTimerEvent(1.0);
    else
        llSetTimerEvent(0.0);
}

// Log one message on a channel; announce channels the first time they go live.
spy_log(integer channel)
{
    integer now = llGetUnixTime();
    integer li = llListFindList(chan_log_ch, [channel]);
    if (li != -1)
    {
        chan_log_ct = llListReplaceList(chan_log_ct,
                       [llList2Integer(chan_log_ct, li) + 1], li, li);
        chan_log_tm = llListReplaceList(chan_log_tm, [now], li, li);
        return;
    }
    // new channel: make room if the log is full (drop the stalest entry)
    if (llGetListLength(chan_log_ch) >= CHAN_LOG_CAP)
    {
        integer n = llGetListLength(chan_log_ch);
        integer worst = 0;
        integer i;
        for (i = 1; i < n; i++)
        {
            if (llList2Integer(chan_log_tm, i) < llList2Integer(chan_log_tm, worst))
                worst = i;
        }
        chan_log_ch = llDeleteSubList(chan_log_ch, worst, worst);
        chan_log_ct = llDeleteSubList(chan_log_ct, worst, worst);
        chan_log_tm = llDeleteSubList(chan_log_tm, worst, worst);
    }
    chan_log_ch += [channel];
    chan_log_ct += [1];
    chan_log_tm += [now];
    llOwnerSay("Channel " + (string)channel + " is active.");
}

// Report the busiest channels seen recently.
channel_report()
{
    integer n = llGetListLength(chan_log_ch);
    if (n == 0)
    {
        llOwnerSay("No channel activity logged yet.");
        return;
    }
    list s = [];                     // [count, channel] pairs, busiest first
    integer i;
    for (i = 0; i < n; i++)
        s += [llList2Integer(chan_log_ct, i), llList2Integer(chan_log_ch, i)];
    s = llListSort(s, 2, FALSE);
    integer top = n;
    if (top > 8)
        top = 8;
    string msg = "Active channels:";
    for (i = 0; i < top; i++)
        msg += " ch " + (string)llList2Integer(s, i * 2 + 1) +
               " (x" + (string)llList2Integer(s, i * 2) + ")";
    llOwnerSay(msg);
}

scanner_status()
{
    string extras = "";
    integer ei;
    for (ei = 0; ei < llGetListLength(SPY_EXTRA); ei++)
    {
        if (ei > 0)
            extras += "/";
        extras += (string)llList2Integer(SPY_EXTRA, ei);
    }
    llOwnerSay("Scanner: " + (string)SCAN_CH_MIN + "-" + (string)SCAN_CH_MAX +
               " + " + extras + " always on; " + (string)NEG_SCAN_MIN + ".." +
               (string)NEG_SCAN_MAX + " rotating every " +
               (string)((integer)SWEEP_DWELL) +
               "s. Say 'CHANNELS' on -123456 for the activity report.");
}

// ---------------------------------------------------------------------------
//  Targets and choosing stars
// ---------------------------------------------------------------------------

// Put someone in the spotlight (announce only when it changes hands).
set_target(key k, string reason, integer zoom)
{
    if (k == target_key)
        return;
    target_key = k;
    last_cut = llGetUnixTime();
    pan_angle = llFrand(TWO_PI);        // fresh angle for a fresh star
    if (zoom)
    {
        is_zoomed = TRUE;
        zoom_until = llGetUnixTime() + (integer)(ZOOM_DURATION + 0.5);
    }
    else
    {
        is_zoomed = FALSE;
    }
    if (reason != "")
    {
        last_announced = k;
        no_targets_said = FALSE;
        llOwnerSay(reason);
    }
}

// May this interrupt steal the spotlight right now?
//   NEW    : immediately (>= 1 s dwell), breaks any close-up
//   SPEECH : after MIN_TARGET_DWELL, may steal a close-up
//   others : after MIN_TARGET_DWELL, never break a close-up
integer interrupt_allowed(integer priority)
{
    if (!cinematic || focus_locked || halted)
        return FALSE;
    integer dwell = llGetUnixTime() - last_cut;
    if (priority >= PRIORITY_NEW)
        return (dwell >= 1);            // anti-strobe only for headline news
    if (is_zoomed && priority < PRIORITY_SPEECH)
        return FALSE;                   // only speech breaks a close-up
    return (dwell >= (integer)MIN_TARGET_DWELL);
}

handle_no_targets()
{
    if (llGetListLength(av_keys) > 0)
        return;
    if (!no_targets_said)
    {
        llOwnerSay("No stars in sight - waiting for the next scan...");
        no_targets_said = TRUE;
    }
    target_key = NULL_KEY;
    last_announced = NULL_KEY;
    focus_locked = FALSE;
    halted = FALSE;
    is_zoomed = FALSE;
    if (cam_perm)
        llClearCameraParams();
}

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

// Cast a star: dir 0 = weighted random re-cast, +1/-1 = step through the cast.
cast_target(integer dir)
{
    if (!cinematic)
    {
        llOwnerSay("The camera is off - touch the HUD and choose 'On/Off'.");
        return;
    }
    integer n = llGetListLength(av_keys);
    if (n == 0)
    {
        handle_no_targets();
        return;
    }
    integer idx;
    if (dir == 0)
    {
        idx = pick_weighted();
    }
    else
    {
        idx = llListFindList(av_keys, [target_key]);
        if (idx == -1)
            idx = 0;
        else
            idx = (idx + dir + n) % n;
    }
    key k = llList2Key(av_keys, idx);
    set_target(k, "Spotlight on: " + get_name(k) + "!", FALSE);
}

// ---------------------------------------------------------------------------
//  Clothing watcher: did this star put something on or take something off?
// ---------------------------------------------------------------------------
// llGetAttachedList sees prim attachments (collars, shoes, hair, worn
// outfits); system clothing layers are invisible to every script, and HUD
// attachments are never reported by design. The watcher diffs each star's
// attachment COUNT - a change up or down is an outfit event. (The v3.0/v5.0
// director edition tracked individual attachment keys instead; the count
// diff does the same job with a fraction of the memory.)
check_outfit(integer idx, integer now)
{
    key wr = llList2Key(av_keys, idx);
    list atts = llGetAttachedList(wr);
    integer m = llGetListLength(atts);
    if (m == 1 && llList2Key(atts, 0) == NULL_KEY)
        m = 0;                      // ["NOT ON REGION"]-style result
    integer oi = llListFindList(outfit_keys, [wr]);
    if (oi == -1)
    {
        outfit_keys += [wr];        // first sighting: learn the baseline
        outfit_count += [m];
        return;
    }
    integer prev_count = llList2Integer(outfit_count, oi);
    outfit_count = llListReplaceList(outfit_count, [m], oi, oi);
    if (prev_count == m)
        return;
    // something went on or came off: heat the star up
    integer wi = llListFindList(av_keys, [wr]);
    if (wi != -1)
        av_heat = llListReplaceList(av_heat,
                     [llList2Float(av_heat, wi) + HEAT_OUTFIT], wi, wi);
    if (wr == target_key)
    {
        is_zoomed = TRUE;           // already in the spotlight: re-zoom them
        zoom_until = now + (integer)(ZOOM_DURATION + 0.5);
        return;
    }
    if (interrupt_allowed(PRIORITY_ACTION))
        set_target(wr, get_name(wr) + " changed their outfit!", TRUE);
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
    av_keys = []; av_pos = []; av_score = []; av_anim = []; av_heat = [];
    last_agents = []; last_pos = [];
    has_scanned = FALSE;
    chat_keys = []; chat_time = [];
    outfit_keys = []; outfit_count = [];
    attach_cursor = 0;
    target_boring = FALSE;
    last_sensor = 0;                 // force an immediate pulse
    elapsed = 0.0;
    last_dir_switch = 0.0;
    last_tick = llGetTime();
    cam_init = FALSE;
    is_zoomed = FALSE;
    no_targets_said = FALSE;
    if (listen_chat)
        llListenRemove(listen_chat);
    listen_chat = llListen(0, "", NULL_KEY, "");   // hear all nearby chatter
    apply_tick_rate();
}

stop_cinematic()
{
    cinematic = FALSE;
    pending_start = FALSE;
    apply_tick_rate();          // keep sweeping channels while idle
    if (cam_perm)
        llClearCameraParams();
    if (listen_chat)
    {
        llListenRemove(listen_chat);
        listen_chat = 0;
    }
    target_key = NULL_KEY;
    last_announced = NULL_KEY;
    no_targets_said = FALSE;
    focus_locked = FALSE;
    halted = FALSE;
    is_zoomed = FALSE;
    target_boring = FALSE;
    av_keys = []; av_pos = []; av_score = []; av_anim = []; av_heat = [];
    last_agents = []; last_pos = [];
    has_scanned = FALSE;
    chat_keys = []; chat_time = [];
    outfit_keys = []; outfit_count = [];
}

// ---------------------------------------------------------------------------
//  Bookkeeping (prune stale memory so lists stay small)
// ---------------------------------------------------------------------------

prune_lists(integer now)
{
    integer n = llGetListLength(chat_keys);
    list k2 = [];
    list t2 = [];
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

    // channel activity log
    n = llGetListLength(chan_log_ch);
    list lc = [];
    list lt = [];
    list lm = [];
    for (i = 0; i < n; i++)
    {
        if (now - llList2Integer(chan_log_tm, i) <= CHAN_TTL)
        {
            lc += [llList2Integer(chan_log_ch, i)];
            lt += [llList2Integer(chan_log_ct, i)];
            lm += [llList2Integer(chan_log_tm, i)];
        }
    }
    chan_log_ch = lc;
    chan_log_ct = lt;
    chan_log_tm = lm;
}

// Shed caches before the 64 KB Mono budget is threatened.
memory_guard()
{
    integer free_mem = llGetFreeMemory();
    if (free_mem < MEMORY_FLOOR)
    {
        chat_keys = [];
        chat_time = [];
        if (!mem_warned)
        {
            llOwnerSay("Low script memory (" + (string)free_mem +
                       " bytes free) - trimming caches.");
            mem_warned = TRUE;
        }
    }
    if (free_mem < 9000)
    {
        last_pos = [];      // critical: drop the movement history too
        outfit_keys = [];
        outfit_count = [];
    }
}

// ---------------------------------------------------------------------------
//  The region pulse: roster, scores, heat, interrupts, outfits
// ---------------------------------------------------------------------------

scan_avatars()
{
    integer now = llGetUnixTime();
    prune_lists(now);
    memory_guard();

    // previous tracked cast (small - at most MAX_AVATARS entries)
    list prev_tracked_keys = av_keys;
    list prev_tracked_anim = av_anim;
    list prev_tracked_heat = av_heat;

    // distance reference: near the director means near the action
    vector base = llList2Vector(llGetObjectDetails(owner, [OBJECT_POS]), 0);

    // candidates: [rank, key, pos, score, speed, heat] per agent
    // (the old roster/positions are read in place - no big copies)
    list cand = [];
    list pos_list = [];

    key cut_key = NULL_KEY;
    integer cut_pri = -1;
    float cut_speed = 0.0;
    string cut_kind = "";

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

                // ---- cheap score + heat, all in one pass ----
                integer is_new = (has_scanned &&
                                  llListFindList(last_agents, [a]) == -1);
                integer ci = llListFindList(chat_keys, [a]);
                integer spoke = (ci != -1 &&
                                 now - llList2Integer(chat_time, ci) <= 10);
                float score = 0.5 + speed * 4.0;
                if (is_new)
                    score += 6.0;
                if (spoke)
                    score += 12.0;

                float heat = 0.0;
                integer hci = llListFindList(prev_tracked_keys, [a]);
                if (hci != -1)
                    heat = llList2Float(prev_tracked_heat, hci) * HEAT_DECAY;
                if (is_new)
                    heat += HEAT_NEW;
                integer mover = FALSE;
                if (speed >= SPEED_INTERRUPT)
                {
                    mover = TRUE;
                }
                else
                {
                    integer li = llListFindList(last_pos, [a]);
                    if (li != -1)
                    {
                        vector lastp = llList2Vector(last_pos, li + 1);
                        if (lastp != ZERO_VECTOR &&
                            llVecDist(pos, lastp) >= travel_need)
                            mover = TRUE;
                    }
                }
                if (mover)
                    heat += HEAT_MOVE;
                if (spoke)
                    heat += HEAT_SPEECH;

                // ---- interrupt candidate (never the current star) ----
                if (a != target_key)
                {
                    integer pri = -1;
                    string kind = "";
                    if (is_new)
                    {
                        pri = PRIORITY_NEW;
                        kind = "new";
                    }
                    else if (mover)
                    {
                        pri = PRIORITY_ACTION;
                        kind = "move";
                    }
                    if (pri > cut_pri ||
                        (pri == cut_pri && pri == PRIORITY_ACTION &&
                         speed > cut_speed))
                    {
                        cut_pri = pri;
                        cut_key = a;
                        cut_speed = speed;
                        cut_kind = kind;
                    }
                }

                cand += [llVecDist(pos, base) - min_ff(score, 15.0) * SCORE_REACH,
                         a, pos, score, speed, heat];
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
    cand = llListSort(cand, 6, TRUE);
    integer kept = llGetListLength(cand) / 6;
    if (kept > MAX_AVATARS)
        kept = MAX_AVATARS;
    for (i = 0; i < kept; i++)
    {
        av_keys += [llList2Key(cand, i * 6 + 1)];
        av_pos += [llList2Vector(cand, i * 6 + 2)];
        av_score += [llList2Float(cand, i * 6 + 3)];
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
        float heat = llList2Float(cand, i * 6 + 5);

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
        // (bursts outrank plain movers, so <= PRIORITY_ACTION lets them win)
        if (a != target_key && cut_pri <= PRIORITY_ACTION)
        {
            integer pki = llListFindList(prev_tracked_keys, [a]);
            if (pki != -1)
            {
                string olda = llList2String(prev_tracked_anim, pki);
                if (olda != "" && olda != anim && is_action_anim(anim))
                {
                    cut_pri = PRIORITY_ACTION;
                    cut_key = a;
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
    integer ti = llListFindList(av_keys, [target_key]);
    if (ti != -1 && llList2Float(av_score, ti) < BORING_SCORE)
        target_boring = TRUE;

    // ---- act on the best interrupt (name looked up only now) ----
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

    // ---- clothing watcher: the star every pulse, plus a rotating sample ----
    integer n = llGetListLength(av_keys);
    if (n > 0)
    {
        integer checks = ATTACH_CHECKS_PER_SCAN;
        if (checks > n - 1)
            checks = n - 1;
        if (ti != -1)
            check_outfit(ti, now);       // the star's outfit, every pulse
        integer k = 0;
        integer used = 0;
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

    // ---- status sanity ----
    if (llGetListLength(av_keys) == 0)
        handle_no_targets();
    else if (target_key == NULL_KEY && !focus_locked)
        cast_target(0);

    // drop outfit bookkeeping for stars that left the books
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
            focus_locked = FALSE;
            llOwnerSay("Focus target vanished - unlocking focus.");
        }
        if (llGetListLength(av_keys) > 0)
        {
            cast_target(0);
        }
        else
        {
            handle_no_targets();   // says its line once, clears the lens
            if (cam_perm)
                llClearCameraParams();
        }
        return;
    }

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
        // hone in: tighten the orbit while the star is running hot
        integer hti = llListFindList(av_keys, [target_key]);
        if (hti != -1)
        {
            float heat = llList2Float(av_heat, hti);
            radius = radius * (1.0 - min_ff(heat / HEAT_CAP, 1.0) * HEAT_DOLLY);
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

    // ---- smooth pursuit ----
    float kp = 1.0 - llPow(EULER_E, -dt / POS_SMOOTH_TAU);
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
    string tname = "(none)";
    if (target_key != NULL_KEY)
        tname = get_name(target_key);
    llDialog(owner,
        "VIGILANT ACTION CAMERA\n" +
        "Status: " + status + "  |  Target: " + tname + "\n" +
        "Pan: " + pan + "  |  Action: " + act + "  |  Scanner: " + spy,
        ["Next", "Back", freeze,
         "On/Off", focus, "Pan",
         "Action", "Random", "Scanner",
         "Reset"],
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
    string ht = "0";
    integer hti = llListFindList(av_keys, [target_key]);
    if (hti != -1)
        ht = (string)llList2Integer(av_heat, hti);
    llOwnerSay("VIGILANT " + mode +
        " | Stars: " + (string)llGetListLength(av_keys) +
        " | Target: " + t + " (heat " + ht + ")" +
        " | Pan: " + pan + " | Action: " + act + " | Scanner: " + spy +
        " | Mem: " + (string)llGetFreeMemory());
}

// One dispatcher for the menu buttons and the silent HUD commands alike.
handle_command(string cmd)
{
    if (cmd == "Next")
    {
        halted = FALSE;        // a manual choice resumes a frozen camera
        cast_target(1);
    }
    else if (cmd == "Back")
    {
        halted = FALSE;
        cast_target(-1);
    }
    else if (cmd == "Freeze" || cmd == "Resume")
    {
        halted = !halted;
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
        }
    }
    else if (cmd == "Pan")
    {
        panning = !panning;
    }
    else if (cmd == "Action")
    {
        action_mode = !action_mode;
    }
    else if (cmd == "Random")
    {
        halted = FALSE;
        cast_target(0);
    }
    else if (cmd == "Scanner")
    {
        SPY_MODE = !SPY_MODE;
        if (SPY_MODE)
        {
            spy_on();
            scanner_status();
        }
        else
        {
            spy_off();
            llOwnerSay("Scanner OFF.");
        }
        apply_tick_rate();
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
        spy_off();                  // never stack duplicate listens
        if (SPY_MODE)
            spy_on();
        last_sweep = llGetUnixTime();
        apply_tick_rate();
        refresh_perms();
        llOwnerSay("Vigilant Action Camera v6.1 loaded! Free memory: " +
                   (string)llGetFreeMemory() +
                   " bytes. Touch the HUD for controls - 'On/Off' starts filming.");
        if (SPY_MODE)
            scanner_status();
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
        last_sweep = llGetUnixTime();
        apply_tick_rate();
        // tracking data from a previous life is stale, but the agent ROSTER
        // stays valid (same keys) so nobody is misread as a new arrival
        if (cinematic)
        {
            target_key = NULL_KEY;
            last_announced = NULL_KEY;
            av_keys = []; av_pos = []; av_score = []; av_anim = []; av_heat = [];
            last_pos = [];
            chat_keys = []; chat_time = [];
            outfit_keys = []; outfit_count = [];
            last_sensor = 0;
            cam_init = FALSE;
            is_zoomed = FALSE;
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
            apply_tick_rate();   // keep the scanner sweeping if it was on
            if (listen_chat)
            {
                llListenRemove(listen_chat);
                listen_chat = 0;
            }
            target_key = NULL_KEY;
            last_announced = NULL_KEY;
            is_zoomed = FALSE;
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
            last_pos = [];
            chat_keys = [];
            chat_time = [];
            last_sensor = 0;
            last_announced = NULL_KEY;
            no_targets_said = FALSE;
            cam_init = FALSE;
            is_zoomed = FALSE;
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
            if (message == "STATUS")
            {
                status_report();
                return;
            }
            if (message == "CHANNELS")
            {
                channel_report();
                return;
            }
            string c = "";
            if (message == "NEXT")
                c = "Next";
            else if (message == "BACK")
                c = "Back";
            else if (message == "NEXT_TARGET")
                c = "Random";
            else if (message == "FREEZE")
                c = "Freeze";
            else if (message == "ONOFF")
                c = "On/Off";
            else if (message == "FOCUS")
                c = "Lock Focus";
            else if (message == "TOGGLE_PAN")
                c = "Pan";
            else if (message == "TOGGLE_ACTION")
                c = "Action";
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
            if (id != target_key && interrupt_allowed(PRIORITY_SPEECH))
            {
                if (RELAY_CHAT)
                    llOwnerSay(name + " says: " + message);
                set_target(id, "Cut to " + name + " - they're talking!", TRUE);
            }
            else
            {
                if (RELAY_CHAT)
                    llOwnerSay(name + " says: " + message);
                if (id == target_key)
                {
                    is_zoomed = TRUE;   // the star is talking: hold the close-up
                    zoom_until = now + (integer)(ZOOM_DURATION + 0.5);
                }
            }
            return;
        }

        // ---- channel scanner: any other channel we hold a listen on ----
        if (SPY_MODE)
        {
            spy_log(channel);
            llOwnerSay("[ch " + (string)channel + "] " + name + ": " + message);
        }
    }

    timer()
    {
        integer now = llGetUnixTime();

        // ---- channel scanner sweep (runs even when the camera is off) ----
        if (SPY_MODE && now - last_sweep >= (integer)SWEEP_DWELL)
        {
            last_sweep = now;
            spy_rotate();
        }

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
            cast_target(0);
        }

        // ---- aim the camera ----
        if (target_key != NULL_KEY && !halted)
            update_camera(dt);
    }
}

// ============================================================================
//  NOTES: v6.1 is the SLIM single-script edition - one script, one 64 KB Mono
//  budget. Earlier single-script builds (v2.2 56.5 KB, v4.0 46.5 KB, v4.1)
//  all died of Stack-Heap Collision, so this one is rebuilt lean: tighter
//  functions, fewer strings, a scan pulse that builds one small strided
//  candidate list instead of stacked copies, and lower default caps
//  (MAX_SCAN_AGENTS 12, MAX_AVATARS 6 - raise them if the boot "Free memory"
//  line shows a healthy number).
//  Snap zooms: new arrivals, movers, action bursts, speakers and outfit
//  changes all cut to a 3 s face close-up, then linger on the flowing orbit.
//  Heat: arrivals (+18), outfit changes (+12), action bursts (+15), speech
//  (+10) and movement (+8) heat a star up; heat halves every pulse, pulls
//  hot stars onto the books, biases the spotlight rotation toward them and
//  tightens the orbit up to 35% (HEAT_DOLLY). STATUS shows the current
//  star's heat.
//  Clothing watcher: diffs each tracked star's attachment count via
//  llGetAttachedList (the star every pulse, plus a rotating sample of two).
//  It sees prim attachments - collars, shoes, hair, worn outfits. No script
//  can see another avatar's system clothing layers (shirts, skins), and HUD
//  attachments are never reported by design. A same-pulse one-for-one
//  attachment swap can slip by unnoticed.
//  Channel scanner: LSL cannot listen to "every" channel - a script holds
//  one listen per channel, 65 max (the camera uses three). Channels 1-33
//  and 665/666/667/-666 are always on; -33..-1 rotates in windows of 17
//  every 10 s (tune NEG_BATCH / SWEEP_DWELL). Every channel with traffic is
//  logged and announced the first time it goes live; say 'CHANNELS' on
//  -123456 for a busiest-channels report and pin favourites in SPY_EXTRA.
//  Typed /N chat is heard within normal say range (~20 m); llRegionSay on a
//  scanned channel is heard region-wide; IMs, group chat and object link
//  messages can never be heard by a script.
//  No-script zones: parcel "no outside scripts" freezes the HUD (wearing
//  the parcel's group tag can revive it if the parcel allows group
//  scripts); estate-wide "Disable Scripts" freezes every script for
//  everyone. Only the viewer's own Alt-click camera works there.
//  LSL has no llMin()/llMax()/llExp(); min_ff() and llPow(EULER_E, x) are
//  the stand-ins. Scripted cameras cannot run in mouselook and are silently
//  overridden while you hold Alt-cam (free camera) - press Esc to hand the
//  lens back to the HUD.
// ============================================================================
