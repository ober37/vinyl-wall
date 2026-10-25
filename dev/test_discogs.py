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
# the React page keeps the list in its source (web/src/model/discogs.ts); the plain-JS page had it inline
react = os.path.join(here, "..", "web", "src", "model", "discogs.ts")
if 'name="vinyl-wall-version"' in page and os.path.exists(react):
    page = open(react).read()
hows = set(re.findall(r'return [^\n]*?, "([^"]+)"\s*$', src, re.M))
auto = set(json.loads(re.search(r"AUTO_MATCH\s*=\s*(\[[^\]]*\])", page).group(1)))
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
    json.dump({"id": "x", "version": 1, "data": {"title": "Old Album", "artist": "Someone", "status": "wish"}}, fh)
sys.argv = ["x", os.path.join(tmp, "wall"), os.path.join(tmp, "out.json")]
I.main()
writes = json.load(open(os.path.join(tmp, "out.json")))
out = {w["doc_id"]: w["data"] for w in writes if w["collection"] == "records"}
done = writes[-1]
# ArtifactData refuses a batch with a write to an existing doc that isn't pinned, and writes none of it
pinned = lambda ws: all(w["op"] == "set" or w.get("if_version") for w in ws)
check("import: every write to an existing doc is pinned", pinned(writes), writes)
check("import: the last write marks the import done, so it lands with the records",
      done["collection"] == "settings" and done["doc_id"] == "site" and done["data"]["discogs"]["importRequested"] == {"__delete__": True}
      and done["data"]["discogs"]["importMsg"].startswith("Imported 2 records"), done)
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

# --- import: the notes the sync writes come back as the fields they came from (Discogs has no fields for them)
def back(d, keys, read, write):
    got = read(write(d))
    return {k: got.get(k) for k in keys} == {k: d[k] for k in keys}, (write(d), got)

hunt = {"status": "wish", "priority": 1, "pressing": "2019 half-speed", "budget": "40"}
check("round trip: a hunt's priority, target and budget", *back(hunt, ["priority", "pressing", "budget"], I.read_want, S.want_notes))
check("round trip: Someday with nothing else", *back({"status": "wish", "priority": 3}, ["priority"], I.read_want, S.want_notes))
order = {"status": "ordered", "shop": "Rough Trade", "orderDate": "2026-10-01", "orderStatus": "shipped", "eta": "2026-11-02",
         "pressing": "Blue vinyl, 2LP"}
check("round trip: an order", *back(order, list(order), I.read_want, S.want_notes))
check("round trip: an order with only a shop", *back({"status": "ordered", "shop": "Discogs"}, ["status", "shop"], I.read_want, S.want_notes))
own = {"status": "own", "pressing": "1971 UK first press", "matrix": "Side A: YEX 773-1 · Side B: YEX 774-1", "shop": "Reckless",
       "acquired": "2024-05-03", "paid": "45", "why": "My dad's favourite."}
check("round trip: an owned copy's pressing, runout, shop, date, price and why", *back(own, list(own)[1:], I.read_coll, S.coll_notes))
check("round trip: an owned copy with only a price", *back({"status": "own", "paid": "20"}, ["paid"], I.read_coll, S.coll_notes))
copy = I.read_want(S.copy_notes({"priority": 2}, {"name": "Half-speed", "budget": "40"}))
check("round trip: a copy's name and budget", copy.get("pressing") == "Half-speed" and copy.get("budget") == "40", copy)
several = I.read_want(S.want_notes({"status": "wish", "priority": 1, "copyName": "UK first", "budget": "150",
                                    "moreCopies": [{"name": "Half-speed", "budget": "40"}]}))
check("with copies, only the priority (each copy's own note has its name and budget)", several == {"priority": 1}, several)
cut = I.read_coll(S.coll_notes({**own, "why": "x" * 300}))
check("a line Discogs cut short isn't read as a value", cut.get("matrix") == own["matrix"] and "why" not in cut, cut)
cut = I.read_want(S.want_notes({**hunt, "pressing": "y" * 300}))
check("a wantlist note Discogs cut gives only its priority", cut == {"priority": 1}, cut)
shop = I.read_coll(S.coll_notes({"shop": "Reckless (Soho)"}))
check("parentheses in a shop's name aren't a date", shop == {"shop": "Reckless (Soho)"}, shop)
coll = [{**rel(20, "Let It Bleed", "The Rolling Stones"), "notes": [{"field_id": 3, "value": S.coll_notes(own)}]}]
wants = [{**rel(21, "Blue", "Joni Mitchell"), "notes": S.want_notes(order)}, {**rel(22, "Court and Spark", "Joni Mitchell"), "notes": "Got this from Bob"}]
sys.argv = ["x", os.path.join(tmp, "empty"), os.path.join(tmp, "notes.json")]
os.makedirs(os.path.join(tmp, "empty"))
I.main()
got = {w["doc_id"]: w["data"] for w in json.load(open(os.path.join(tmp, "notes.json"))) if w["collection"] == "records"}
check("import: an owned copy's note fills its fields and isn't kept as a note",
      got["dg-20"]["matrix"] == own["matrix"] and got["dg-20"]["paid"] == "45" and got["dg-20"]["notes"] == [], got["dg-20"])
check("import: an order comes back as an order", got["dg-21"]["status"] == "ordered" and got["dg-21"]["orderStatus"] == "shipped", got["dg-21"])
check("import: any other note stays a note", got["dg-22"]["priority"] == 2 and "Got this from Bob" in got["dg-22"]["notes"][0]["t"], got["dg-22"])
check("notes in other shapes aren't read", I.read_want("Got this from Bob") == {} and I.read_coll("Signed copy") == {})

# --- sync: a run with a lot to sync stops starting records after its budget, and says how many wait
for i in range(3):
    with open(os.path.join(tmp, "wall", f"s{i}.json"), "w") as fh:
        json.dump({"id": f"s{i}", "version": 1, "data": {"title": f"T{i}", "artist": "A", "status": "own"}}, fh)
S.wantlist = lambda: set()
S.sync_one = lambda d, wants, sync: {"discogsSync": {"state": "synced"}}
S.BUDGET = -1
sys.argv = ["x", os.path.join(tmp, "wall"), os.path.join(tmp, "sync.json")]
S.main()
sw = json.load(open(os.path.join(tmp, "sync.json")))
check("sync: past its budget it leaves the rest for the next run and says how many",
      [w["collection"] for w in sw] == ["settings"] and sw[-1]["data"]["syncLeft"] == 4 and sw[-1]["data"]["run"]["beatMs"] > 0, sw)
S.BUDGET = 600
S.main()
sw = json.load(open(os.path.join(tmp, "sync.json")))
check("sync: every write to an existing doc is pinned", pinned(sw), sw)
check("sync: within it, every record syncs and nothing is left", len(sw) == 5 and sw[-1]["data"]["syncLeft"] == 0, sw)
sys.exit(1 if fails else 0)
