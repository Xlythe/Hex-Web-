import hashlib
import os
import tempfile
import unittest
from unittest.mock import patch
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from threading import Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from xml.etree import ElementTree as ET

import achievements
import server


class QuietHandler(server.Handler):
    def log_message(self, format, *args):
        pass


class MirrorTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        server.DB_PATH = os.path.join(self.temporary.name, "hex.sqlite3")
        server.init_db()
        self.first = self.account("Alice")
        self.second = self.account("Bob")

    def tearDown(self):
        self.temporary.cleanup()

    def call(self, path, **values):
        with closing(server.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            return ET.fromstring(server.dispatch(db, path, values))

    def account(self, name):
        self.call("/api_user_add.php", name=name, password="long password")
        login = self.call("/api_login.php", login=name,
                          password=hashlib.md5(b"long password").hexdigest(), md5="1")
        return {"uid": login.findtext("uid"), "session_id": login.findtext("session_id")}

    def handler(self, user, sid, cmd="", **params):
        return self.call("/server/hex1/api_handler.php", **user, sid=sid, cmd=cmd, **params)

    def test_two_client_game_chat_turns_undo_and_persistence(self):
        created = self.call("/api_board_create.php", **self.first, gid="12")
        sid = created.findtext("sid")
        self.handler(self.first, sid, "SETUP", boardSize="3")
        lobby = self.call("/api_board_list.php", **self.second, gid="12")
        self.assertEqual(lobby.find(".//session").get("sid"), sid)
        self.handler(self.second, sid)
        self.handler(self.second, sid, "PLACE", place="2")
        self.handler(self.first, sid, "START")
        started = self.handler(self.second, sid, "START")
        self.assertEqual(started.find("sessionInfo").get("status"), "ACTIVE")
        self.assertEqual(started.find("memberInfo").get("active"), "0")
        moved = self.handler(self.first, sid, "MOVE", move="A1")
        self.assertEqual(moved.findtext("gameData/board"), "100000000")
        self.assertEqual(self.handler(self.second, sid).find("memberInfo").get("active"), "1")
        self.handler(self.second, sid, "MSG", message="Hello from Bob")
        self.assertIn("Hello from Bob", [e.get("data") for e in self.handler(self.first, sid).findall("eventList/event")])
        self.handler(self.second, sid, "MOVE", move="B1")
        self.handler(self.first, sid, "UNDO", type="ASK", move_ind="1")
        undone = self.handler(self.second, sid, "UNDO", type="ACCEPT")
        self.assertEqual(undone.findtext("gameData/board"), "100000000")
        self.assertEqual(undone.findtext("gameData/moves"), "A1")
        self.assertEqual(undone.find("memberInfo").get("active"), "1")
        with closing(server.connect()) as db:
            self.assertEqual(server.game(db, sid)["board"], "100000000")

    def test_reject_occupied_seat_and_out_of_turn_move(self):
        sid = self.call("/api_board_create.php", **self.first, gid="12").findtext("sid")
        self.handler(self.second, sid)
        with self.assertRaises(Exception):
            self.handler(self.second, sid, "PLACE", place="1")
        self.handler(self.second, sid, "PLACE", place="2")
        self.handler(self.first, sid, "START")
        self.handler(self.second, sid, "START")
        with self.assertRaises(ValueError):
            self.handler(self.second, sid, "MOVE", move="A1")

    def test_swap_transposes_off_axis_opening(self):
        sid = self.call("/api_board_create.php", **self.first, gid="12").findtext("sid")
        self.handler(self.first, sid, "SETUP", boardSize="3")
        self.handler(self.second, sid)
        self.handler(self.second, sid, "PLACE", place="2")
        self.handler(self.first, sid, "START")
        self.handler(self.second, sid, "START")
        self.handler(self.first, sid, "MOVE", move="B1")
        swapped = self.handler(self.second, sid, "MOVE", move="SWAP")
        self.assertEqual(swapped.findtext("gameData/board"), "000200000")
        self.assertEqual(swapped.find("memberInfo").get("active"), "0")
        with self.assertRaises(ValueError):
            self.handler(self.second, sid, "MOVE", move="SWAP")

    def test_random_matchmaking_and_rematch(self):
        sid = self.call("/api_board_create.php", **self.first, gid="12").findtext("sid")
        matched = self.call("/api_board_random.php", **self.second, gid="12")
        self.assertEqual(sid, matched.findtext("sid"))
        self.handler(self.first, sid, "START")
        self.handler(self.second, sid, "START")
        self.handler(self.first, sid, "END", type="GIVEUP")
        offered = self.handler(self.second, sid, "RESTART")
        rematch = next(e.get("data") for e in offered.findall("eventList/event") if e.get("type") == "RESTART")
        self.assertNotEqual(sid, rematch)
        self.assertEqual(self.handler(self.first, rematch).find("memberInfo").get("place"), "1")
        self.assertEqual(self.handler(self.second, rematch).find("memberInfo").get("place"), "2")
        repeated = self.handler(self.first, sid, "RESTART")
        self.assertEqual(next(e.get("data") for e in repeated.findall("eventList/event") if e.get("type") == "RESTART"), rematch)

    def test_stale_rooms_and_repeated_matchmaking(self):
        def random(user):
            return self.call("/api_board_random.php", **user, gid="12").findtext("sid")

        first = random(self.first)
        self.assertEqual(first, random(self.first))
        with closing(server.connect()) as db, db:
            db.execute("UPDATE members SET last_seen=0 WHERE sid=?", (first,))
        self.assertIsNone(self.call("/api_board_list.php", **self.second).find(".//session"))
        self.assertNotEqual(first, random(self.second))

    def test_spectator_departure_and_winning_move_delivery(self):
        sid = self.call("/api_board_create.php", **self.first).findtext("sid")
        self.handler(self.first, sid, "SETUP", boardSize="3")
        spectator = self.account("Spectator")
        self.handler(spectator, sid)
        self.handler(self.second, sid)
        self.handler(self.second, sid, "PLACE", place="2")
        self.handler(self.first, sid, "START")
        self.handler(self.second, sid, "START")
        self.handler(self.first, sid, "MOVE", move="A1")
        with self.assertRaises(ValueError):
            self.handler(spectator, sid, "UNDO", type="ASK", move_ind="0")
        self.assertEqual("ACTIVE", self.handler(spectator, sid, "LEAVE").find("sessionInfo").get("status"))
        for user, move in [(self.second, "A2"), (self.first, "B1"), (self.second, "B2"), (self.first, "C1")]:
            state = self.handler(user, sid, "MOVE", move=move)
        self.assertEqual(["MOVE", "ENDGAME"], [e.get("type") for e in state.findall("eventList/event")][-2:])
        with self.assertRaises(ValueError):
            self.handler(self.first, sid, "UNDO", type="ASK", move_ind="0")

    def test_clock_increment_undo_timeout_and_profile_after_reconnect(self):
        sid = self.call("/api_board_create.php", **self.first).findtext("sid")
        self.handler(self.first, sid, "SETUP", boardSize="3", timerTotal="30", timerInc="5", scored="1")
        self.handler(self.second, sid)
        self.handler(self.second, sid, "PLACE", place="2")
        with patch.object(server.time, "time_ns", return_value=100_000_000_000) as clock:
            self.handler(self.first, sid, "START", client="web")
            self.handler(self.second, sid, "START")
            clock.return_value += 3_000_000_000
            state = self.handler(self.first, sid, "MOVE", move="B1")
            first = state.find("playerList/player[@place='1']")
            self.assertEqual("32", first.get("timerLeft"))
            self.handler(self.second, sid, "MOVE", move="SWAP")
            self.handler(self.second, sid, "UNDO", type="ASK", move_ind="1")
            state = self.handler(self.first, sid, "UNDO", type="ACCEPT")
            self.assertEqual("B1", state.findtext("gameData/moves"))
            self.assertEqual("30", state.find("playerList/player[@place='2']").get("timerLeft"))
            clock.return_value += 30_000_000_000
            state = self.handler(self.second, sid, "MOVE", move="SWAP")
            self.assertEqual("FINISHED", state.find("sessionInfo").get("status"))
            self.assertEqual("TIMEOUT", state.findall("eventList/event")[-1].get("data"))
            self.assertEqual("B1", self.handler(self.first, sid, "REFRESH").findtext("gameData/moves"))
            self.handler(self.first, sid, "LEAVE")
        for user, expected in [(self.first, ("1", "0", "1516")), (self.second, ("0", "1", "1484"))]:
            stats = self.call("/api_profile.php", **user).find("profile/gameStat/game")
            self.assertEqual(expected, tuple(stats.get(key) for key in ("numWin", "numLoss", "score")))
            self.assertEqual("1", stats.get("numGames"))

    def test_rated_standings_exclude_unrated_and_share_tied_ranks(self):
        with closing(server.connect()) as db, db:
            for sid, scored, delta in (("rated", "1", 12), ("friendly", "0", 0)):
                db.execute("INSERT INTO games(sid,owner,board,options,created) VALUES(?,?,?,?,0)",
                           (sid, self.first["uid"], "0" * 9, '{"scored":"' + scored + '"}'))
                for user in (self.first, self.second):
                    db.execute("INSERT INTO results VALUES(?,?,?,?)", (sid, user["uid"], "WIN", delta))
        rows = self.call("/api_standings.php").findall("player")
        self.assertEqual([("Alice", "1", "1512", "1"), ("Bob", "1", "1512", "1")],
                         [(r.get("name"), r.get("rank"), r.get("score"), r.get("played")) for r in rows])
        self.assertIsNone(rows[0].get("email"))

    def test_web_and_android_sessions_can_coexist_and_rotate_independently(self):
        login = dict(login="Alice", password=hashlib.md5(b"long password").hexdigest(), md5="1")
        browser = self.call("/api_login.php", **login, networkuid="browser").findtext("session_id")
        phone = self.call("/api_login.php", **login, networkuid="phone").findtext("session_id")
        self.call("/api_profile.php", uid=self.first["uid"], session_id=browser)
        self.call("/api_login.php", **login, networkuid="phone")
        self.call("/api_profile.php", uid=self.first["uid"], session_id=browser)
        with self.assertRaises(ValueError):
            self.call("/api_profile.php", uid=self.first["uid"], session_id=phone)

    @patch.dict(os.environ, HEX_GOOGLE_CLIENT_ID="client", HEX_GOOGLE_CLIENT_SECRET="secret")
    def test_verified_google_link_syncs_earned_progress_and_rejects_account_conflicts(self):
        progress = {achievements.ACHIEVEMENTS["computer"][0]: {"achievementState": "UNLOCKED"},
                    achievements.ACHIEVEMENTS["played1"][0]: {"currentSteps": 12}}
        mutations = []
        def google(url, *, token=None, form=None):
            if url.endswith("/token"):
                self.assertEqual("fresh-code", form["code"])
                return {"access_token": "short-lived"}
            self.assertEqual("short-lived", token)
            if url.endswith("players/me"): return {"playerId": "player-one"}
            if "players/me/achievements?" in url:
                return {"items": [dict(id=k, **v) for k,v in progress.items()]}
            ident, method = url.split("/")[-2:]
            mutations.append(ident)
            progress[ident] = ({"currentSteps": int(method.split("=")[-1])} if "setSteps" in method
                               else {"achievementState": "UNLOCKED"})
            return {}
        with patch.object(achievements, "google_json", side_effect=google):
            with closing(server.connect()) as db, db:
                db.execute("INSERT INTO games(sid,owner,board,options,created) VALUES('played',?,'000', '{}',0)",
                           (self.first["uid"],))
                db.execute("INSERT INTO results VALUES('played',?,'WIN',0)", (self.first["uid"],))
                db.execute("INSERT INTO members(sid,uid,seat,last_seen) VALUES('played',?,1,0)", (self.first["uid"],))
                db.execute("INSERT INTO web_seats VALUES('played',?)", (self.first["uid"],))
                for event, stamp in (("ACTIVE", 100), ("ENDGAME", 130)):
                    db.execute("INSERT INTO events(sid,uid,type,stamp) VALUES('played',?,?,?)",
                               (self.first["uid"], event, stamp))
            self.call("/api_play_sync.php", **self.first, code="fresh-code")
            initial = len(mutations)
            self.assertGreater(initial, 0)
            self.assertEqual(13, progress[achievements.ACHIEVEMENTS["played1"][0]]["currentSteps"])
            self.call("/api_play_sync.php", **self.first, code="fresh-code")
            self.assertEqual(initial, len(mutations))
            result = self.call("/api_profile.php", **self.first).find("profile/achievements")
            self.assertGreater(int(result.get("synced")), 0)
            self.assertEqual("1", result.find("achievement[@name='Beat the computer']").get("unlocked"))
            self.assertEqual("0", result.find("achievement[@name='Finish in 30 seconds']").get("unlocked"))
            with self.assertRaisesRegex(ValueError, "already linked"):
                self.call("/api_play_sync.php", **self.second, code="fresh-code")
            with self.assertRaisesRegex(ValueError, "expired"):
                self.call("/api_play_sync.php", uid=self.first["uid"], session_id="wrong", code="fresh-code")
            self.assertEqual(initial, len(mutations))

    def test_full_board_has_one_winner_and_only_edge_adjacency_counts(self):
        for mask in range(512):
            board = "".join("1" if mask & (1 << cell) else "2" for cell in range(9))
            self.assertNotEqual(server.board_won(board, 3, 1), server.board_won(board, 3, 2), board)
        self.assertFalse(server.board_won("100010001", 3, 1))
        self.assertTrue(server.board_won("001010100", 3, 1))
        self.assertTrue(server.board_won("002020200", 3, 2))

    def test_auth_requests_are_rate_limited_over_http(self):
        server.AUTH_BY_IP = server.RateLimiter(20, 60)
        web = server.LimitedHTTPServer(("127.0.0.1", 0), QuietHandler)
        thread = Thread(target=web.serve_forever, daemon=True)
        thread.start()
        try:
            address = f"http://127.0.0.1:{web.server_port}/api_login.php"
            request = lambda: Request(address, data=b"login=missing&password=00000000000000000000000000000000&md5=1")
            for _ in range(20):
                self.assertEqual(urlopen(request(), timeout=5).status, 200)
            with self.assertRaises(HTTPError) as rejected:
                urlopen(request(), timeout=5)
            self.assertEqual(rejected.exception.code, 429)
        finally:
            web.shutdown()
            web.server_close()
            thread.join()

    def test_concurrent_health_requests(self):
        web = server.LimitedHTTPServer(("127.0.0.1", 0), QuietHandler)
        thread = Thread(target=web.serve_forever, daemon=True)
        thread.start()
        try:
            address = f"http://127.0.0.1:{web.server_port}/healthz"
            with ThreadPoolExecutor(max_workers=16) as pool:
                responses = list(pool.map(lambda _: urlopen(address, timeout=5).read(), range(32)))
            self.assertEqual(responses, [b"ok"] * 32)
        finally:
            web.shutdown()
            web.server_close()
            thread.join()

    def test_concurrent_authenticated_requests(self):
        web = server.LimitedHTTPServer(("127.0.0.1", 0), QuietHandler)
        thread = Thread(target=web.serve_forever, daemon=True)
        thread.start()
        try:
            address = f"http://127.0.0.1:{web.server_port}/api_profile.php"
            payload = urlencode(self.first).encode()

            def fetch(_):
                with urlopen(Request(address, data=payload), timeout=10) as response:
                    return ET.fromstring(response.read()).find("profile") is not None

            with ThreadPoolExecutor(max_workers=16) as pool:
                self.assertEqual(list(pool.map(fetch, range(32))), [True] * 32)
        finally:
            web.shutdown()
            web.server_close()
            thread.join()

    def test_event_stream_signals_committed_message(self):
        sid = self.call("/api_board_create.php", **self.first, gid="12").findtext("sid")
        with closing(server.connect()) as db:
            cursor = db.execute("SELECT MAX(eid) FROM events WHERE sid=?", (sid,)).fetchone()[0]
        web = server.LimitedHTTPServer(("127.0.0.1", 0), QuietHandler)
        thread = Thread(target=web.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{web.server_port}"
            subscription = Request(f"{base}/events?sid={sid}&after={cursor}", headers={
                "Authorization": "Bearer " + self.first["session_id"],
                "X-Hex-Uid": self.first["uid"],
            })
            with urlopen(subscription, timeout=5) as stream:
                self.assertEqual(stream.readline(), b": connected\n")
                self.assertEqual(stream.readline(), b"\n")
                payload = urlencode({**self.first, "sid": sid, "cmd": "MSG", "message": "push"}).encode()
                with urlopen(Request(f"{base}/server/hex1/api_handler.php", data=payload), timeout=5):
                    pass
                self.assertEqual(stream.readline(), b"event: refresh\n")
                self.assertTrue(stream.readline().startswith(b"data: "))
        finally:
            web.shutdown()
            web.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
