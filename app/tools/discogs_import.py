#!/usr/bin/env python3
"""Vinyl Wall <- Discogs import (adds what's on Discogs but not on the wall yet).

Usage: DISCOGS_TOKEN=... DISCOGS_USER=... python3 -I discogs_import.py <records_dir> <out.json>

<records_dir> holds the wall's record docs as written by ArtifactData list/out_dir (each file either
{"id","data","version"} or the raw doc). Writes <out.json>: a list of DB writes
[{"op":"set","collection":"records","doc_id","data"}] for NEW records only, and prints a one-line report.

Rules:
  - Collection items become owned records; wantlist items become hunt records ("Want").
  - Nothing already on the wall is changed. A Discogs item is "already on the wall" if a record has the
    same release id (discogsId or discogsSync.rid) or the same artist + title (ignoring case, punctuation,
    "The", and Discogs' "(2)"/"*" suffixes). A release in both the collection and the wantlist is imported once, as owned.
  - Several wantlist releases of one album make one hunt record: the first is the record's own pressing, the others
    become its more copies (moreCopies, each with its release id). An album already on the wall gets none of them.
  - Imported records are marked as already synced (discogsSync), so the wall -> Discogs sync never re-adds
    them, and collection copies are marked adopted, so the wall never deletes them from Discogs.
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


def main():
    src, dst = sys.argv[1], sys.argv[2]
    user = os.environ["DISCOGS_USER"]
    wall = load(src)
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

    writes, seen, n_own, n_want, skipped, n_copies = [], set(), 0, 0, 0, 0
    hunts = {}  # (artist, title) -> the hunt record made in this run, for its other pressings
    ms = int(time.time() * 1000)

    def already(bi):
        return bi["id"] in ids or bi["id"] in seen or (norm(artist_of(bi)), norm(bi.get("title"))) in keys

    for it in coll:
        bi = it.get("basic_information") or {}
        if not bi.get("id"):
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
        if (fields.get(3) or "").strip():
            rec["notes"].append({"d": today(), "t": "Notes from Discogs: " + fields[3].strip()[:500]})
        if it.get("date_added"):
            rec["acquired"] = it["date_added"][:10]
        rec["discogsSync"] = {"state": "synced", "at": now(), "rid": bi["id"], "where": "collection",
                              "instanceId": it.get("instance_id"), "adopted": True}
        writes.append({"op": "set", "collection": "records", "doc_id": f"dg-{bi['id']}", "data": rec})
        seen.add(bi["id"]); keys.add((norm(rec["artist"]), norm(rec["title"]))); n_own += 1

    for it in wants:
        bi = it.get("basic_information") or {}
        if not bi.get("id"):
            continue
        key = (norm(artist_of(bi)), norm(bi.get("title")))
        if key in hunts and bi["id"] not in seen:
            lab = (bi.get("labels") or [{}])[0]
            hunts[key].setdefault("moreCopies", []).append({
                "name": "", "pressing": pressing_of(bi), "label": clean_name(lab.get("name")),
                "catalog": "" if (lab.get("catno") or "").lower() == "none" else (lab.get("catno") or ""),
                "budget": "", "discogsId": bi["id"]})
            seen.add(bi["id"]); n_copies += 1
            continue
        if already(bi):
            skipped += 1
            continue
        rec = base_record(bi, "wish", ms + len(writes))
        rec["priority"] = 2
        if (it.get("notes") or "").strip():
            rec["notes"].append({"d": today(), "t": "Wantlist note from Discogs: " + it["notes"].strip()[:500]})
        rec["discogsSync"] = {"state": "synced", "at": now(), "rid": bi["id"], "where": "wantlist"}
        writes.append({"op": "set", "collection": "records", "doc_id": f"dg-{bi['id']}", "data": rec})
        seen.add(bi["id"]); keys.add((norm(rec["artist"]), norm(rec["title"]))); n_want += 1
        hunts[key] = rec

    with open(dst, "w") as fh:
        json.dump(writes, fh, indent=1)
    capped = " (stopped at 1000 items)" if len(coll) >= MAX_ITEMS or len(wants) >= MAX_ITEMS else ""
    more = (f"; {n_copies} more pressings became copies" if n_copies != 1 else "; 1 more pressing became a copy") if n_copies else ""
    print(f"Imported {n_own + n_want} records ({n_own} owned, {n_want} wanted){more}; {skipped} skipped as already on the wall{capped}.")


if __name__ == "__main__":
    main()
