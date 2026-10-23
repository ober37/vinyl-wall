"""Offline checks for the Discogs import and sync with copies (moreCopies), on a fake Discogs. Run by dev/test.sh."""
import json, os, sys, tempfile

os.environ.setdefault("DISCOGS_TOKEN", "x")
os.environ.setdefault("DISCOGS_USER", "u")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "tools"))
import discogs_import as I
import discogs_sync as S

fails = 0


def check(name, ok, detail=""):
    global fails
    if not ok:
        fails += 1
    print(("PASS " if ok else "FAIL ") + name + ("" if ok or not detail else " - " + str(detail)))


# --- the wall treats the matcher's own discogsMatch values as not chosen by the person (#52): its list must cover them all
import re
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, "..", "app", "tools", "discogs_sync.py")).read()
page = open(os.path.join(here, "..", "app", "vinyl-wall.html")).read()
hows = set(re.findall(r'return [^\n]*?, "([^"]+)"\s*$', src, re.M))
auto = set(json.loads(re.search(r"const AUTO_MATCH=(\[[^\]]*\]);", page).group(1)))
check("match: the wall's AUTO_MATCH lists every value the matcher writes", hows and hows <= auto, sorted(hows - auto) or hows)

# --- import: an album's other wantlist pressings become its copies
def rel(i, title, artist, lab="Apple", cat="PCS 7088"):
    return {"basic_information": {"id": i, "title": title, "artists": [{"name": artist}], "labels": [{"name": lab, "catno": cat}],
                                  "formats": [{"descriptions": ["LP"]}], "year": 2020}}


coll = [rel(10, "Rumours", "Fleetwood Mac", "Warner", "BSK 3010")]
wants = [rel(1, "Abbey Road", "The Beatles"), rel(2, "Abbey Road", "The Beatles", "Apple", "none"),
         rel(11, "Rumours", "Fleetwood Mac", "Warner", "RE 1"), rel(10, "Rumours", "Fleetwood Mac"),
         rel(3, "Old Album", "Someone")]
I.pages = lambda path, key: coll if key == "releases" else wants
I.instances = lambda rid: []
tmp = tempfile.mkdtemp()
os.makedirs(os.path.join(tmp, "wall"))
with open(os.path.join(tmp, "wall", "x.json"), "w") as fh:
    json.dump({"id": "x", "data": {"title": "Old Album", "artist": "Someone", "status": "wish"}}, fh)
sys.argv = ["x", os.path.join(tmp, "wall"), os.path.join(tmp, "out.json")]
I.main()
out = {w["doc_id"]: w["data"] for w in json.load(open(os.path.join(tmp, "out.json")))}
ab, ru = out.get("dg-1", {}), out.get("dg-10", {})
check("import: two pressings of one wanted album make one record", set(out) == {"dg-1", "dg-10"}, sorted(out))
check("import: the other pressing is a copy with its release id",
      [c.get("discogsId") for c in ab.get("moreCopies", [])] == [2] and ab["moreCopies"][0]["catalog"] == "", ab.get("moreCopies"))
check("import: the sync is told about the copy", ab.get("discogsSync", {}).get("copyRids") == [2], ab.get("discogsSync"))
check("import: an owned album keeps another wantlist pressing as a copy it still wants",
      ru.get("status") == "own" and [c["discogsId"] for c in ru.get("moreCopies", [])] == [11], ru.get("moreCopies"))

# --- sync: copies' releases on the wantlist, and off it when they go
calls = []


def fake_call(method, path, params=None, body=None, ok404=False):
    calls.append((method, path, (body or {}).get("notes")))
    return {"instance_id": 77} if method == "POST" and "/collection/" in path and "/collection/folders/1/releases/" in path else {}


S.call = fake_call
S.instances = lambda rid: []
d = {"title": "Abbey Road", "artist": "The Beatles", "status": "wish", "priority": 1, "discogsId": 1, "copyName": "UK first", "budget": "150",
     "moreCopies": [{"name": "Half-speed", "pressing": "2019 half-speed\nlimited", "budget": "40", "discogsId": 2}, {"name": "Typed", "budget": "30"}]}
w = {1}
sync = {"rid": 1, "where": "wantlist", "state": "synced"}
S.sync_one(d, w, sync)
check("sync: a copy's release goes on the wantlist with its own notes",
      ("PUT", "/users/u/wants/2", None) in calls and ("POST", "/users/u/wants/2", "Top want. Target: Half-speed. Budget $40") in calls, calls)
check("sync: the record's own entry lists every copy",
      ("POST", "/users/u/wants/1", "Top want. Targets: UK first ($150); Half-speed ($40); Typed ($30)") in calls, calls)
check("sync: copyRids remembers it", sync.get("copyRids") == [2], sync)

calls.clear()
d2 = {**d, "moreCopies": []}
S.sync_one(d2, w, sync)
check("sync: a removed copy comes off the wantlist", ("DELETE", "/users/u/wants/2", None) in calls and "copyRids" not in sync, calls)

# Got it on the second copy: it becomes the record's (collection); the first stays a copy still wanted on the wantlist
calls.clear()
w = {1, 2}
sync = {"rid": 1, "where": "wantlist", "state": "synced", "copyRids": [2]}
got = {"title": "Abbey Road", "artist": "The Beatles", "status": "own", "discogsId": 2, "copyName": "Half-speed",
       "moreCopies": [{"name": "UK first", "budget": "150", "discogsId": 1}]}
S.sync_one(got, w, sync)
check("sync: Got it keeps the unpicked copy on the wantlist", not any(c[0] == "DELETE" and c[1] == "/users/u/wants/1" for c in calls)
      and ("POST", "/users/u/wants/1", "Want. Target: UK first. Budget $150") in calls and sync.get("copyRids") == [1], calls)
check("sync: the picked copy moves to the collection and off the wantlist",
      ("POST", "/users/u/collection/folders/1/releases/2", None) in calls and ("DELETE", "/users/u/wants/2", None) in calls, calls)

calls.clear()
S.sync_one({**got, "deleted": True}, w, sync)
check("sync: deleting the record takes its copies off the wantlist", ("DELETE", "/users/u/wants/1", None) in calls, calls)
sys.exit(1 if fails else 0)
