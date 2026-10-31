"""Offline checks for app/tools/barcodes.py, with canned Discogs releases. Run by dev/test.sh."""
import copy, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "tools"))
import barcodes as B

fails = 0


def check(name, ok, got=""):
    global fails
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {got!r}"))
    fails += not ok


def releases(by_id):
    asked = []

    def fetch(rid):
        asked.append(rid)
        return by_id.get(rid, {})
    fetch.asked = asked
    return fetch


REL = {
    1: {"identifiers": [{"type": "Barcode", "value": "0 602547 67023 3"}, {"type": "Matrix / Runout", "value": "A1"},
                        {"type": "Barcode", "value": "602547670233"}, {"type": "Barcode", "value": "Text only"}]},
    2: {"identifiers": [{"type": "Barcode", "value": "8717931357418"}]},
    3: {"identifiers": []},
}

check("codes: barcodes only, digits only, each once, text without digits left out", B.codes_of(REL[1]) == ["0602547670233", "602547670233"], B.codes_of(REL[1]))

records = {
    "own": {"title": "A", "status": "own", "discogsId": 1, "moreCopies": [{"pressing": "Mono", "discogsId": "2"}, {"pressing": "No release"}]},
    "wish": {"title": "B", "status": "wish", "discogsId": 3},
    "done": {"title": "C", "status": "wish", "discogsId": 2, "barcodes": {"rid": 2, "codes": ["8717931357418"]}},
    "moved": {"title": "D", "status": "wish", "discogsId": 2, "barcodes": {"rid": 1, "codes": ["0602547670233"]}},
    "gone": {"title": "E", "status": "wish", "discogsId": 1, "deleted": True},
    "example": {"title": "F", "status": "wish", "discogsId": 1, "example": True},
    "guess": {"title": "G", "status": "wish", "discogsId": 1, "discogsMatch": "vinyl: earliest original pressing", "barcodes": {"rid": 1, "codes": ["0602547670233"]},
              "moreCopies": [{"pressing": "Reissue", "discogsId": 2}]},
    "byCat": {"title": "H", "status": "wish", "discogsId": 3, "discogsMatch": "catalog+pressing"},
}
versions = {k: i + 1 for i, k in enumerate(records)}
f = releases(REL)
writes, lines = B.plan(copy.deepcopy(records), versions, f)
by = {w["doc_id"]: w for w in writes}
check("each release read once, none for a copy already done or a deleted or example record", sorted(f.asked) == [1, 2, 3], f.asked)
check("the record's own copy gets its barcodes beside its release", by["own"]["data"]["barcodes"] == {"rid": 1, "codes": ["0602547670233", "602547670233"]}, by.get("own"))
check("another copy gets its own, in its entry, the copy without a release left as it is",
      by["own"]["data"]["moreCopies"] == [{"pressing": "Mono", "discogsId": "2", "barcodes": {"rid": 2, "codes": ["8717931357418"]}, "releaseTracks": {"rid": 2, "tracks": []}}, {"pressing": "No release"}], by["own"]["data"].get("moreCopies"))
check("a release with no barcode keeps an empty list, so it isn't asked again", by["wish"]["data"] == {"barcodes": {"rid": 3, "codes": []}})
check("barcodes from another release are read again for this one", by["moved"]["data"] == {"barcodes": {"rid": 2, "codes": ["8717931357418"]}})
check("pinned to each record's version, and nothing for the rest", by["own"]["if_version"] == 1 and set(by) == {"own", "wish", "moved", "guess", "byCat"}, sorted(by))
check("a release the sync guessed gets no barcodes, its old ones go, and its chosen copies still get theirs",
      by["guess"]["data"] == {"barcodes": {"__delete__": True}, "moreCopies": [{"pressing": "Reissue", "discogsId": 2, "barcodes": {"rid": 2, "codes": ["8717931357418"]}, "releaseTracks": {"rid": 2, "tracks": []}}]}, by["guess"]["data"])
check("a release matched by catalog number is the pressing, so it gets its barcodes", by["byCat"]["data"] == {"barcodes": {"rid": 3, "codes": []}}, by["byCat"]["data"])
o = B.plan({"two": {"title": "I", "status": "own", "discogsId": 3, "barcodes": {"rid": 3, "codes": []},
                    "ownedCopies": [{"name": "Stereo", "discogsId": 2}, {"name": "Typed"}]}}, {"two": 9}, releases(REL))[0]
check("another copy you have gets its own, in its ownedCopies entry (#121)",
      o == [{"op": "update", "collection": "records", "doc_id": "two", "if_version": 9,
             "data": {"ownedCopies": [{"name": "Stereo", "discogsId": 2, "barcodes": {"rid": 2, "codes": ["8717931357418"]}, "releaseTracks": {"rid": 2, "tracks": []}}, {"name": "Typed"}]}}], o)
check("a line on what was done", lines == ["3 Discogs releases read, 2 with barcodes, 5 records to update."], lines)

f = releases(REL)
base = {k: v for k, v in records.items() if k not in ("guess", "byCat")}
writes, lines = B.plan(copy.deepcopy(base), versions, f, limit=1)
check("at most the limit of releases a run, one read serving every copy of it; the rest wait",
      f.asked == [2] and sorted(w["doc_id"] for w in writes) == ["moved", "own"] and "2 copies wait for the next run" in lines[0], (f.asked, writes, lines))

writes, _ = B.plan({"x": {"title": "X", "discogsId": 9}}, {"x": 1}, lambda rid: None)
check("a release that couldn't be read writes nothing, so it's tried next run", writes == [])

# each copy after the first keeps its release's tracklist and runtime (#138)
DELUXE = {"identifiers": [], "tracklist": [
    {"position": "A1", "title": "One", "duration": "4:30", "type_": "track"},
    {"position": "", "title": "Bonus", "type_": "heading"},
    {"position": "B1", "title": "Two", "duration": "1:02:00"},
    {"position": "C1", "title": "Demo", "duration": "3:30"}]}
PART = {"identifiers": [], "tracklist": [{"position": "A1", "title": "One", "duration": "4:30"}, {"position": "A2", "title": "Two"}]}
o = B.plan({"t": {"title": "T", "status": "own", "discogsId": 3, "barcodes": {"rid": 3, "codes": []},
                  "ownedCopies": [{"name": "Deluxe", "discogsId": 10}, {"name": "Part", "discogsId": 11}],
                  "moreCopies": [{"name": "Wanted", "discogsId": 11, "orderStatus": "shipped"}]}}, {"t": 4}, releases({10: DELUXE, 11: PART}))[0]
d = o[0]["data"]
check("a copy's tracks, headings left out, with its runtime when every track has a length",
      d["ownedCopies"][0]["releaseTracks"] == {"rid": 10, "tracks": [{"pos": "A1", "title": "One", "dur": "4:30"}, {"pos": "B1", "title": "Two", "dur": "1:02:00"},
                                                                    {"pos": "C1", "title": "Demo", "dur": "3:30"}], "runtime": 70}, d["ownedCopies"][0])
check("no runtime when a track has no length; a wanted or ordered copy gets its tracks too",
      d["ownedCopies"][1]["releaseTracks"] == {"rid": 11, "tracks": [{"pos": "A1", "title": "One", "dur": "4:30"}, {"pos": "A2", "title": "Two"}]}
      and d["moreCopies"][0]["releaseTracks"]["rid"] == 11, d)
check("the record's own copy gets no tracklist of its own: its tracks are the album's", "releaseTracks" not in d, d)
f = releases({10: DELUXE})
o = B.plan({"t": {"title": "T", "ownedCopies": [{"discogsId": 10, "barcodes": {"rid": 10, "codes": []}}]}}, {"t": 1}, f)[0]
check("a copy with barcodes but no tracklist yet is read once more for its tracks", f.asked == [10] and o[0]["data"]["ownedCopies"][0]["barcodes"] == {"rid": 10, "codes": []}
      and o[0]["data"]["ownedCopies"][0]["releaseTracks"]["rid"] == 10, o)
f = releases({10: DELUXE})
done = {"discogsId": 10, "barcodes": {"rid": 10, "codes": []}, "releaseTracks": {"rid": 10, "tracks": []}}
o = B.plan({"t": {"title": "T", "ownedCopies": [done, {**done, "discogsId": 11}]}}, {"t": 1}, releases({11: PART}))[0]
check("a copy whose release changed is read again, one already done isn't",
      o[0]["data"]["ownedCopies"][0] == done and o[0]["data"]["ownedCopies"][1]["releaseTracks"]["rid"] == 11, o)

print(f"{fails} failed" if fails else "all passed")
sys.exit(1 if fails else 0)
