// Supadupaman Sapphire Greeter — for your land
// Drop this in a prim on your parcel. When the Arena bot (or anyone) arrives, it greets them.
// Also works as a beacon so the bot can find you.

string TARGET_NAME = "Supadupaman Sapphire";
string BOT_NAME = "ArenaBot";

default
{
    state_entry()
    {
        llSay(0, "Supadupaman Sapphire's parcel greeter online. Waiting for " + BOT_NAME + " or friends. Touch for SLURL.");
        llSetText("Supadupaman's Place\nTouch for SLURL", <0.2, 0.8, 1.0>, 1.0);
        llSensorRepeat("", "", AGENT, 20.0, PI, 5.0);
    }
    
    touch_start(integer n)
    {
        string slurl = "http://maps.secondlife.com/secondlife/" + llEscapeURL(llGetRegionName()) + "/" + (string)((integer)llGetPos().x) + "/" + (string)((integer)llGetPos().y) + "/" + (string)((integer)llGetPos().z);
        llSay(0, "My SLURL: " + slurl);
        llSay(0, "Second Life URI: secondlife://" + llEscapeURL(llGetRegionName()) + "/" + (string)((integer)llGetPos().x) + "/" + (string)((integer)llGetPos().y) + "/" + (string)((integer)llGetPos().z));
        llRegionSayTo(llDetectedKey(0), 0, "Hey " + llDetectedName(0) + "! Here's my location: " + slurl);
    }
    
    sensor(integer n)
    {
        integer i;
        for (i = 0; i < n; i++)
        {
            string name = llDetectedName(i);
            if (llSubStringIndex(llToLower(name), llToLower(TARGET_NAME)) != -1)
            {
                llSay(0, "Welcome home, " + name + "! o/");
            }
            if (llSubStringIndex(llToLower(name), "arenabot") != -1 || llSubStringIndex(llToLower(name), "arena") != -1)
            {
                llSay(0, "Hi " + name + "! You made it! Supadupaman Sapphire was expecting you. " + TARGET_NAME + " is here!");
                // Ping the bot
                llRegionSayTo(llDetectedKey(i), 0, "!follow");
            }
        }
    }
    
    no_sensor()
    {
        // Nothing
    }
}
