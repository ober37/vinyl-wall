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
    calls.append((method, path, (body or {}).get("notes", (body or {}).get("value"))))
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

# --- several owned copies on one record (#121)
graded = lambda r, inst, note="": {**r, "instance_id": inst, "date_added": "2024-02-03T10:00:00-08:00",
                                   "notes": [{"field_id": 1, "value": "Near Mint (NM or M-)"}, {"field_id": 3, "value": note}]}
coll = [graded(rel(30, "Blue Train", "John Coltrane", "Blue Note", "BLP 1577"), 300),
        graded(rel(31, "Blue Train", "John Coltrane", "Blue Note", "BST 81577"), 310, S.coll_notes({"shop": "Amoeba", "paid": "35", "why": "x"})),
        graded(rel(30, "Blue Train", "John Coltrane", "Blue Note", "BLP 1577"), 301)]
wants = []
sys.argv = ["x", os.path.join(tmp, "empty"), os.path.join(tmp, "owned.json")]
I.main()
ow = json.load(open(os.path.join(tmp, "owned.json")))
got = {w["doc_id"]: w["data"] for w in ow if w["collection"] == "records"}
bt = got.get("dg-30", {})
check("import: two pressings and a second copy of one album make one owned record", set(got) == {"dg-30"}, sorted(got))
check("import: the other copies are its ownedCopies, with release, grade, date and notes",
      [(c["discogsId"], c["mediaGrade"], c["acquired"], c["shop"], c["paid"]) for c in bt.get("ownedCopies", [])]
      == [(31, "NM", "2024-02-03", "Amoeba", "35"), (30, "NM", "2024-02-03", "", "")] and "why" not in bt["ownedCopies"][0], bt.get("ownedCopies"))
check("import: the sync is told about their items, adopted",
      bt.get("discogsSync", {}).get("ownedInsts") == [{"rid": 31, "instanceId": 310, "adopted": True}, {"rid": 30, "instanceId": 301, "adopted": True}],
      bt.get("discogsSync"))
check("import: the report counts them", "2 more copies you have joined their albums" in ow[-1]["data"]["discogs"]["importMsg"], ow[-1])

# an earlier import skipped another copy of an album already on the wall: a re-run adds it to that record, once
os.makedirs(os.path.join(tmp, "had"))
with open(os.path.join(tmp, "had", "bt.json"), "w") as fh:
    json.dump({"id": "bt", "version": 7, "data": {"title": "Blue Train", "artist": "John Coltrane", "status": "own", "discogsId": 30,
                                                  "discogsSync": {"rid": 30, "instanceId": 300, "adopted": True}}}, fh)
with open(os.path.join(tmp, "had", "typed.json"), "w") as fh:  # typed on the wall, never linked to a collection item
    json.dump({"id": "typed", "version": 2, "data": {"title": "Giant Steps", "artist": "John Coltrane", "status": "own"}}, fh)
coll = [graded(rel(30, "Blue Train", "John Coltrane"), 300), graded(rel(31, "Blue Train", "John Coltrane"), 310),
        graded(rel(50, "Giant Steps", "John Coltrane"), 500)]
wants = []
sys.argv = ["x", os.path.join(tmp, "had"), os.path.join(tmp, "rerun.json")]
I.main()
rw = json.load(open(os.path.join(tmp, "rerun.json")))
upd = [w for w in rw if w["collection"] == "records"]
check("re-import: the skipped copy joins the record already on the wall, pinned, and nothing else changes",
      [(w["op"], w["doc_id"], w.get("if_version")) for w in upd] == [("update", "bt", 7)]
      and [c["discogsId"] for c in upd[0]["data"]["ownedCopies"]] == [31]
      and upd[0]["data"]["discogsSync"] == {"ownedInsts": [{"rid": 31, "instanceId": 310, "adopted": True}]}, upd)
check("re-import: a record never linked to a collection item gains nothing (its own copy may be that item)",
      not any(w["doc_id"] == "typed" for w in upd), upd)
with open(os.path.join(tmp, "had", "bt.json"), "w") as fh:
    json.dump({"id": "bt", "version": 8, "data": {"title": "Blue Train", "artist": "John Coltrane", "status": "own", "discogsId": 30,
                                                  "ownedCopies": upd[0]["data"]["ownedCopies"],
                                                  "discogsSync": {"rid": 30, "instanceId": 300, "adopted": True, **upd[0]["data"]["discogsSync"]}}}, fh)
I.main()
rw = json.load(open(os.path.join(tmp, "rerun.json")))
check("re-import: a second re-run adds nothing", not any(w["doc_id"] == "bt" for w in rw), rw)

insts = {}
S.instances = lambda rid: insts.get(rid, [])
calls.clear()
mine = {"title": "Blue Train", "artist": "John Coltrane", "status": "own", "discogsId": 30, "why": "Lee Morgan!",
        "ownedCopies": [{"name": "Stereo", "pressing": "1966 stereo", "discogsId": 31, "mediaGrade": "VG+", "shop": "Amoeba", "paid": "35"},
                        {"name": "Typed", "pressing": "no release"}]}
sync = {"rid": 30, "where": "collection", "state": "synced", "instanceId": 300}
insts[30] = [{"instance_id": 300, "folder_id": 1}]
S.sync_one(mine, set(), sync)
check("sync: another copy you have goes in the collection with its grade and notes",
      ("POST", "/users/u/collection/folders/1/releases/31", None) in calls
      and ("POST", "/users/u/collection/folders/1/releases/31/instances/77/fields/3", "Pressing: 1966 stereo\nBought: Amoeba $35\nLee Morgan!") in calls
      and any(c[1].endswith("/31/instances/77/fields/1") for c in calls), calls)
check("sync: ownedInsts remembers it; a copy with no release isn't guessed",
      sync.get("ownedInsts") == [{"rid": 31, "instanceId": 77, "adopted": False}] and sum(c[0] == "GET" for c in calls) == 0, sync)

calls.clear()
insts[31] = [{"instance_id": 77, "folder_id": 1}]
S.sync_one(mine, set(), sync)
check("sync: a second run edits the same item, adds none", not any(c[1] == "/users/u/collection/folders/1/releases/31" for c in calls), calls)

calls.clear()
S.sync_one({**mine, "ownedCopies": []}, set(), sync)
check("sync: a removed copy's item comes off the collection",
      ("DELETE", "/users/u/collection/folders/1/releases/31/instances/77", None) in calls and "ownedInsts" not in sync, calls)

calls.clear()
sync = {"rid": 30, "where": "collection", "state": "synced", "instanceId": 300, "ownedInsts": [{"rid": 31, "instanceId": 310, "adopted": True}]}
insts[31] = [{"instance_id": 310, "folder_id": 1}]
S.sync_one({**mine, "ownedCopies": []}, set(), sync)
check("sync: a copy's item that was already in the collection is never deleted", not any(c[0] == "DELETE" for c in calls), calls)

# two copies of one release, one's item deleted on Discogs: the other keeps its own, and the first gets a new one
calls.clear()
two = {**mine, "ownedCopies": [{"name": "B", "discogsId": 5}, {"name": "C", "discogsId": 5}]}
sync = {"rid": 30, "where": "collection", "state": "synced", "instanceId": 300,
        "ownedInsts": [{"rid": 5, "instanceId": 2, "adopted": False}, {"rid": 5, "instanceId": 3, "adopted": False}]}
insts[5] = [{"instance_id": 3, "folder_id": 1}]
S.sync_one(two, set(), sync)
check("sync: a copy whose item went never takes another copy's, and nothing it keeps comes off",
      sorted(x["instanceId"] for x in sync["ownedInsts"]) == [3, 77] and not any(c[0] == "DELETE" and "/instances/3" in c[1] for c in calls), (sync, calls))

# the first copy's release set to one another copy's item stands for: it gets an item of its own
calls.clear()
sync = {"rid": 30, "where": "collection", "state": "synced", "instanceId": 300, "ownedInsts": [{"rid": 31, "instanceId": 77, "adopted": False}]}
insts[31] = [{"instance_id": 77, "folder_id": 1}]
S.sync_one({**mine, "discogsId": 31, "ownedCopies": [{"name": "Stereo", "discogsId": 31}]}, set(), sync)
check("sync: the first copy never shares an item with another copy",
      ("POST", "/users/u/collection/folders/1/releases/31", None) in calls and [x["instanceId"] for x in sync["ownedInsts"]] == [77], (sync, calls))

# a call failing after a new item was made: the item is already recorded, so the error keeps it known
def failing(method, path, params=None, body=None, ok404=False):
    if path.endswith("/fields/3") and "/releases/9/" in path:
        raise RuntimeError("POST -> 500")
    return fake_call(method, path, params, body, ok404)
S.call = failing
insts[9] = []
sync = {"rid": 30, "where": "collection", "state": "synced", "instanceId": 300}
try:
    S.sync_one({**mine, "ownedCopies": [{"name": "New", "discogsId": 9}]}, set(), sync)
except RuntimeError:
    pass
S.call = fake_call
check("sync: a new item is recorded before a later call fails", sync.get("ownedInsts") == [{"rid": 9, "instanceId": 77, "adopted": False}], sync)

# the first copy removed: the next moves into the record's fields, and its item becomes the record's
calls.clear()
sync = {"rid": 30, "where": "collection", "state": "synced", "instanceId": 300, "ownedInsts": [{"rid": 31, "instanceId": 77, "adopted": False}]}
insts[31] = [{"instance_id": 77, "folder_id": 1}]
S.sync_one({**mine, "discogsId": 31, "ownedCopies": []}, set(), sync)
check("sync: the copy moved into first place keeps its item",
      sync.get("instanceId") == 77 and "ownedInsts" not in sync and not any(c[1] == "/users/u/collection/folders/1/releases/31" for c in calls)
      and not any(c[0] == "DELETE" and "/31/" in c[1] for c in calls), (sync, calls))
check("sync: the removed first copy's item comes off", ("DELETE", "/users/u/collection/folders/1/releases/30/instances/300", None) in calls, calls)

calls.clear()
sync = {"rid": 30, "where": "collection", "state": "synced", "instanceId": 300, "ownedInsts": [{"rid": 31, "instanceId": 77, "adopted": False}]}
S.sync_one({**mine, "status": "wish"}, set(), sync)
check("sync: back on the hunt, the other copies' items come off", ("DELETE", "/users/u/collection/folders/1/releases/31/instances/77", None) in calls
      and "ownedInsts" not in sync, calls)

# --- two records of one album merged from chat (#140): the record that went is deleted outright, its collection items
# moved into the kept record's ownedInsts and its wantlist entries into its copyRids
calls.clear()
sync = {"rid": 30, "where": "collection", "state": "synced", "instanceId": 300, "ownedInsts": [{"rid": 41, "instanceId": 410, "adopted": False}]}
insts[30], insts[41] = [{"instance_id": 300, "folder_id": 1}], [{"instance_id": 410, "folder_id": 1}]
S.sync_one({**mine, "ownedCopies": [{"name": "Merged", "discogsId": 41}]}, set(), sync)
check("merge: the other record's collection item stays and isn't added again",
      sync.get("ownedInsts") == [{"rid": 41, "instanceId": 410, "adopted": False}]
      and not any(c[1] == "/users/u/collection/folders/1/releases/41" or (c[0] == "DELETE" and "/41/" in c[1]) for c in calls), (sync, calls))

calls.clear()
w = {42, 43}
sync = {"rid": 30, "where": "collection", "state": "synced", "instanceId": 300, "copyRids": [42, 43]}
S.sync_one({**mine, "ownedCopies": [], "moreCopies": [{"name": "Merged want", "discogsId": 42}]}, w, sync)
check("merge: a moved wantlist entry that's still a copy stays, a guessed one comes off",
      ("DELETE", "/users/u/wants/43", None) in calls and not any(c[0] == "DELETE" and c[1] == "/users/u/wants/42" for c in calls)
      and sync.get("copyRids") == [42], (sync, calls))

# --- copies on order (#139): each is on the wantlist with its order's note, read back onto the copy on import
placed = {"name": "Blue vinyl", "orderStatus": "shipped", "shop": "Rough Trade", "orderDate": "2026-10-01", "eta": "2026-11-02"}
rt = I.read_want(S.copy_notes({"priority": 2}, placed))
check("round trip: a copy's order", rt == {"status": "ordered", "shop": "Rough Trade", "orderDate": "2026-10-01", "orderStatus": "shipped",
                                          "eta": "2026-11-02", "pressing": "Blue vinyl"}, rt)
calls.clear()
insts[50] = [{"instance_id": 500, "folder_id": 1}]
sync = {"rid": 50, "where": "collection", "state": "synced", "instanceId": 500}
S.sync_one({"title": "Blue", "artist": "Joni Mitchell", "status": "own", "discogsId": 50, "moreCopies": [{**placed, "discogsId": 51}]}, set(), sync)
check("sync: an owned record's copy on order is on the wantlist with its order",
      ("PUT", "/users/u/wants/51", None) in calls
      and ("POST", "/users/u/wants/51", "On order from Rough Trade (ordered 2026-10-01). Shipped, expected 2026-11-02. Edition: Blue vinyl") in calls
      and sync.get("copyRids") == [51], calls)
# an ordered record's second order arrives first: that copy is the record's now, and its first order a copy on order
calls.clear()
insts[52] = []
sync = {"rid": 51, "where": "wantlist", "state": "synced", "copyRids": [52]}
S.sync_one({"title": "Blue", "artist": "Joni Mitchell", "status": "own", "discogsId": 52, "moreCopies": [{**placed, "discogsId": 51}]}, {51, 52}, sync)
check("sync: the copy that came goes in the collection and off the wantlist",
      ("POST", "/users/u/collection/folders/1/releases/52", None) in calls and ("DELETE", "/users/u/wants/52", None) in calls, calls)
check("sync: the order still on its way stays on the wantlist with its note",
      not any(c[0] == "DELETE" and c[1] == "/users/u/wants/51" for c in calls)
      and ("POST", "/users/u/wants/51", "On order from Rough Trade (ordered 2026-10-01). Shipped, expected 2026-11-02. Edition: Blue vinyl") in calls, calls)

coll = [rel(60, "Blue", "Joni Mitchell", "Reprise", "MS 2038")]
wants = [{**rel(61, "Blue", "Joni Mitchell", "Rhino", "R1 2038"), "notes": "On order from Rough Trade (ordered 2026-10-01). Shipped. Edition: Blue vinyl"},
         rel(62, "Court and Spark", "Joni Mitchell", "Asylum", "7E-1001"),
         {**rel(63, "Court and Spark", "Joni Mitchell", "Asylum", "RE 2"), "notes": "On order from Rough Trade"}]
I.pages = lambda path, key: coll if key == "releases" else wants
os.makedirs(os.path.join(tmp, "empty139"))
sys.argv = ["x", os.path.join(tmp, "empty139"), os.path.join(tmp, "out2.json")]
I.main()
out = {w["doc_id"]: w["data"] for w in json.load(open(os.path.join(tmp, "out2.json"))) if w["collection"] == "records"}
bc = out.get("dg-60", {}).get("moreCopies", [])
check("import: an owned album's pressing on order comes back as a copy on order",
      len(bc) == 1 and bc[0].get("orderStatus") == "shipped" and bc[0].get("shop") == "Rough Trade" and bc[0].get("orderDate") == "2026-10-01"
      and bc[0].get("name") == "Blue vinyl", bc)
cs = out.get("dg-62", {}).get("moreCopies", [])
check("import: a hunt's other pressing stays a copy it wants, even with an order's note", len(cs) == 1 and "orderStatus" not in cs[0], cs)

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
