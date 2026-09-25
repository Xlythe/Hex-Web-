import hashlib
import os
import tempfile
import unittest
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from threading import Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from xml.etree import ElementTree as ET

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
