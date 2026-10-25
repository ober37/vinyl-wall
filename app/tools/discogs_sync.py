#!/usr/bin/env python3
"""Vinyl Wall -> Discogs one-way sync.

Usage: DISCOGS_TOKEN=... python3 -I discogs_sync.py <records_dir> <out.json> [versions.json] [--all]
versions.json maps doc_id -> current version (from the ArtifactData list output) when the
exported files don't carry versions.
<records_dir> holds one JSON file per record doc as written by ArtifactData list/out_dir
(each file: {"id", "data", "version", ...} or the raw doc). Writes a list of DB writes
to <out.json>: [{"op":"update"|"delete","doc_id","if_version","data"}], then one update to settings/site that tells the
page the run is still going and how many records wait for the next run: the sync stops starting records after
BUDGET seconds, so a run with a lot to sync doesn't go quiet long enough for the page to take it for dead.

Mapping:
  status own      -> Collection (Uncategorized), Media/Sleeve condition + Notes fields
  status wish     -> Wantlist with notes (priority, target pressing, budget)
  status ordered  -> Wantlist with notes ("On order from ...")
  moreCopies      -> each copy with a release id is on the wantlist too, with its own notes; a copy that goes
                     (removed, or the record deleted) comes off it. discogsSync.copyRids holds what the wall put there.
  deleted: true   -> removed from Discogs (only items the wall created / wantlist), doc deleted
Never deletes collection items the wall did not create.
"""
import json, os, sys, time, urllib.request, urllib.parse, urllib.error, glob, datetime

TOKEN = os.environ["DISCOGS_TOKEN"]
USER = urllib.parse.quote(os.environ["DISCOGS_USER"], safe="")
API = "https://api.discogs.com"
UA = "VinylWall/1.0 +https://github.com/ober37/vinyl-wall"
GRADE = {"M": "Mint (M)", "NM": "Near Mint (NM or M-)", "VG+": "Very Good Plus (VG+)", "VG": "Very Good (VG)",
         "G+": "Good Plus (G+)", "G": "Good (G)", "F": "Fair (F)", "P": "Poor (P)"}
_last = [0.0]
BUDGET = 600


def call(method, path, params=None, body=None, ok404=False):
    wait = 1.1 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Discogs token={TOKEN}", "User-Agent": UA, "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            _last[0] = time.time()
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            if e.code == 404 and ok404:
                return None
            if e.code == 429 and attempt < 3:
                time.sleep(15)
                continue
            raise RuntimeError(f"{method} {path} -> {e.code} {e.read()[:200]!r}")
        except (urllib.error.URLError, ConnectionError) as e:
            if attempt < 3:
                time.sleep(3)
                continue
            raise


def norm(s):
    return "".join(c for c in (s or "").lower() if c.isalnum())


def norm_name(s):
    """Normalize an artist or title for matching: ignore 'the', '&'/'and', and Discogs' '(2)' and '*' suffixes."""
    re = __import__("re")
    s = re.sub(r"\s*\(\d+\)|\*", "", (s or "").lower()).replace("&", " and ")
    words = [w for w in re.split(r"[^a-z0-9]+", s) if w and w != "the"]
    return "".join(words) or norm(s)


# Version formats that aren't the album on vinyl: singles, videos/bootlegs, promos, tests.
SKIP_FMT = ("single", "unofficial", "promo", "test pressing", "sampler", "transcription", "white label")


def vinyl_album(fmt):
    f = (fmt or "").lower()
    return not any(x in f for x in SKIP_FMT) and ("lp" in f or "album" in f)


def hit_matches(h, artist, title, loose=False):
    """Exact title match, or with loose=True one title containing the other ('Unplugged' / 'MTV Unplugged')."""
    t = h.get("title", "")  # "Artist - Title"
    if " - " not in t:
        return False
    a, ti = t.split(" - ", 1)
    if artist and norm_name(a) != norm_name(artist):
        return False
    x, y = norm_name(ti), norm_name(title)
    short, long_ = sorted((x, y), key=len)
    if loose and short == norm_name(a):  # a self-titled record isn't a loose match for another title
        return False
    return x == y or (loose and len(short) >= 6 and len(short) >= 0.6 * len(long_) and short in long_)


def vinyl_versions(master_id):
    out, page = [], 1
    while page <= 5:
        r = call("GET", f"/masters/{master_id}/versions", {"format": "Vinyl", "per_page": 100, "page": page}) or {}
        out += [v for v in r.get("versions", []) if "Vinyl" in (v.get("major_formats") or []) and vinyl_album(v.get("format"))]
        if page >= r.get("pagination", {}).get("pages", 1):
            break
        page += 1
    return out


def pick_pressing(versions, main_release):
    """The master's main release if it's an official vinyl LP, else the earliest original LP pressing."""
    if any(v["id"] == main_release for v in versions):
        return main_release, "vinyl: master main release"
    def key(v):
        f = (v.get("format") or "").lower()
        yr = "".join(c for c in str(v.get("released") or "")[:4] if c.isdigit())
        return ("reissue" in f or "repress" in f, int(yr) if len(yr) == 4 else 9999,
                {"US": 0, "Europe": 1, "UK": 1}.get(v.get("country"), 2), v["id"])
    return sorted(versions, key=key)[0]["id"], "vinyl: earliest original pressing"


def find_release(d):
    """Return (release_id, how) for a record without a discogsId. Only ever returns a vinyl album release."""
    artist, title = d.get("artist", ""), d.get("title", "")
    cat = (d.get("catalog") or "").strip()
    if cat:
        res = call("GET", "/database/search", {"type": "release", "catno": cat, "artist": artist,
                                               "release_title": title, "format": "Vinyl", "per_page": 25})
        hits = [h for h in res.get("results", []) if vinyl_album(", ".join(h.get("format", [])))]
        press = norm(d.get("pressing"))
        for h in hits:
            if press and any(norm(f) and norm(f) in press for f in h.get("format", [])[2:]):
                return h["id"], "catalog+pressing"
        if len(hits) == 1:
            return hits[0]["id"], "catalog"
    # The album's master: among title+artist matches (singles, videos and bootlegs share album titles),
    # take the one with the most official vinyl LP versions, then pick a pressing from those.
    # Search by artist only too: Discogs' title search misses titles that differ slightly.
    hits = call("GET", "/database/search", {"type": "master", "artist": artist, "release_title": title,
                                            "per_page": 25}).get("results", [])
    hits += call("GET", "/database/search", {"type": "master", "artist": artist, "per_page": 100}).get("results", [])
    for loose in (False, True):
        seen, cands = set(), []
        for h in hits:
            if h["id"] not in seen and hit_matches(h, artist, title, loose):
                seen.add(h["id"]); cands.append(h)
        best = None
        for h in cands[:5]:
            vs = vinyl_versions(h["id"])
            if vs and (best is None or len(vs) > len(best[1])):
                best = (h["id"], vs)
        if best:
            m = call("GET", f"/masters/{best[0]}") or {}
            return pick_pressing(best[1], m.get("main_release"))
    # No master (common for small or self-released records): a matching vinyl album release.
    res = call("GET", "/database/search", {"type": "release", "artist": artist, "release_title": title,
                                           "format": "Vinyl", "per_page": 25})
    for h in res.get("results", []):
        if hit_matches(h, artist, title) and vinyl_album(", ".join(h.get("format", []))):
            return h["id"], "vinyl: first matching release"
    return None, None


def wantlist():
    ids, page = set(), 1
    while True:
        r = call("GET", f"/users/{USER}/wants", {"per_page": 100, "page": page})
        ids |= {w["id"] for w in r.get("wants", [])}
        if page >= r.get("pagination", {}).get("pages", 1):
            return ids
        page += 1


def instances(rid):
    r = call("GET", f"/users/{USER}/collection/releases/{rid}", ok404=True) or {}
    return r.get("releases", [])


def coll_notes(d):
    parts = []
    if d.get("pressing"): parts.append("Pressing: " + __import__("re").sub(r"\s*\(Discogs r\d+\)", "", d["pressing"]))
    if d.get("matrix"): parts.append("Runout: " + d["matrix"])
    bought = d.get("shop") or ""
    if d.get("acquired"): bought += (" " if bought else "") + f"({d['acquired']})"
    if d.get("paid"): bought += f" ${d['paid']}"
    if bought.strip(): parts.append("Bought: " + bought.strip())
    if d.get("why"): parts.append(d["why"])
    out = ""
    for x in (" ".join(p.split()) for p in parts):  # whole lines only; Discogs caps Notes at 255
        line = ("\n" if out else "") + x
        if len(out) + len(line) <= 255:
            out += line
        elif len(out) + 20 < 255:
            out += line[:255 - len(out) - 1].rstrip() + "…"
            break
        else:
            break
    return out


def want_notes(d):
    if d.get("status") == "ordered":
        s = "On order"
        if d.get("shop"): s += " from " + d["shop"]
        if d.get("orderDate"): s += f" (ordered {d['orderDate']})"
        st = {"preorder": "Pre-order", "shipped": "Shipped", "delayed": "Delayed"}.get(d.get("orderStatus"))
        if st: s += ". " + st
        if d.get("eta"): s += f", expected {d['eta']}"
        if d.get("pressing"): s += ". Edition: " + d["pressing"]
        return s[:255]
    pr = {1: "Top want", 2: "Want", 3: "Someday"}.get(int(d.get("priority") or 2), "Want")
    bits = [pr]
    more = [c for c in (d.get("moreCopies") or []) if isinstance(c, dict)]
    if more:
        # several copies: each by name (or pressing) with its budget
        def one(c):
            t = c.get("name") or first_line(c.get("pressing"))
            return t + (f" (${c['budget']})" if c.get("budget") else "")
        first = {"name": d.get("copyName"), "pressing": d.get("pressing"), "budget": d.get("budget")}
        ts = [x for x in map(one, [first] + more) if x]
        if ts: bits.append("Targets: " + "; ".join(ts))
    else:
        if d.get("pressing"): bits.append("Target: " + d["pressing"])
        if d.get("budget"): bits.append(f"Budget ${d['budget']}")
    return ". ".join(bits)[:255]


def first_line(t):
    return " ".join(str(t or "").split("\n")[0].split())


def copy_rids(d, rid):
    """Release ids of the copies a record still hunts (moreCopies), other than its own release."""
    out = []
    for c in d.get("moreCopies") or []:
        try:
            n = int(str((c or {}).get("discogsId") or "").strip() or 0)
        except ValueError:
            n = 0
        if n > 0 and n != rid and n not in out:
            out.append(n)
    return out


def copy_notes(d, c):
    pr = {1: "Top want", 2: "Want", 3: "Someday"}.get(int(d.get("priority") or 2), "Want")
    bits = [pr]
    t = c.get("name") or first_line(c.get("pressing"))
    if t: bits.append("Target: " + t)
    if c.get("budget"): bits.append(f"Budget ${c['budget']}")
    return ". ".join(bits)[:255]


def sync_copies(d, rid, wants, sync):
    """Put each still-hunted copy's release on the wantlist with its notes; take off the ones the wall put there
    that aren't copies any more."""
    keep = [] if d.get("deleted") else copy_rids(d, rid)
    by = {}
    for c in d.get("moreCopies") or []:
        try:
            by.setdefault(int(str((c or {}).get("discogsId") or "").strip() or 0), c)
        except ValueError:
            pass
    for old in sync.get("copyRids") or []:
        if old not in keep and old != rid and old in wants:
            call("DELETE", f"/users/{USER}/wants/{old}")
            wants.discard(old)
    for n in keep:
        if n not in wants:
            call("PUT", f"/users/{USER}/wants/{n}")
            wants.add(n)
        call("POST", f"/users/{USER}/wants/{n}", body={"notes": copy_notes(d, by.get(n) or {})})
    if keep:
        sync["copyRids"] = keep
    else:
        sync.pop("copyRids", None)
    return keep


def drop(rid, sync, wants):
    """Remove what the wall put on Discogs for release rid."""
    if not rid:
        return
    if rid in wants:
        call("DELETE", f"/users/{USER}/wants/{rid}")
        wants.discard(rid)
    iid = (sync or {}).get("instanceId")
    if iid:
        for inst in instances(rid):
            if inst["instance_id"] == iid:
                call("DELETE", f"/users/{USER}/collection/folders/{inst['folder_id']}/releases/{rid}/instances/{iid}")


def sync_one(d, wants, sync):
    out = {}
    rid = d.get("discogsId")
    if isinstance(rid, str):
        rid = int("".join(c for c in rid if c.isdigit()) or 0) or None
    if d.get("deleted"):
        sync_copies(d, rid, wants, sync)
        drop(sync.get("rid") or rid, sync, wants)
        return None
    if not rid:
        rid, how = find_release(d)
        if not rid:
            keep = sync_copies(d, None, wants, sync)
            if sync.get("rid") and not sync.get("adopted") and sync["rid"] not in keep:  # was linked to something else: take it back off
                drop(sync["rid"], sync, wants)
            return {"discogsSync": {"state": "no-match", "at": now(), **({"copyRids": keep} if keep else {}),
                                    "msg": "No vinyl pressing found on Discogs. Paste the release number from its Discogs URL."},
                    "discogsMatch": {"__delete__": True},
                    "needsSync": {"__delete__": True}}
        out["discogsId"] = rid
        out["discogsMatch"] = how
    keep = sync_copies(d, rid, wants, sync)
    if sync.get("rid") and sync["rid"] != rid:  # release changed: clean up the old one, unless it's still a copy wanted
        if sync["rid"] in keep:
            iid = sync.get("instanceId")
            if iid and not sync.get("adopted"):
                drop(sync["rid"], {"instanceId": iid}, set())  # the wall's collection copy only; the wantlist entry stays
        else:
            drop(sync["rid"], sync, wants)
        sync.pop("instanceId", None)
    status = d.get("status") or "own"
    if status == "own":
        insts = instances(rid)
        iid = sync.get("instanceId")
        inst = next((i for i in insts if i["instance_id"] == iid), None) or (insts[0] if insts else None)
        if not inst:
            r = call("POST", f"/users/{USER}/collection/folders/1/releases/{rid}")
            inst = {"instance_id": r["instance_id"], "folder_id": 1}
            sync["instanceId"] = r["instance_id"]
            sync["rid"] = rid
        elif not iid and inst:
            sync["adopted"] = True  # was already in the collection; never delete it
        base = f"/users/{USER}/collection/folders/{inst['folder_id']}/releases/{rid}/instances/{inst['instance_id']}/fields"
        if d.get("mediaGrade") in GRADE:
            call("POST", f"{base}/1", body={"value": GRADE[d["mediaGrade"]]})
        if d.get("sleeveGrade") in GRADE:
            call("POST", f"{base}/2", body={"value": GRADE[d["sleeveGrade"]]})
        call("POST", f"{base}/3", body={"value": coll_notes(d)})
        if rid in wants:
            call("DELETE", f"/users/{USER}/wants/{rid}")
            wants.discard(rid)
        where = "collection"
    else:
        notes = want_notes(d)
        if rid not in wants:  # PUT adds the item; notes are only taken by the POST edit (JSON body)
            call("PUT", f"/users/{USER}/wants/{rid}")
            wants.add(rid)
        call("POST", f"/users/{USER}/wants/{rid}", body={"notes": notes})
        iid = sync.get("instanceId")
        if iid and not sync.get("adopted"):
            for inst in instances(rid):
                if inst["instance_id"] == iid:
                    call("DELETE", f"/users/{USER}/collection/folders/{inst['folder_id']}/releases/{rid}/instances/{iid}")
            sync.pop("instanceId", None)
        where = "wantlist"
    sync.update({"state": "synced", "at": now(), "rid": rid, "where": where})
    sync.pop("msg", None)
    out["discogsSync"] = sync
    out["needsSync"] = {"__delete__": True}
    return out


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def load(dirpath, versions):
    docs = []
    for f in sorted(glob.glob(os.path.join(dirpath, "**", "*.json"), recursive=True)):
        with open(f) as fh:
            j = json.load(fh)
        if "data" in j and isinstance(j["data"], dict):
            i = j.get("id") or os.path.basename(f)[:-5]
            docs.append((i, j.get("version") or versions.get(i), j["data"]))
        else:
            i = os.path.basename(f)[:-5]
            docs.append((i, versions.get(i), j))
    return docs


def main():
    src, dst = sys.argv[1], sys.argv[2]
    versions = {}
    for a in sys.argv[3:]:
        if a.endswith(".json"):
            with open(a) as fh:
                versions = json.load(fh)
    do_all = "--all" in sys.argv
    t0 = time.time()
    wants = wantlist()
    writes, report, left = [], [], 0
    for doc_id, ver, d in load(src, versions):
        if d.get("example"):
            continue
        if not (do_all or d.get("needsSync") or d.get("deleted") or not d.get("discogsSync")):
            continue
        if time.time() - t0 > BUDGET:
            left += 1
            continue
        sync = dict(d.get("discogsSync") or {})
        try:
            upd = sync_one(d, wants, sync)
            if upd and isinstance(upd.get("discogsSync"), dict):
                # DB updates merge nested objects, so fields dropped from discogsSync must be deleted explicitly
                for k in (d.get("discogsSync") or {}):
                    upd["discogsSync"].setdefault(k, {"__delete__": True})
            if upd is None:
                writes.append({"op": "delete", "collection": "records", "doc_id": doc_id, "if_version": ver})
                report.append(f"{d.get('title')}: removed from Discogs and the wall")
            else:
                writes.append({"op": "update", "collection": "records", "doc_id": doc_id, "if_version": ver, "data": upd})
                s = upd.get("discogsSync", {})
                report.append(f"{d.get('title')}: {s.get('state')} -> {s.get('where', '')} r{s.get('rid', upd.get('discogsId', ''))}")
        except Exception as e:  # record the failure on the doc, keep going
            writes.append({"op": "update", "collection": "records", "doc_id": doc_id, "if_version": ver,
                           "data": {"discogsSync": {**sync, "state": "error", "at": now(),
                                                    "msg": str(e)[:300]}, "needsSync": {"__delete__": True}}})
            report.append(f"{d.get('title')}: ERROR {e}")
    writes.append({"op": "update", "collection": "settings", "doc_id": "site",
                   "data": {"run": {"beatMs": int(time.time() * 1000)}, "syncLeft": left}})
    if left:
        report.append(f"{left} more wait for the next run.")
    with open(dst, "w") as fh:
        json.dump(writes, fh, indent=1)
    print("\n".join(report) or "Nothing to sync.")


if __name__ == "__main__":
    main()
