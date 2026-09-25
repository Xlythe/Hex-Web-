"""Small persistent igGameCenter-compatible Hex service.

Both clients speak the same POST/XML protocol. State changes are serialized by
SQLite write transactions; the board and move log remain authoritative here.
"""

import hashlib
import ipaddress
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from collections import deque
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit
from xml.etree import ElementTree as ET

DB_PATH = os.environ.get("HEX_MIRROR_DB", "/data/hex.sqlite3")
PORT = int(os.environ.get("PORT", "8997"))
SERVER = "hex1"
MAX_BODY = 8192
TRUST_PROXY_IP = os.environ.get("HEX_TRUST_PROXY_IP") == "1"


class RateLimiter:
    """Bounded in-memory sliding-window limiter for expensive auth endpoints."""

    def __init__(self, limit, window_seconds):
        self.limit = limit
        self.window_seconds = window_seconds
        self.entries = {}
        self.lock = threading.Lock()

    def allow(self, key, stamp=None):
        stamp = time.monotonic() if stamp is None else stamp
        with self.lock:
            # Keep the map bounded even if clients rotate source addresses.
            if len(self.entries) > 4096:
                self.entries = {item: hits for item, hits in self.entries.items()
                                if hits and hits[-1] > stamp - self.window_seconds}
            hits = self.entries.setdefault(key, deque())
            while hits and hits[0] <= stamp - self.window_seconds:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(stamp)
            return True


AUTH_BY_IP = RateLimiter(20, 60)
AUTH_GLOBAL = RateLimiter(300, 60)


class EventSignal:
    def __init__(self):
        self.condition = threading.Condition()
        self.revisions = {}

    def revision(self, sid):
        with self.condition:
            return self.revisions.get(sid, 0)

    def publish(self, sids):
        with self.condition:
            for sid in sids:
                self.revisions[sid] = self.revisions.get(sid, 0) + 1
            if sids:
                self.condition.notify_all()

    def wait(self, sid, revision, timeout):
        with self.condition:
            self.condition.wait_for(lambda: self.revisions.get(sid, 0) > revision, timeout)
            return self.revisions.get(sid, 0)


EVENT_SIGNAL = EventSignal()
CHANGED = threading.local()
STREAM_SLOTS = threading.BoundedSemaphore(64)


def now():
    return int(time.time())


def tag(parent, element, value="", **attrs):
    node = ET.SubElement(parent, element, {key: str(value) for key, value in attrs.items()})
    if value is not None:
        node.text = str(value)
    return node


def xml(root):
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def error(message):
    root = ET.Element("response")
    tag(root, "errorMessage", message)
    return xml(root)


def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=10000")
    return db


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with closing(connect()) as db, db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("""
          CREATE TABLE IF NOT EXISTS users (
            uid TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            email TEXT UNIQUE COLLATE NOCASE, password_md5 TEXT NOT NULL,
            session_hash TEXT, registered INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS games (
            sid TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(uid),
            status TEXT NOT NULL DEFAULT 'INIT', active_seat INTEGER NOT NULL DEFAULT 0,
            board_size INTEGER NOT NULL DEFAULT 11, board TEXT NOT NULL,
            options TEXT NOT NULL, pending_undo INTEGER,
            pending_undo_by TEXT, created INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS members (
            sid TEXT NOT NULL REFERENCES games(sid), uid TEXT NOT NULL REFERENCES users(uid),
            seat INTEGER NOT NULL DEFAULT 0, stat TEXT NOT NULL DEFAULT 'NONE',
            last_seen INTEGER NOT NULL, PRIMARY KEY(sid,uid)
          );
          CREATE UNIQUE INDEX IF NOT EXISTS occupied_seat ON members(sid,seat) WHERE seat IN (1,2);
          CREATE TABLE IF NOT EXISTS events (
            eid INTEGER PRIMARY KEY AUTOINCREMENT, sid TEXT NOT NULL REFERENCES games(sid),
            stamp INTEGER NOT NULL, uid TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL DEFAULT ''
          );
          CREATE TABLE IF NOT EXISTS moves (
            sid TEXT NOT NULL REFERENCES games(sid), move_index INTEGER NOT NULL,
            uid TEXT NOT NULL, seat INTEGER NOT NULL, coordinate TEXT NOT NULL,
            board_before TEXT NOT NULL, PRIMARY KEY(sid,move_index)
          );
        """)
        columns = {row[1] for row in db.execute("PRAGMA table_info(users)")}
        if "password_salt" not in columns:
            db.execute("ALTER TABLE users ADD COLUMN password_salt TEXT")
        if "password_hash" not in columns:
            db.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")


def password_record(digest):
    salt = secrets.token_bytes(16)
    digest_hash = hashlib.pbkdf2_hmac("sha256", bytes.fromhex(digest), salt, 210000)
    return salt.hex(), digest_hash.hex()


def password_matches(user, digest):
    if user["password_hash"] and user["password_salt"]:
        candidate = hashlib.pbkdf2_hmac("sha256", bytes.fromhex(digest),
                                        bytes.fromhex(user["password_salt"]), 210000)
        return secrets.compare_digest(candidate, bytes.fromhex(user["password_hash"]))
    return secrets.compare_digest(user["password_md5"], digest)


def auth(db, values):
    uid, session = values.get("uid", ""), values.get("session_id", "")
    if not uid or not session:
        raise ValueError("Please log in again.")
    user = db.execute("SELECT * FROM users WHERE uid=?", (uid,)).fetchone()
    if not user or user["session_hash"] != hashlib.sha256(session.encode()).hexdigest():
        raise ValueError("Your session has expired. Please log in again.")
    return user


def emit(db, sid, uid, kind, data=""):
    db.execute("INSERT INTO events(sid,stamp,uid,type,data) VALUES(?,?,?,?,?)",
               (sid, now(), uid, kind, str(data)))
    if hasattr(CHANGED, "sids"):
        CHANGED.sids.add(sid)


def game(db, sid):
    row = db.execute("SELECT * FROM games WHERE sid=?", (sid,)).fetchone()
    if not row:
        raise ValueError("Game room was not found.")
    return row


def members(db, sid):
    return db.execute("SELECT m.*,u.name FROM members m JOIN users u USING(uid) "
                      "WHERE m.sid=? ORDER BY m.seat DESC,m.uid", (sid,)).fetchall()


def update_game(db, sid, **fields):
    # Only internal literals call this helper.
    db.execute("UPDATE games SET " + ",".join(f"{key}=?" for key in fields) + " WHERE sid=?",
               (*fields.values(), sid))


def board_won(board, size, seat):
    # Row-major board: player 1 connects left/right; player 2 top/bottom.
    starts = [(r, 0) for r in range(size)] if seat == 1 else [(0, c) for c in range(size)]
    todo = [p for p in starts if board[p[0] * size + p[1]] == str(seat)]
    seen = set(todo)
    while todo:
        row, col = todo.pop()
        if (seat == 1 and col == size - 1) or (seat == 2 and row == size - 1):
            return True
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)):
            nr, nc = row + dr, col + dc
            if 0 <= nr < size and 0 <= nc < size and (nr, nc) not in seen and board[nr * size + nc] == str(seat):
                seen.add((nr, nc))
                todo.append((nr, nc))
    return False


def response(db, values, user, current):
    sid = current["sid"]
    root = ET.Element("handlerData")
    player_rows = members(db, sid)
    member = next((p for p in player_rows if p["uid"] == user["uid"]), None)
    active = next((p["uid"] for p in player_rows if p["seat"] == current["active_seat"]), "")
    tag(root, "sessionInfo", None, cmd=values.get("cmd", ""), curtime=now(),
        status=current["status"], owner=current["owner"], activePlayer=active)
    tag(root, "memberInfo", None, active=int(bool(member and member["seat"] == current["active_seat"] and current["status"] == "ACTIVE")),
        finished=int(current["status"] == "FINISHED"), place=member["seat"] if member else 0)
    players = tag(root, "playerList", None)
    for p in player_rows:
        if not p["seat"]:
            continue
        tag(players, "player", None, uid=p["uid"], name=p["name"], sex="-", score=1500,
            place=p["seat"], stat=p["stat"], lastRefresh=p["last_seen"],
            online=int(now() - p["last_seen"] < 90),
            active=int(current["status"] == "ACTIVE" and current["active_seat"] == p["seat"]),
            finished=int(current["status"] == "FINISHED"))
    events = tag(root, "eventList", None)
    try:
        after = max(0, int(values.get("lasteid", "0")))
    except ValueError:
        after = 0
    for e in db.execute("SELECT * FROM events WHERE sid=? AND eid>? ORDER BY eid LIMIT 200", (sid, after)):
        tag(events, "event", None, eid=e["eid"], stamp=e["stamp"], uid=e["uid"], type=e["type"], data=e["data"])
    data = tag(root, "gameData", None)
    tag(data, "board", current["board"])
    options = tag(root, "gameOptions", None)
    for key, value in json.loads(current["options"]).items():
        tag(options, "hidden" if key == "private" else key, value)
    tag(root, "elapsed", "0")
    return xml(root)


def command(db, values):
    user = auth(db, values)
    sid = values.get("sid", "")
    current = game(db, sid)
    uid = user["uid"]
    cmd = values.get("cmd", "").upper()
    member = db.execute("SELECT * FROM members WHERE sid=? AND uid=?", (sid, uid)).fetchone()
    if not member and cmd not in ("", "JOIN"):
        raise ValueError("Join the room before sending commands.")
    if not member:
        if current["status"] != "INIT":
            raise ValueError("This game has already started.")
        db.execute("INSERT INTO members(sid,uid,last_seen) VALUES(?,?,?)", (sid, uid, now()))
        emit(db, sid, uid, "JOIN", user["name"])
        member = db.execute("SELECT * FROM members WHERE sid=? AND uid=?", (sid, uid)).fetchone()
    db.execute("UPDATE members SET last_seen=? WHERE sid=? AND uid=?", (now(), sid, uid))
    seat = member["seat"]
    if cmd == "PLACE":
        if current["status"] != "INIT":
            raise ValueError("Seats cannot change after the game starts.")
        new_seat = int(values.get("place", "0"))
        if new_seat not in (0, 1, 2):
            raise ValueError("Invalid player seat.")
        db.execute("UPDATE members SET seat=?,stat='NONE' WHERE sid=? AND uid=?", (new_seat, sid, uid))
        emit(db, sid, uid, "PLACE", new_seat)
    elif cmd == "SETUP":
        if uid != current["owner"] or current["status"] != "INIT":
            raise ValueError("Only the room owner can change setup.")
        size = int(values.get("boardSize", current["board_size"]))
        if not 3 <= size <= 19:
            raise ValueError("Board size must be from 3 to 19.")
        options = json.loads(current["options"])
        options.update({"boardSize": size, "timerTotal": max(0, int(values.get("timerTotal", 0))),
                        "timerInc": max(0, int(values.get("timerInc", 0))),
                        "scored": "1" if values.get("scored") == "1" else "0",
                        "private": "1" if values.get("private") == "1" else "0"})
        update_game(db, sid, board_size=size, board="0" * (size * size), options=json.dumps(options))
        emit(db, sid, uid, "OPTIONS")
    elif cmd == "START":
        if current["status"] != "INIT" or seat not in (1, 2):
            raise ValueError("Take a seat before starting.")
        db.execute("UPDATE members SET stat='OFFERSTART' WHERE sid=? AND uid=?", (sid, uid))
        emit(db, sid, uid, "START")
        ready = db.execute("SELECT COUNT(*) FROM members WHERE sid=? AND seat IN (1,2) AND stat='OFFERSTART'", (sid,)).fetchone()[0]
        if ready == 2:
            update_game(db, sid, status="ACTIVE", active_seat=1)
            db.execute("UPDATE members SET stat='PLAYING' WHERE sid=? AND seat IN (1,2)", (sid,))
            emit(db, sid, "0", "ACTIVE")
    elif cmd == "MOVE":
        if current["status"] != "ACTIVE" or seat != current["active_seat"]:
            raise ValueError("It is not your turn.")
        move = values.get("move", "").upper()
        size = current["board_size"]
        board = current["board"]
        count = db.execute("SELECT COUNT(*) FROM moves WHERE sid=?", (sid,)).fetchone()[0]
        if move == "SWAP":
            if count != 1 or seat != 2:
                raise ValueError("Swap is only available as the second move.")
            first = db.execute("SELECT * FROM moves WHERE sid=? AND move_index=0", (sid,)).fetchone()
            match = re.fullmatch(r"([A-S])([1-9]|1[0-9])", first["coordinate"])
            col, row = ord(match[1]) - ord("A"), int(match[2]) - 1
            transposed = board[:row * size + col] + "0" + board[row * size + col + 1:]
            transposed = transposed[:col * size + row] + "2" + transposed[col * size + row + 1:]
            db.execute("INSERT INTO moves(sid,move_index,uid,seat,coordinate,board_before) VALUES(?,?,?,?,?,?)",
                       (sid, count, uid, seat, "SWAP", board))
            update_game(db, sid, board=transposed, active_seat=1)
        else:
            match = re.fullmatch(r"([A-S])([1-9]|1[0-9])", move)
            if not match:
                raise ValueError("Invalid Hex coordinate.")
            col, row = ord(match[1]) - ord("A"), int(match[2]) - 1
            if row >= size or col >= size or board[row * size + col] != "0":
                raise ValueError("That cell is unavailable.")
            updated = board[:row * size + col] + str(seat) + board[row * size + col + 1:]
            db.execute("INSERT INTO moves(sid,move_index,uid,seat,coordinate,board_before) VALUES(?,?,?,?,?,?)",
                       (sid, count, uid, seat, move, board))
            update_game(db, sid, board=updated, active_seat=3 - seat)
            if board_won(updated, size, seat):
                update_game(db, sid, status="FINISHED", active_seat=0)
                db.execute("UPDATE members SET stat=CASE WHEN seat=? THEN 'WIN' ELSE 'LOST' END WHERE sid=? AND seat IN (1,2)", (seat, sid))
                emit(db, sid, uid, "ENDGAME", str(seat))
        emit(db, sid, uid, "MOVE", move)
    elif cmd == "MSG":
        message = values.get("message", "").strip()
        if not message or len(message) > 1000:
            raise ValueError("Message must be from 1 to 1000 characters.")
        emit(db, sid, uid, "MSG", message)
    elif cmd == "UNDO":
        kind = values.get("type", "")
        if kind == "ASK":
            last = db.execute("SELECT MAX(move_index) FROM moves WHERE sid=?", (sid,)).fetchone()[0]
            requested = int(values.get("move_ind", "-1"))
            if last is None or requested > last or requested < 0:
                raise ValueError("Invalid undo target.")
            update_game(db, sid, pending_undo=requested, pending_undo_by=uid)
            emit(db, sid, uid, "UNDOASK", requested)
        elif kind == "ACCEPT":
            target = current["pending_undo"]
            if target is None or current["pending_undo_by"] == uid:
                raise ValueError("No opponent undo request is pending.")
            move = db.execute("SELECT * FROM moves WHERE sid=? AND move_index=?", (sid, target)).fetchone()
            if not move:
                raise ValueError("Undo target was not found.")
            db.execute("DELETE FROM moves WHERE sid=? AND move_index>=?", (sid, target))
            update_game(db, sid, board=move["board_before"], active_seat=move["seat"], pending_undo=None, pending_undo_by=None)
            emit(db, sid, uid, "UNDODONE", target)
        elif kind in ("DENY", "FORBID"):
            update_game(db, sid, pending_undo=None, pending_undo_by=None)
            emit(db, sid, uid, "UNDODENY", kind)
        else:
            raise ValueError("Unsupported undo action.")
    elif cmd == "END":
        if current["status"] != "ACTIVE" or seat not in (1, 2):
            raise ValueError("No active game to end.")
        kind = values.get("type", "")
        if kind not in ("GIVEUP", "CLAIMQUIT"):
            raise ValueError("Unsupported end action.")
        if kind == "CLAIMQUIT":
            other = db.execute("SELECT last_seen FROM members WHERE sid=? AND seat=?", (sid, 3 - seat)).fetchone()
            if not other or now() - other[0] < 120:
                raise ValueError("The opponent has not timed out.")
        winner = 3 - seat if kind == "GIVEUP" else seat
        db.execute("UPDATE members SET stat=CASE WHEN seat=? THEN 'WIN' ELSE 'QUIT' END WHERE sid=? AND seat IN (1,2)", (winner, sid))
        update_game(db, sid, status="FINISHED", active_seat=0)
        emit(db, sid, uid, "ENDGAME", kind)
    elif cmd == "LEAVE":
        db.execute("DELETE FROM members WHERE sid=? AND uid=?", (sid, uid))
        emit(db, sid, uid, "LEAVE", user["name"])
        if current["status"] == "ACTIVE" or uid == current["owner"]:
            update_game(db, sid, status="FINISHED", active_seat=0)
    elif cmd == "RESTART":
        if current["status"] != "FINISHED" or seat not in (1, 2):
            raise ValueError("A rematch can only follow a finished game.")
        previous = db.execute("SELECT data FROM events WHERE sid=? AND type='RESTART' ORDER BY eid DESC LIMIT 1", (sid,)).fetchone()
        if not previous:
            new_sid = secrets.token_hex(10)
            db.execute("INSERT INTO games(sid,owner,board_size,board,options,created) VALUES(?,?,?,?,?,?)",
                       (new_sid, uid, current["board_size"], "0" * current["board_size"] ** 2, current["options"], now()))
            for player in members(db, sid):
                if player["seat"] in (1, 2):
                    db.execute("INSERT INTO members(sid,uid,seat,last_seen) VALUES(?,?,?,?)",
                               (new_sid, player["uid"], player["seat"], now()))
            emit(db, sid, uid, "RESTART", new_sid)
    elif cmd not in ("", "JOIN", "REFRESH"):
        raise ValueError("Unknown game command.")
    return response(db, values, user, game(db, sid))


def dispatch(db, path, values):
    if path == "/api_user_add.php":
        name, password = values.get("name", "").strip(), values.get("password", "")
        if not re.fullmatch(r"[\w .-]{2,32}", name) or not 8 <= len(password) <= 256:
            raise ValueError("Use a 2–32 character nickname and a password of at least 8 characters.")
        uid = secrets.token_hex(12)
        salt, digest_hash = password_record(hashlib.md5(password.encode()).hexdigest())
        db.execute("INSERT INTO users(uid,name,email,password_md5,password_salt,password_hash,registered) VALUES(?,?,?,?,?,?,?)",
                   (uid, name, values.get("email") or None, "", salt, digest_hash, now()))
        root = ET.Element("response")
        tag(root, "uid", uid)
        tag(root, "name", name)
        return xml(root)
    if path == "/api_login.php":
        password = values.get("password", "")
        if values.get("md5") != "1" or not re.fullmatch(r"[a-fA-F0-9]{32}", password):
            raise ValueError("Invalid login credentials.")
        user = db.execute("SELECT * FROM users WHERE name=? OR email=?", (values.get("login", ""), values.get("login", ""))).fetchone()
        if not user or not password_matches(user, password.lower()):
            raise ValueError("Invalid login credentials.")
        if not user["password_hash"]:
            salt, digest_hash = password_record(password.lower())
            db.execute("UPDATE users SET password_md5='',password_salt=?,password_hash=? WHERE uid=?",
                       (salt, digest_hash, user["uid"]))
        session = secrets.token_urlsafe(32)
        db.execute("UPDATE users SET session_hash=? WHERE uid=?", (hashlib.sha256(session.encode()).hexdigest(), user["uid"]))
        root = ET.Element("response")
        for key, value in (("uid", user["uid"]), ("name", user["name"]), ("session_id", session)):
            tag(root, key, value)
        return xml(root)
    if path == "/api_profile.php":
        user = auth(db, values)
        root = ET.Element("response")
        profile = tag(root, "profile", None)
        for key, value in (("curtime", now()), ("name", user["name"]), ("email", user["email"] or ""),
                           ("registrationTime", user["registered"]), ("lastAliveTime", now()), ("idleTimeSec", 0)):
            tag(profile, key, value)
        return xml(root)
    if path == "/api_user_edit.php":
        user = auth(db, values)
        name = values.get("name", user["name"]).strip()
        if not re.fullmatch(r"[\w .-]{2,32}", name):
            raise ValueError("Invalid nickname.")
        password = values.get("password")
        if password:
            salt, digest_hash = password_record(hashlib.md5(password.encode()).hexdigest())
        else:
            salt, digest_hash = user["password_salt"], user["password_hash"]
        db.execute("UPDATE users SET name=?, email=?, password_md5=?,password_salt=?,password_hash=? WHERE uid=?",
                   (name, values.get("email", user["email"]), "" if digest_hash else user["password_md5"], salt, digest_hash, user["uid"]))
        return xml(ET.Element("userUpdateSuccess"))
    if path in ("/api_board_create.php", "/api_board_random.php"):
        user = auth(db, values)
        existing = None
        if path == "/api_board_random.php":
            existing = db.execute("SELECT g.sid FROM games g WHERE g.status='INIT' AND json_extract(g.options,'$.private')='0' "
                                  "AND g.owner<>? AND (SELECT COUNT(*) FROM members m WHERE m.sid=g.sid AND m.seat IN (1,2))=1 "
                                  "ORDER BY g.created LIMIT 1", (user["uid"],)).fetchone()
        sid = existing["sid"] if existing else secrets.token_hex(10)
        if not existing:
            options = {"private": "1" if values.get("private") == "1" else "0", "scored": "0", "boardSize": 11,
                       "timerTotal": 0, "timerInc": 0}
            db.execute("INSERT INTO games(sid,owner,board,options,created) VALUES(?,?,?,?,?)",
                       (sid, user["uid"], "0" * 121, json.dumps(options), now()))
        seat = int(values.get("place", "1"))
        if seat not in (1, 2):
            raise ValueError("Invalid player seat.")
        if existing:
            occupied = {p["seat"] for p in members(db, sid)}
            seat = 2 if 1 in occupied else 1
        db.execute("INSERT INTO members(sid,uid,seat,last_seen) VALUES(?,?,?,?)", (sid, user["uid"], seat, now()))
        emit(db, sid, user["uid"], "JOIN", user["name"])
        emit(db, sid, user["uid"], "PLACE", seat)
        root = ET.Element("response")
        tag(root, "sid", sid)
        tag(root, "server", SERVER)
        return xml(root)
    if path == "/api_board_list.php":
        auth(db, values)
        root = ET.Element("response")
        listing = tag(root, "sessionList", None)
        for row in db.execute("SELECT * FROM games WHERE status='INIT' AND json_extract(options,'$.private')='0' ORDER BY created DESC LIMIT 100"):
            players = members(db, row["sid"])
            if sum(1 for p in players if p["seat"] > 0) >= 2:
                continue
            session = tag(listing, "session", None, sid=row["sid"], stat=row["status"], uid=row["owner"], serv=SERVER, priv="0")
            for p in players:
                tag(session, "member", None, plc=p["seat"], uid=p["uid"], nam=p["name"], stat=p["stat"])
        return xml(root)
    if path == f"/server/{SERVER}/api_handler.php":
        return command(db, values)
    raise ValueError("Unknown API endpoint.")


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, format, *args):
        # Avoid logging form bodies, credentials, or session tokens.
        print("%s - %s" % (self.address_string(), format % args), flush=True)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Hex-Uid")
        self.end_headers()

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == "/healthz":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"ok")
        elif parsed.path == "/events":
            self.stream_events(parsed.query)
        else:
            self.send_error(404)

    def stream_events(self, query):
        if not STREAM_SLOTS.acquire(blocking=False):
            self.send_error(503, "Too many event subscribers")
            return
        try:
            values = parse_qs(query)
            sid = values.get("sid", [""])[-1]
            try:
                cursor = max(0, int(values.get("after", ["0"])[-1]))
            except ValueError:
                self.send_error(400, "Invalid event cursor")
                return
            bearer = self.headers.get("Authorization", "")
            if not bearer.startswith("Bearer "):
                self.send_error(401, "Sign in to subscribe")
                return
            try:
                with closing(connect()) as db:
                    user = auth(db, {"uid": self.headers.get("X-Hex-Uid", ""),
                                     "session_id": bearer[7:]})
                    member = db.execute("SELECT 1 FROM members WHERE sid=? AND uid=?",
                                        (sid, user["uid"])).fetchone()
            except ValueError:
                self.send_error(401, "Invalid session")
                return
            except sqlite3.Error:
                self.send_error(503, "Subscription unavailable")
                return
            if not member:
                self.send_error(403, "Invalid subscription")
                return

            revision = EVENT_SIGNAL.revision(sid)
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache, no-transform")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            deadline = time.monotonic() + 55
            while time.monotonic() < deadline:
                with closing(connect()) as db:
                    latest = db.execute("SELECT MAX(eid) FROM events WHERE sid=?", (sid,)).fetchone()[0] or 0
                if latest > cursor:
                    cursor = latest
                    self.wfile.write(f"event: refresh\ndata: {cursor}\n\n".encode())
                    self.wfile.flush()
                next_revision = EVENT_SIGNAL.wait(sid, revision,
                                                  min(20, max(0, deadline - time.monotonic())))
                if next_revision == revision:
                    self.wfile.write(b": heartbeat\n\n")
                    self.wfile.flush()
                revision = next_revision
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass
        finally:
            STREAM_SLOTS.release()

    def do_POST(self):
        client_ip = self.client_address[0]
        if TRUST_PROXY_IP:
            forwarded = self.headers.get("CF-Connecting-IP", "")
            try:
                client_ip = str(ipaddress.ip_address(forwarded))
            except ValueError:
                pass
        if self.path in ("/api_login.php", "/api_user_add.php") and (
                not AUTH_BY_IP.allow(client_ip) or not AUTH_GLOBAL.allow("all")):
            body = error("Too many sign-in attempts. Please try again shortly.")
            self.send_response(429)
            self.send_header("Content-Type", "application/xml; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Retry-After", "60")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        changed = set()
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                raise ValueError("Request too large or empty.")
            parsed = parse_qs(self.rfile.read(length).decode("utf-8"), keep_blank_values=True)
            values = {key: value[-1] for key, value in parsed.items()}
            CHANGED.sids = set()
            with closing(connect()) as db, db:
                db.execute("BEGIN IMMEDIATE")
                try:
                    body = dispatch(db, self.path, values)
                except (ValueError, sqlite3.IntegrityError) as exc:
                    db.rollback()
                    body = error(str(exc))
                else:
                    changed = CHANGED.sids.copy()
        except (UnicodeError, ValueError, sqlite3.Error) as exc:
            body = error(str(exc))
            changed = set()
        finally:
            if hasattr(CHANGED, "sids"):
                del CHANGED.sids
        EVENT_SIGNAL.publish(changed)
        self.send_response(200)
        self.send_header("Content-Type", "application/xml; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class LimitedHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 128

    def __init__(self, *args, **kwargs):
        self.slots = threading.BoundedSemaphore(128)
        super().__init__(*args, **kwargs)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            try:
                request.sendall(b"HTTP/1.1 503 Service Unavailable\r\n"
                                b"Content-Length: 0\r\nConnection: close\r\n\r\n")
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


if __name__ == "__main__":
    init_db()
    LimitedHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
