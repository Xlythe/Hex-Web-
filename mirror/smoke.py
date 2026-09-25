"""Exercise the deployed mirror with two independently authenticated clients."""

import hashlib
import secrets
import urllib.parse
import urllib.request
from xml.etree import ElementTree as ET

BASE = "https://hex-api.xlythe.com"
PASSWORD = secrets.token_urlsafe(18)


def post(path, **values):
    request = urllib.request.Request(
        BASE + path, urllib.parse.urlencode(values).encode(),
        {"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "HexMirrorSmoke/1.0"}, method="POST")
    with urllib.request.urlopen(request, timeout=15) as response:
        root = ET.fromstring(response.read())
    failure = root.findtext(".//errorMessage")
    if failure:
        raise AssertionError(f"{path}: {failure}")
    return root


def account(label):
    name = label + secrets.token_hex(4)
    post("/api_user_add.php", name=name, password=PASSWORD)
    root = post("/api_login.php", login=name, md5="1",
                password=hashlib.md5(PASSWORD.encode()).hexdigest())
    return {"uid": root.findtext("uid"), "session_id": root.findtext("session_id")}


def handler(user, sid, cmd="", **values):
    return post("/server/hex1/api_handler.php", **user, sid=sid, cmd=cmd, **values)


def main():
    alice, bob = account("SmokeA"), account("SmokeB")
    sid = post("/api_board_create.php", **alice, gid="12").findtext("sid")
    handler(alice, sid, "SETUP", boardSize="3")
    listing = post("/api_board_list.php", **bob, gid="12")
    assert sid in [item.get("sid") for item in listing.findall(".//session")]
    handler(bob, sid)
    handler(bob, sid, "PLACE", place="2")
    handler(alice, sid, "START")
    assert handler(bob, sid, "START").find("sessionInfo").get("status") == "ACTIVE"
    handler(alice, sid, "MOVE", move="A1")
    handler(bob, sid, "MSG", message="hello")
    state = handler(alice, sid, "REFRESH")
    assert state.findtext("gameData/board") == "100000000"
    assert any(e.get("data") == "hello" for e in state.findall("eventList/event"))
    print("PASS: two accounts, lobby, seats, start, turn, move, chat, persisted board over HTTPS")


if __name__ == "__main__":
    main()
