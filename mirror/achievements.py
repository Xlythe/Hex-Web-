"""Hex standings and Play Games progress for an authenticated Android game server."""
import json
import os
import sqlite3
import time
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

# Keys and achievement IDs match the Android game registered in Play Console.
ACHIEVEMENTS = {
    "fast30": ("CgkI9MX11PkIEAIQCg", "Finish in 30 seconds"),
    "fast10": ("CgkI9MX11PkIEAIQEw", "Finish in 10 seconds"),
    "full": ("CgkI9MX11PkIEAIQCw", "Fill the board"),
    "computer": ("CgkI9MX11PkIEAIQFQ", "Beat the computer"),
    "timed": ("CgkI9MX11PkIEAIQFg", "Finish a timed game"),
    "played1": ("CgkI9MX11PkIEAIQDA", "Novice"),
    "played2": ("CgkI9MX11PkIEAIQDQ", "Intermediate"),
    "wins1": ("CgkI9MX11PkIEAIQDg", "Expert"),
    "wins2": ("CgkI9MX11PkIEAIQFA", "Insane"),
    "online": ("CgkI9MX11PkIEAIQGQ", "Finish an online game"),
}
INCREMENTAL = {"played1", "played2", "wins1", "wins2"}
GAMES = "https://games.googleapis.com/games/v1/"

def init(db):
    db.executescript("""
      CREATE TABLE IF NOT EXISTS play_accounts(
          uid TEXT PRIMARY KEY REFERENCES users(uid), player TEXT NOT NULL UNIQUE,
          synced INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS play_progress(
          uid TEXT NOT NULL REFERENCES play_accounts(uid), achievement TEXT NOT NULL,
          steps INTEGER NOT NULL, unlocked INTEGER NOT NULL, PRIMARY KEY(uid,achievement));
      CREATE INDEX IF NOT EXISTS event_history_type ON events(sid,type,stamp);
    """)

def earned(db, uid):
    totals = {key: 0 for key in ACHIEVEMENTS}
    rows = db.execute("""
        SELECT r.outcome,g.board,json_extract(g.options,'$.timerTotal') AS timer,
          (SELECT min(stamp) FROM events WHERE sid=r.sid AND type='ACTIVE') AS start,
          (SELECT min(stamp) FROM events WHERE sid=r.sid AND type='ENDGAME') AS finish
        FROM results r JOIN games g USING(sid) WHERE r.uid=?""", (uid,))
    for result in rows:
        if result["start"] is None:
            continue
        totals["online"] = 1
        totals["played1"] += 1
        totals["wins1"] += int(result["outcome"] == "WIN")
        totals["timed"] |= int(bool(result["timer"]))
        totals["full"] |= int("0" not in result["board"])
        if result["finish"] is not None:
            duration = result["finish"] - result["start"]
            totals["fast30"] |= int(0 <= duration < 30)
            totals["fast10"] |= int(0 <= duration < 10)
    totals["played2"] = totals["played1"]
    totals["wins2"] = totals["wins1"]
    return totals

def profile(db, uid, root):
    account = db.execute("SELECT synced FROM play_accounts WHERE uid=?", (uid,)).fetchone()
    progress = ET.SubElement(root, "achievements", synced=str(account["synced"] if account else 0))
    imported = {row["achievement"]: row for row in db.execute("SELECT * FROM play_progress WHERE uid=?", (uid,))}
    for key, local in earned(db, uid).items():
        google = imported.get(key)
        unlocked = (key not in INCREMENTAL and local > 0) or bool(google and google["unlocked"])
        ET.SubElement(progress, "achievement", name=ACHIEVEMENTS[key][1],
                      steps=str(max(local, google["steps"] if google else 0)),
                      incremental=str(int(key in INCREMENTAL)), unlocked=str(int(unlocked)))

def standings(db, root):
    rows = db.execute("""
        WITH scores AS (
          SELECT u.name,1500+SUM(r.rating_delta) AS score,COUNT(*) AS played,
                 SUM(r.outcome='WIN') AS wins
          FROM results r JOIN users u USING(uid) JOIN games g USING(sid)
          WHERE json_extract(g.options,'$.scored')='1' GROUP BY u.uid)
        SELECT *,RANK() OVER (ORDER BY score DESC) AS rank FROM scores
        ORDER BY score DESC,name COLLATE NOCASE LIMIT 100""")
    for row in rows:
        ET.SubElement(root, "player", **{key: str(row[key]) for key in row.keys()})

def google_json(url, *, token=None, form=None):
    data = None if form is None else urlencode(form).encode()
    headers = {"Authorization": "Bearer " + token} if token else {}
    try:
        with urlopen(Request(url, data=data, headers=headers), timeout=8) as response:
            data = response.read(262145)
            if len(data) > 262144:
                raise ValueError()
            return json.loads(data or b"{}")
    except (URLError, OSError, ValueError):
        raise ValueError("Google Play Games could not complete the request. Try syncing again.") from None

def sync(db, uid, code):
    client = os.environ.get("HEX_GOOGLE_CLIENT_ID")
    secret = os.environ.get("HEX_GOOGLE_CLIENT_SECRET")
    if not client or not secret:
        raise ValueError("Google Play Games sync has not been configured on this server.")
    if not code or len(code) > 4096:
        raise ValueError("A fresh Android Play Games authorization is required.")
    token = google_json("https://oauth2.googleapis.com/token", form={
        "grant_type": "authorization_code", "code": code, "client_id": client,
        "client_secret": secret, "redirect_uri": ""}).get("access_token")
    if not token:
        raise ValueError("Google did not authorize this game.")
    player = google_json(GAMES + "players/me", token=token).get("playerId")
    if not player:
        raise ValueError("Google did not identify this Play Games player.")
    # Reserve the one-to-one link before modifying Google progress. No network I/O under a write lock.
    with db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("INSERT OR IGNORE INTO play_accounts(uid,player) VALUES(?,?)", (uid, player))
        if not db.execute("SELECT 1 FROM play_accounts WHERE uid=? AND player=?", (uid, player)).fetchone():
            raise ValueError("This Hex or Play Games account is already linked to another player.")
    local = earned(db, uid)
    def read_progress():
        result = {}
        page = None
        while True:
            query = {"maxResults": 200}
            if page: query["pageToken"] = page
            batch = google_json(GAMES + "players/me/achievements?" + urlencode(query), token=token)
            result.update((item["id"], item) for item in batch.get("items", []))
            page = batch.get("nextPageToken")
            if not page: return result
    before = read_progress()
    changed = False
    for key, steps in local.items():
        ident = ACHIEVEMENTS[key][0]
        current = before.get(ident, {})
        if not steps or current.get("achievementState") == "UNLOCKED":
            continue
        if key in INCREMENTAL:
            if current.get("currentSteps", 0) >= steps: continue
            method = "setStepsAtLeast?" + urlencode({"steps": steps})
        else:
            method = "unlock"
        google_json(GAMES + "achievements/" + ident + "/" + method, token=token, form={})
        changed = True
    latest = read_progress() if changed else before
    with db:
        for key, (ident, _) in ACHIEVEMENTS.items():
            item = latest.get(ident, {})
            db.execute("""INSERT INTO play_progress VALUES(?,?,?,?) ON CONFLICT(uid,achievement)
                    DO UPDATE SET steps=max(steps,excluded.steps),unlocked=max(unlocked,excluded.unlocked)""",
                       (uid,key,item.get("currentSteps", 0),int(item.get("achievementState") == "UNLOCKED")))
        db.execute("UPDATE play_accounts SET synced=? WHERE uid=?", (int(time.time()), uid))
