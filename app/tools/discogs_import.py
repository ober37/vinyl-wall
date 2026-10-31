#!/usr/bin/env python3
"""Vinyl Wall <- Discogs import (adds what's on Discogs but not on the wall yet).

Usage: DISCOGS_TOKEN=... DISCOGS_USER=... python3 -I discogs_import.py <records_dir> <out.json>

<records_dir> holds the wall's record docs as written by ArtifactData list/out_dir (each file either
{"id","data","version"} or the raw doc). Writes <out.json>: a list of DB writes
[{"op":"set","collection":"records","doc_id","data"}] for NEW records (and pinned updates adding other copies you have to
owned records already on the wall, below), then one update to settings/site that marks
the import done (so the records and that mark land together; the task puts settings/site's current version in place
of its if_version "SETTINGS_VERSION"), and prints a one-line report.

Rules:
  - Collection items become owned records; wantlist items become hunt records ("Want").
  - Nothing already on the wall is changed. A Discogs item is "already on the wall" if a record has the
    same release id (discogsId or discogsSync.rid) or the same artist + title (ignoring case, punctuation,
    "The", and Discogs' "(2)"/"*" suffixes). A release in both the collection and the wantlist is imported once, as owned.
  - Several collection items of one album (two pressings, or two copies of one) make one owned record: the first is
    the record's own copy, the others its other copies you have (ownedCopies, #121), each with its grades, date and
    what its notes give back, its item listed in discogsSync.ownedInsts as adopted so the sync manages it.
  - The one change to a record already on the wall: a collection item of an album it owns, that no record keeps
    (discogsSync.instanceId or ownedInsts), joins it the same way, as another copy you have. Only records already
    linked to a collection item (discogsSync.instanceId) gain them, so a record's own copy is never added twice; an
    earlier import skipped these, so a re-run brings them in, and a second re-run adds nothing.
  - Several wantlist releases of one album make one record: the first is the record's own pressing, the others become
    its more copies (moreCopies, each with its release id, listed in discogsSync.copyRids so the sync manages them).
    An album in the collection keeps its wantlist pressings as copies it still wants. An album already on the wall
    gets none of them.
  - Imported records are marked as already synced (discogsSync), so the wall -> Discogs sync never re-adds
    them, and collection copies are marked adopted, so the wall never deletes them from Discogs.
  - Notes the wall's sync wrote (discogs_sync.py coll_notes / want_notes / copy_notes) are read back into fields: a
    hunt's priority, target pressing and budget, an order's shop, dates and status, an owned copy's pressing, runout,
    shop, date and price. A note in any other shape, or one Discogs cut at 255 characters, stays a note as well.
  - Covers, runtime etc. are left for the background task (needsEnrich).
  - Deterministic doc ids ("dg-<release id>") make a re-run harmless.
"""
import json, os, re, sys, time, glob, datetime, urllib.request, urllib.parse, urllib.error

API = "https://api.discogs.com"
UA = "VinylWall/1.0 +https://github.com/ober37/vinyl-wall"
MAX_ITEMS = 1000
GRADE_BACK = {"Mint (M)": "M", "Near Mint (NM or M-)": "NM", "Very Good Plus (VG+)": "VG+", "Very Good (VG)": "VG",
              "Good Plus (G+)": "G+", "Good (G)": "G", "Fair (F)": "F", "Poor (P)": "P"}
_last = [0.0]
CUT = 254  # Discogs keeps 255 characters of a note; one this long may have lost its end

# the shapes discogs_sync.py writes
PRIORITY = {"Top want": 1, "Want": 2, "Someday": 3}
ORDER_STATUS = {"Pre-order": "preorder", "Shipped": "shipped", "Delayed": "delayed"}
ORDER = re.compile(r"On order(?: from (?P<shop>.+?))?(?: \(ordered (?P<orderDate>[^)]*)\))?(?:\. (?P<orderStatus>"
                   + "|".join(ORDER_STATUS) + r"))?(?:, expected (?P<eta>.+?))?(?:\. Edition: (?P<pressing>.+))?", re.S)
WANT = re.compile(r"(?P<priority>" + "|".join(PRIORITY) + r")(?:\. Target: (?P<target>.+?)|\. Targets: .+?)?(?:\. Budget \$(?P<budget>\S+))?", re.S)
BOUGHT = re.compile(r"Bought: ?(?P<shop>.*?)(?: ?\((?P<acquired>\d{4}-\d\d-\d\d)\))?(?: ?\$(?P<paid>\S+))?")


def take_note(rec, note, read, prefix):
    """Fill rec from a note the wall wrote; keep the note itself when it's in another shape or may have lost its end."""
    back = read(note)
    rec.update(back)
    if note and (not back or len(note) >= CUT):
        rec["notes"].append({"d": today(), "t": prefix + note[:500]})


def read_want(note):
    """A wantlist note the wall wrote, as record fields ({} for any other note). A note Discogs cut gives only what
    comes first (an order, or the priority), since its last value may have lost its end. With several copies
    ("Targets: …") only the priority is read: each copy's own note carries its name and budget, and the list leaves
    out a record with no copy of its own, so its first entry may not be the record's."""
    cut = len(note) >= CUT
    m = ORDER.fullmatch(note)
    if m:
        f = {k: v for k, v in m.groupdict().items() if v}
        if "orderStatus" in f:
            f["orderStatus"] = ORDER_STATUS[f["orderStatus"]]
        return {"status": "ordered"} if cut else {"status": "ordered", **f}
    m = WANT.fullmatch(note)
    if not m:
        return {}
    f = {"priority": PRIORITY[m["priority"]]}
    if cut:
        return f
    if m["target"]:
        f["pressing"] = m["target"]
    if m["budget"]:
        f["budget"] = m["budget"]
    return f


def read_coll(note):
    """A collection Notes field the wall wrote, as record fields ({} for any other note)."""
    f, why = {}, []
    for line in note.split("\n"):
        if line.endswith("…"):  # the line Discogs' 255 characters cut short: kept in the note only
            continue
        if line.startswith("Pressing: "):
            f["pressing"] = line[10:]
        elif line.startswith("Runout: "):
            f["matrix"] = line[8:]
        elif line.startswith("Bought: "):
            f.update({k: v for k, v in BOUGHT.fullmatch(line).groupdict().items() if v})
        else:
            why.append(line)
    if f and why:
        f["why"] = " ".join(why)
    return f


def call(path, params=None):
    wait = 1.1 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"Authorization": "Discogs token=" + os.environ["DISCOGS_TOKEN"], "User-Agent": UA})
    for attempt in range(4):
        try:
            _last[0] = time.time()
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(15)
                continue
            raise RuntimeError(f"GET {path} -> {e.code}")
        except (urllib.error.URLError, ConnectionError):
            if attempt < 3:
                time.sleep(3)
                continue
            raise


def pages(path, key):
    out, page = [], 1
    while len(out) < MAX_ITEMS:
        r = call(path, {"per_page": 100, "page": page})
        out += r.get(key, [])
        if page >= r.get("pagination", {}).get("pages", 1):
            break
        page += 1
    return out[:MAX_ITEMS]


def clean_name(s):
    return re.sub(r"\s*\(\d+\)$", "", (s or "").replace("*", "")).strip()


def norm(s):
    s = re.sub(r"\s*\(\d+\)|\*", "", (s or "").lower()).replace("&", " and ")
    return "".join(w for w in re.split(r"[^a-z0-9]+", s) if w and w != "the")


def artist_of(bi):
    parts = []
    for a in bi.get("artists", []):
        parts.append(clean_name(a.get("anv") or a.get("name")))
        if a.get("join") and a["join"].strip() not in (",",):
            parts.append(a["join"].strip())
    return " ".join(p for p in parts if p).replace(" ,", ",").strip() or "Unknown artist"


def pressing_of(bi, limit=120):
    bits = []
    for f in bi.get("formats", []):
        d = [x for x in f.get("descriptions", []) if x not in ("Album",)]
        if f.get("text"):
            d.append(f["text"])
        if d:
            bits.append(", ".join(d))
    out = ""
    for i, b in enumerate(bits):  # keep whole parts only, never cut mid-word
        nxt = (out + "; " + b) if out else b
        if len(nxt) > limit:
            if out:
                return out + "; +%d more" % (len(bits) - i)
            return b[:limit].rsplit(" ", 1)[0].rstrip(",;") + "…"
        out = nxt
    return out


def today():
    return datetime.date.today().isoformat()


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def load_docs(dirpath):
    """The wall's record docs as (doc_id, version, data)."""
    docs = []
    for f in sorted(glob.glob(os.path.join(dirpath, "**", "*.json"), recursive=True)):
        with open(f) as fh:
            j = json.load(fh)
        if isinstance(j.get("data"), dict):
            docs.append((j.get("id") or os.path.basename(f)[:-5], j.get("version"), j["data"]))
        else:
            docs.append((os.path.basename(f)[:-5], None, j))
    return docs


def load(dirpath):
    docs = []
    for f in sorted(glob.glob(os.path.join(dirpath, "**", "*.json"), recursive=True)):
        with open(f) as fh:
            j = json.load(fh)
        docs.append(j["data"] if isinstance(j.get("data"), dict) else j)
    return docs  # records marked deleted still count: they're on their way off Discogs, so don't bring them back


def base_record(bi, status, ms):
    lab = (bi.get("labels") or [{}])[0]
    rec = {"title": (bi.get("title") or "").strip(), "artist": artist_of(bi), "status": status,
           "year": str(bi.get("year")) if bi.get("year") else "", "label": clean_name(lab.get("name")),
           "catalog": "" if (lab.get("catno") or "").lower() == "none" else (lab.get("catno") or ""),
           "pressing": pressing_of(bi), "discogsId": bi["id"], "discogsMatch": "imported from Discogs",
           "notes": [], "why": "", "added": ms, "needsEnrich": True, "importedFrom": "discogs",
           "autoFilled": ["year", "label"]}
    img = bi.get("cover_image") or ""
    if img.startswith("https://") and "spacer.gif" not in img:
        rec["coverHint"] = img  # Discogs' own picture of this exact pressing; part A tries it first
    return rec


def owned_copy(it, bi):
    """A collection item of an album already made in this run, as one of its other copies (ownedCopies)."""
    lab = (bi.get("labels") or [{}])[0]
    fields = {f.get("field_id"): f.get("value") for f in it.get("notes") or []}
    c = {"name": "", "pressing": pressing_of(bi), "label": clean_name(lab.get("name")),
         "catalog": "" if (lab.get("catno") or "").lower() == "none" else (lab.get("catno") or ""), "matrix": "",
         "discogsId": bi["id"], "mediaGrade": GRADE_BACK.get(fields.get(1), ""), "sleeveGrade": GRADE_BACK.get(fields.get(2), ""),
         "paid": "", "shop": "", "shopUrl": "", "acquired": (it.get("date_added") or "")[:10]}
    back = read_coll((fields.get(3) or "").strip())
    back.pop("why", None)  # the album's, already on the record
    c.update(back)
    return c


def main():
    src, dst = sys.argv[1], sys.argv[2]
    user = os.environ["DISCOGS_USER"]
    docs = load_docs(src)
    wall = [d for _, _, d in docs]
    # the collection items records keep, and the owned records linked to one, by album: another copy of theirs joins them
    kept, mine = set(), {}
    for doc_id, ver, d in docs:
        s = d.get("discogsSync") if isinstance(d.get("discogsSync"), dict) else {}
        if s.get("instanceId"):
            kept.add(s["instanceId"])
        kept.update(x.get("instanceId") for x in s.get("ownedInsts") or [] if isinstance(x, dict))
        if (d.get("status") or "own") == "own" and not d.get("deleted") and s.get("instanceId") and ver:
            mine.setdefault((norm(d.get("artist")), norm(d.get("title"))), (doc_id, ver, d))
    kept.discard(None)
    joined = {}  # doc_id -> (version, ownedCopies, ownedInsts) for records already on the wall gaining copies
    ids, keys = set(), set()
    for d in wall:
        for v in (d.get("discogsId"), (d.get("discogsSync") or {}).get("rid")):
            try:
                if v:
                    ids.add(int(str(v).strip()))
            except ValueError:
                pass
        keys.add((norm(d.get("artist")), norm(d.get("title"))))

    coll = pages(f"/users/{urllib.parse.quote(user)}/collection/folders/0/releases", "releases")
    wants = pages(f"/users/{urllib.parse.quote(user)}/wants", "wants")

    writes, seen, n_own, n_want, skipped, n_copies, n_owned_more = [], set(), 0, 0, 0, 0, 0
    hunts = {}  # (artist, title) -> the record made in this run, for the album's other wantlist pressings
    ms = int(time.time() * 1000)

    def already(bi):
        return bi["id"] in ids or bi["id"] in seen or (norm(artist_of(bi)), norm(bi.get("title"))) in keys

    for it in coll:
        bi = it.get("basic_information") or {}
        if not bi.get("id"):
            continue
        key = (norm(artist_of(bi)), norm(bi.get("title")))
        if it.get("instance_id") in kept:  # a record keeps it already
            skipped += 1
            continue
        if key in mine:  # another copy of an album the wall owns, that an earlier import skipped
            doc_id, ver, d = mine[key]
            j = joined.setdefault(doc_id, (ver, [c for c in d.get("ownedCopies") or [] if isinstance(c, dict)],
                                           [x for x in (d.get("discogsSync") or {}).get("ownedInsts") or [] if isinstance(x, dict)]))
            j[1].append(owned_copy(it, bi))
            j[2].append({"rid": bi["id"], "instanceId": it.get("instance_id"), "adopted": True})
            kept.add(it.get("instance_id")); n_owned_more += 1
            continue
        if key in hunts:  # another copy of an album made owned in this run
            hunts[key].setdefault("ownedCopies", []).append(owned_copy(it, bi))
            hunts[key]["discogsSync"].setdefault("ownedInsts", []).append(
                {"rid": bi["id"], "instanceId": it.get("instance_id"), "adopted": True})
            seen.add(bi["id"]); n_owned_more += 1
            continue
        if already(bi):
            skipped += 1
            continue
        rec = base_record(bi, "own", ms + len(writes))
        fields = {f.get("field_id"): f.get("value") for f in it.get("notes") or []}
        if GRADE_BACK.get(fields.get(1)):
            rec["mediaGrade"] = GRADE_BACK[fields[1]]
        if GRADE_BACK.get(fields.get(2)):
            rec["sleeveGrade"] = GRADE_BACK[fields[2]]
        if it.get("date_added"):
            rec["acquired"] = it["date_added"][:10]
        take_note(rec, (fields.get(3) or "").strip(), read_coll, "Notes from Discogs: ")
        rec["discogsSync"] = {"state": "synced", "at": now(), "rid": bi["id"], "where": "collection",
                              "instanceId": it.get("instance_id"), "adopted": True}
        writes.append({"op": "set", "collection": "records", "doc_id": f"dg-{bi['id']}", "data": rec})
        seen.add(bi["id"]); keys.add((norm(rec["artist"]), norm(rec["title"]))); n_own += 1
        hunts.setdefault((norm(rec["artist"]), norm(rec["title"])), rec)

    for it in wants:
        bi = it.get("basic_information") or {}
        if not bi.get("id"):
            continue
        key = (norm(artist_of(bi)), norm(bi.get("title")))
        if key in hunts and bi["id"] not in seen:
            lab = (bi.get("labels") or [{}])[0]
            back = read_want((it.get("notes") or "").strip())  # a copy's note: "Want. Target: <name>. Budget $<budget>"
            hunts[key].setdefault("moreCopies", []).append({
                "name": back.get("pressing", ""), "pressing": pressing_of(bi), "label": clean_name(lab.get("name")),
                "catalog": "" if (lab.get("catno") or "").lower() == "none" else (lab.get("catno") or ""),
                "budget": back.get("budget", ""), "discogsId": bi["id"]})
            hunts[key]["discogsSync"].setdefault("copyRids", []).append(bi["id"])
            seen.add(bi["id"]); n_copies += 1
            continue
        if already(bi):
            skipped += 1
            continue
        rec = base_record(bi, "wish", ms + len(writes))
        rec["priority"] = 2
        take_note(rec, (it.get("notes") or "").strip(), read_want, "Wantlist note from Discogs: ")
        rec["discogsSync"] = {"state": "synced", "at": now(), "rid": bi["id"], "where": "wantlist"}
        writes.append({"op": "set", "collection": "records", "doc_id": f"dg-{bi['id']}", "data": rec})
        seen.add(bi["id"]); keys.add((norm(rec["artist"]), norm(rec["title"]))); n_want += 1
        hunts[key] = rec

    for doc_id, (ver, copies, insts) in joined.items():
        writes.append({"op": "update", "collection": "records", "doc_id": doc_id, "if_version": ver,
                       "data": {"ownedCopies": copies, "discogsSync": {"ownedInsts": insts}}})
    capped = " (stopped at 1000 items)" if len(coll) >= MAX_ITEMS or len(wants) >= MAX_ITEMS else ""
    more = (f"; {n_copies} more pressings became copies" if n_copies != 1 else "; 1 more pressing became a copy") if n_copies else ""
    if n_owned_more:
        more += f"; {n_owned_more} more copies you have joined their albums" if n_owned_more != 1 else "; 1 more copy you have joined its album"
    report = f"Imported {n_own + n_want} records ({n_own} owned, {n_want} wanted){more}; {skipped} skipped as already on the wall{capped}."
    DEL = {"__delete__": True}
    writes.append({"op": "update", "collection": "settings", "doc_id": "site", "if_version": "SETTINGS_VERSION", "data": {"run": {"beatMs": int(time.time() * 1000)}, "discogs": {
        "importRequested": DEL, "importRequestedAt": DEL, "importedAt": now(), "importMsg": report}}})
    with open(dst, "w") as fh:
        json.dump(writes, fh, indent=1)
    print(report)


if __name__ == "__main__":
    main()
