// ============================================================================
//  VIGILANT ACTION CAMERA - CAMERA  v5.0  --  Second Life (LSL)
//  SCRIPT 2 OF 2. Owns the lens: camera permission, the flowing orbit,
//  close-up framing, whip cuts, handheld energy, the touch menu, the silent
//  command channel - and the CHANNEL SCANNER that relays nearby chat spoken
//  on other channels. The DIRECTOR script (vigilant-camera-director.lsl)
//  watches the region, tracks each star's "heat" (new arrivals, bursts,
//  speech, movement) and tells this script what to film; a hot star makes
//  this script physically tighten the orbit around them.
//
//  USE: put BOTH scripts in the ROOT prim of a HUD attachment and wear it,
//  then touch the HUD for the menu. Two scripts = two separate 64 KB Mono
//  budgets, which is what finally cures the Stack-Heap Collision that killed
//  the single-script versions (v2.2, v4.0 and v4.1 all died on boot).
//  Menu: Next / Back / Freeze / On-Off / Lock Focus / Pan / Action / Random /
//        Scanner / Debug / Text / Reset
//  Silent commands on channel -123456: NEXT, BACK, FREEZE, ONOFF, FOCUS,
//        SCAN, STATUS, CHANNELS, TOGGLE_PAN, TOGGLE_DIR, NEXT_TARGET,
//        TOGGLE_ACTION, TOGGLE_DEBUG, TOGGLE_TEXT, TOGGLE_SCANNER, RESET
// ============================================================================

// ---------------------------------------------------------------------------
//  Tuning constants - tweak to taste
// ---------------------------------------------------------------------------
float UPDATE_INTERVAL       = 0.1;    // camera update tick (seconds)

// close-up framing (how LONG a close-up lasts lives in the director script)
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

// hone in: how the director's heat report tightens the orbit
float HEAT_CAP              = 15.0;   // heat treated as "max hot" for dolly
float HEAT_DOLLY            = 0.35;   // fraction the orbit tightens when hot

// action mode extras
float LEAD_TIME             = 0.35;   // how far ahead of velocity we focus (s)
float POS_SMOOTH_TAU        = 0.45;   // camera pursuit time constant (s)
float FOCUS_SMOOTH_TAU      = 0.15;   // focus pursuit time constant (s)
float WHIP_SMOOTH_TAU       = 0.12;   // fast catch-up right after a cut (s)
float WHIP_TIME             = 0.9;    // how long the whip lasts (s)
float SHAKE_AMP             = 0.06;   // handheld shake at full sprint (m)
float EULER_E               = 2.718281828459045; // e (LSL has no llExp();
                                      // smoothing uses llPow(EULER_E, x))

// channel scanner
integer SPY_MODE            = TRUE;   // relay chat heard on other channels
list   SPY_EXTRA            = [665, 666, 667, -666];  // always-on channels
integer SCAN_CH_MIN         = 1;      // positive block: always listened
integer SCAN_CH_MAX         = 33;
integer NEG_SCAN_MIN        = -33;    // negative block: listened through a
integer NEG_SCAN_MAX        = -1;     // rotating window (LSL caps a script
integer NEG_BATCH           = 17;     // at 65 simultaneous listens; extras +
float   SWEEP_DWELL         = 10.0;   // positives + one window + the command
                                      // and dialog channels stay well under)
integer CHAN_LOG_CAP        = 12;     // channels tracked in the activity log
integer CHAN_TTL            = 600;    // log entries expire after (seconds)

// toggles and channels
integer DEBUG_MODE           = FALSE; // chatter from the control room
integer FLOATING_TEXT        = FALSE; // spotlight name on the HUD prim
integer DIALOG_CHANNEL       = -987654;
integer HUD_CHANNEL          = -123456;

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

integer cam_perm = FALSE;         // PERMISSION_CONTROL_CAMERA held?
integer cinematic = FALSE;        // are we rolling?
integer pending_start = FALSE;    // start as soon as permission arrives

key    target_key  = NULL_KEY;    // who is in the spotlight
string target_kind = "none";      // "avatar" or "object"
float  target_heat = 0.0;         // the star's heat (drives the hone-in)
integer is_zoomed  = FALSE;       // holding a static close-up?
integer lost_notified = FALSE;    // already told the director it vanished?

integer focus_locked = FALSE;     // menu mirror of the director's lock flag
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

list    spy_handles;               // scanner: fixed listen handles
list    neg_handles;               // scanner: rotating window handles
integer neg_cursor = 0;            // first channel of the current window
integer last_sweep = 0;            // unix time of the last window rotation
list    chan_log_ch;               // channel activity log (parallel lists)
list    chan_log_ct;
list    chan_log_tm;
integer listen_hud = 0;            // listen handles
integer listen_dialog = 0;

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
// per channel (65 listens max per script). So: the extras and the positive
// block are always on, and the negative block rotates through windows every
// SWEEP_DWELL seconds. Every channel that produces traffic is logged; first
// traffic is announced, and the CHANNELS command ranks the busiest channels
// so you can pin your favourites. Typed /N chat is heard within normal say
// range (20 m); llRegionSay on a scanned channel is heard region-wide. IMs
// and group chat can never be heard by any script.

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
    // the always-on specials
    for (i = 0; i < llGetListLength(SPY_EXTRA); i++)
        spy_handles += [llListen(llList2Integer(SPY_EXTRA, i), "", NULL_KEY, "")];
    // the always-on positive block
    for (i = SCAN_CH_MIN; i <= SCAN_CH_MAX; i++)
        spy_handles += [llListen(i, "", NULL_KEY, "")];
    // the first rotating negative window
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
    // sort a [count, channel] copy, busiest first
    list s = [];
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
        // target vanished (left the region / item detached / object removed):
        // tell the director once and hold the last frame until it re-casts
        if (!lost_notified)
        {
            llMessageLinked(LINK_SET, MSG_LOST, "", target_key);
            lost_notified = TRUE;
        }
        return;
    }
    lost_notified = FALSE;

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
        // hone in: tighten the orbit while the star is running hot
        radius = radius * (1.0 - min_ff(target_heat / HEAT_CAP, 1.0) * HEAT_DOLLY);
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

// The director has cast someone/something (MSG_CUT_ORBIT / MSG_CUT_ZOOM).
cut_target(key k, string kind, integer zoom)
{
    integer changed_target = (k != target_key);
    target_key = k;
    target_kind = kind;
    target_heat = 0.0;      // the director's next pulse reports real heat
    is_zoomed = zoom;
    lost_notified = FALSE;
    if (changed_target)
    {
        pan_angle = llFrand(TWO_PI);        // fresh angle for a fresh star
        whip_until = elapsed + WHIP_TIME;   // glide there fast, then settle
    }
    if (FLOATING_TEXT)
        llSetText("Spotlight: " + get_name(k), <1.0, 1.0, 1.0>, 1.0);
}

// The director says there is nothing to film (MSG_CLEAR).
clear_camera()
{
    target_key = NULL_KEY;
    target_kind = "none";
    target_heat = 0.0;
    is_zoomed = FALSE;
    lost_notified = FALSE;
    cam_init = FALSE;
    if (cam_perm)
        llClearCameraParams();
    if (FLOATING_TEXT)
        llSetText("", <1.0, 1.0, 1.0>, 0.0);
}

// ---------------------------------------------------------------------------
//  Rolling / wrapping
// ---------------------------------------------------------------------------

really_start()
{
    cinematic = TRUE;
    pending_start = FALSE;
    halted = FALSE;
    llOwnerSay("Lights, camera, action! Scanning the whole region for stars and action...");
    elapsed = 0.0;
    whip_until = 0.0;
    last_dir_switch = 0.0;
    last_tick = llGetTime();
    cam_init = FALSE;
    apply_tick_rate();
    if (llGetAgentInfo(owner) & AGENT_MOUSELOOK)
        llOwnerSay("Note: scripted cameras cannot drive mouselook - leave mouselook (or press Esc) to hand the lens back to the HUD.");
    llMessageLinked(LINK_SET, MSG_POWER, "1", NULL_KEY);   // wake the director
}

start_cinematic()
{
    if (!cam_perm)
    {
        pending_start = TRUE;
        llOwnerSay("Requesting camera control to start cinematic mode...");
        llRequestPermissions(owner, PERMISSION_CONTROL_CAMERA);
        return;
    }
    really_start();
}

stop_cinematic()
{
    cinematic = FALSE;
    pending_start = FALSE;
    apply_tick_rate();          // keep sweeping channels while idle
    if (cam_perm)
        llClearCameraParams();
    if (FLOATING_TEXT)
        llSetText("", <1.0, 1.0, 1.0>, 0.0);
    target_key = NULL_KEY;
    target_kind = "none";
    target_heat = 0.0;
    is_zoomed = FALSE;
    lost_notified = FALSE;
    cam_init = FALSE;
    focus_locked = FALSE;
    halted = FALSE;
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
        "VIGILANT ACTION CAMERA\n" +
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
        t = get_name(target_key) + " [" + target_kind + "]";
    string pan = "off";
    if (panning)
        pan = "on";
    string act = "off";
    if (action_mode)
        act = "on";
    string dir = "CW";
    if (pan_direction < 0)
        dir = "CCW";
    string spy = "off";
    if (SPY_MODE)
        spy = "on";
    string lk = "no";
    if (focus_locked)
        lk = "yes";
    llOwnerSay("VIGILANT CAM " + mode +
        " | Target: " + t +
        " | Pan: " + pan + " | Action: " + act + " | Dir: " + dir +
        " | Scanner: " + spy +
        " | Locked: " + lk +
        " | Mem: " + (string)llGetFreeMemory());
}

// Menu button pressed (the director also hears the HUD channel directly).
handle_dialog(string cmd)
{
    if (cmd == "Next")
    {
        halted = FALSE;        // a manual choice resumes a frozen camera
        llMessageLinked(LINK_SET, MSG_CMD, "NEXT", NULL_KEY);
    }
    else if (cmd == "Back")
    {
        halted = FALSE;
        llMessageLinked(LINK_SET, MSG_CMD, "BACK", NULL_KEY);
    }
    else if (cmd == "Freeze" || cmd == "Resume")
    {
        halted = !halted;
        if (halted)
        {
            llMessageLinked(LINK_SET, MSG_FLAG, "HALT:1", NULL_KEY);
            if (DEBUG_MODE)
                llOwnerSay("Camera frozen! Choose 'Resume' to continue.");
        }
        else
        {
            llMessageLinked(LINK_SET, MSG_FLAG, "HALT:0", NULL_KEY);
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
            llMessageLinked(LINK_SET, MSG_POWER, "0", NULL_KEY);
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
                llMessageLinked(LINK_SET, MSG_FLAG, "LOCK:1", NULL_KEY);
                if (DEBUG_MODE)
                    llOwnerSay("Focus locked on " + get_name(target_key) + " - interrupts disabled.");
            }
            else
            {
                llMessageLinked(LINK_SET, MSG_FLAG, "LOCK:0", NULL_KEY);
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
        llMessageLinked(LINK_SET, MSG_CMD, "RANDOM", NULL_KEY);
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
    else if (cmd == "Debug")
    {
        DEBUG_MODE = !DEBUG_MODE;
        if (DEBUG_MODE)
        {
            llOwnerSay("Debug mode ON: all messages will show!");
            llMessageLinked(LINK_SET, MSG_FLAG, "DEBUG:1", NULL_KEY);
        }
        else
        {
            llOwnerSay("Debug mode OFF: only key messages will show.");
            llMessageLinked(LINK_SET, MSG_FLAG, "DEBUG:0", NULL_KEY);
        }
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
        llMessageLinked(LINK_SET, MSG_DIE, "", NULL_KEY);
        llResetScript();
    }
}

// Silent HUD command. The director hears this channel too and handles its
// own half of every shared command, so no link messages are needed here.
handle_hud(string message)
{
    if (message == "NEXT" || message == "BACK" || message == "NEXT_TARGET")
    {
        halted = FALSE;    // a manual choice resumes a frozen camera
        return;
    }
    if (message == "FREEZE")
    {
        halted = !halted;
        return;
    }
    if (message == "ONOFF")
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
        return;
    }
    if (message == "FOCUS")
    {
        if (target_key == NULL_KEY && !focus_locked)
            llOwnerSay("No target to lock onto yet.");
        else
            focus_locked = !focus_locked;
        return;
    }
    if (message == "TOGGLE_PAN")
    {
        panning = !panning;
        return;
    }
    if (message == "TOGGLE_ACTION")
    {
        action_mode = !action_mode;
        return;
    }
    if (message == "TOGGLE_DIR")
    {
        pan_direction = -pan_direction;
        return;
    }
    if (message == "TOGGLE_TEXT")
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
        return;
    }
    if (message == "TOGGLE_DEBUG")
    {
        DEBUG_MODE = !DEBUG_MODE;
        if (DEBUG_MODE)
            llOwnerSay("Debug mode ON: all messages will show!");
        else
            llOwnerSay("Debug mode OFF: only key messages will show.");
        return;
    }
    if (message == "CHANNELS")
    {
        channel_report();
        return;
    }
    if (message == "TOGGLE_SCANNER")
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
        if (!FLOATING_TEXT)
            llSetText("", <1.0, 1.0, 1.0>, 0.0);
        spy_off();                  // never stack duplicate listens
        if (SPY_MODE)
            spy_on();
        last_sweep = llGetUnixTime();
        apply_tick_rate();
        refresh_perms();
        llOwnerSay("Vigilant Action Camera v5.0 loaded! Free memory: " +
                   (string)llGetFreeMemory() +
                   " bytes. Touch the HUD for controls - 'On/Off' starts filming.");
        if (SPY_MODE)
            scanner_status();
        if (llGetInventoryNumber(INVENTORY_SCRIPT) < 2)
            llOwnerSay("WARNING: the director script (vigilant-camera-director.lsl) should be in this prim too - without it nothing gets filmed!");
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
        // tracking data from a previous life is stale
        if (cinematic)
        {
            target_key = NULL_KEY;
            target_kind = "none";
            target_heat = 0.0;
            is_zoomed = FALSE;
            lost_notified = FALSE;
            cam_init = FALSE;
        }
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
            // (the director script powers itself down on its own)
            cinematic = FALSE;
            pending_start = FALSE;
            apply_tick_rate();   // keep the scanner sweeping if it was on
            target_key = NULL_KEY;
            target_kind = "none";
            target_heat = 0.0;
            is_zoomed = FALSE;
            lost_notified = FALSE;
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
            cam_init = FALSE;
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
                really_start();
            }
        }
        else
        {
            cam_perm = FALSE;
            pending_start = FALSE;
            if (cinematic)
                stop_cinematic();
            llOwnerSay("Camera permission not granted - the HUD needs to be worn to direct your camera.");
            llMessageLinked(LINK_SET, MSG_POWER, "0", NULL_KEY);   // director stands down
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
        // ---- silent HUD commands (the director listens too) ----
        if (channel == HUD_CHANNEL)
        {
            if (id != owner)
                return;
            handle_hud(message);
            return;
        }

        // ---- dialog menu ----
        if (channel == DIALOG_CHANNEL)
        {
            if (id != owner)
                return;
            handle_dialog(message);
            if (message != "Reset")
                show_dialog();      // keep the menu up, machinima-style
            return;
        }

        // ---- channel scanner: any other channel we hold a listen on ----
        if (SPY_MODE)
        {
            spy_log(channel);
            llOwnerSay("[ch " + (string)channel + "] " + name + ": " + message);
        }
    }

    link_message(integer sender_num, integer num, string str, key id)
    {
        // only director messages (220-225) are handled here; our own
        // 210-214 messages echo back to us and are ignored on purpose
        if (num == MSG_CUT_ORBIT)
        {
            cut_target(id, str, FALSE);
        }
        else if (num == MSG_CUT_ZOOM)
        {
            cut_target(id, str, TRUE);
        }
        else if (num == MSG_ZOOMEND)
        {
            is_zoomed = FALSE;      // back to the flowing orbit
        }
        else if (num == MSG_CLEAR)
        {
            clear_camera();
        }
        else if (num == MSG_FLAG_BACK)
        {
            if (str == "LOCK:0")
                focus_locked = FALSE;
            else if (str == "HALT:0")
                halted = FALSE;
        }
        else if (num == MSG_HEAT)
        {
            if (id == target_key)
                target_heat = (float)str;
        }
    }

    timer()
    {
        integer now = llGetUnixTime();

        // ---- channel scanner sweep (runs even while the lens is parked) ----
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
            llMessageLinked(LINK_SET, MSG_POWER, "0", NULL_KEY);
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

        // ---- aim the camera ----
        if (target_key != NULL_KEY && !halted)
            update_camera(dt);
    }
}

// ============================================================================
//  NOTES: This is the CAMERA half of a two-script team. The director script
//  (vigilant-camera-director.lsl) must be in the same prim - it watches the
//  region, tracks each star's heat and tells this script where to look. They
//  talk over link messages with disjoint numbers (we send 210-214, handle
//  220-225) so a message echoing back to its sender is always ignored.
//  Heat: the director reports the star's heat (arrivals +18, bursts +15,
//  speech +10, movement +8, halving every pulse) and this script tightens
//  the orbit up to 35% (HEAT_DOLLY) while the star runs hot.
//  Channel scanner: LSL cannot listen to "every" channel - a script holds
//  one listen per channel, 65 max. Channels 1-33 and 665/666/667/-666 are
//  always on; -33..-1 rotates in windows of 17 every 10 s (tune NEG_BATCH /
//  SWEEP_DWELL). Every channel with traffic is logged and announced the
//  first time it goes live; say 'CHANNELS' on -123456 for a busiest-channels
//  report and pin favourites in SPY_EXTRA. Typed /N chat is heard within
//  normal say range (~20 m); llRegionSay on a scanned channel is heard
//  region-wide; IMs, group chat and object link messages can never be heard.
//  Scripted cameras cannot run in mouselook and are silently overridden
//  while you hold Alt-cam (free camera) - press Esc to hand the lens back
//  to the HUD. LSL has no llMin()/llMax()/llExp(); min_ff() and
//  llPow(EULER_E, x) are the stand-ins.
//  Memory: each script gets its own 64 KB Mono budget, which is why the team
//  exists - the single-script versions kept dying of Stack-Heap Collision.
// ============================================================================
