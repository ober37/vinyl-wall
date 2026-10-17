#!/usr/bin/env python3
"""Vinyl Wall -> Discogs one-way sync.

Usage: DISCOGS_TOKEN=... python3 -I discogs_sync.py <records_dir> <out.json> [versions.json] [--all]
versions.json maps doc_id -> current version (from the ArtifactData list output) when the
exported files don't carry versions.
<records_dir> holds one JSON file per record doc as written by ArtifactData list/out_dir
(each file: {"id", "data", "version", ...} or the raw doc). Writes a list of DB writes
to <out.json>: [{"op":"update"|"delete","doc_id","if_version","data"}].

Mapping:
  status own      -> Collection (Uncategorized), Media/Sleeve condition + Notes fields
  status wish     -> Wantlist with notes (priority, target pressing, budget)
  status ordered  -> Wantlist with notes ("On order from ...")
  deleted: true   -> removed from Discogs (only items the wall created / wantlist), doc deleted
Never deletes collection items the wall did not create.
"""
import json, os, sys, time, urllib.request, urllib.parse, urllib.error, glob, datetime

TOKEN = os.environ["DISCOGS_TOKEN"]
USER = os.environ["DISCOGS_USER"]
API = "https://api.discogs.com"
UA = "VinylWall/1.0 +https://github.com/ober37/vinyl-wall"
GRADE = {"M": "Mint (M)", "NM": "Near Mint (NM or M-)", "VG+": "Very Good Plus (VG+)", "VG": "Very Good (VG)",
         "G+": "Good Plus (G+)", "G": "Good (G)", "F": "Fair (F)", "P": "Poor (P)"}
_last = [0.0]


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


def find_release(d):
    """Return (release_id, how) for a record without a discogsId."""
    artist, title = d.get("artist", ""), d.get("title", "")
    cat = (d.get("catalog") or "").strip()
    if cat:
        res = call("GET", "/database/search", {"type": "release", "catno": cat, "artist": artist,
                                               "release_title": title, "format": "Vinyl", "per_page": 25})
        hits = res.get("results", [])
        press = norm(d.get("pressing"))
        for h in hits:
            if press and any(norm(f) and norm(f) in press for f in h.get("format", [])[2:]):
                return h["id"], "catalog+pressing"
        if len(hits) == 1:
            return hits[0]["id"], "catalog"
    res = call("GET", "/database/search", {"type": "master", "artist": artist, "release_title": title, "per_page": 10})
    for h in res.get("results", []):
        t = h.get("title", "")  # "Artist - Title"
        if " - " in t and norm(t.split(" - ", 1)[1]) == norm(title):
            m = call("GET", f"/masters/{h['id']}")
            if m and m.get("main_release"):
                return m["main_release"], "master main release"
    res = call("GET", "/database/search", {"type": "release", "artist": artist, "release_title": title,
                                           "format": "Vinyl", "per_page": 10})
    for h in res.get("results", []):
        t = h.get("title", "")
        if " - " in t and norm(t.split(" - ", 1)[1]) == norm(title):
            return h["id"], "first vinyl release"
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
    if d.get("pressing"): bits.append("Target: " + d["pressing"])
    if d.get("budget"): bits.append(f"Budget ${d['budget']}")
    return ". ".join(bits)[:255]


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
        drop(sync.get("rid") or rid, sync, wants)
        return None
    if not rid:
        rid, how = find_release(d)
        if not rid:
            return {"discogsSync": {"state": "no-match", "at": now(),
                                    "msg": "No Discogs match found. Paste the release number from its Discogs URL."},
                    "needsSync": {"__delete__": True}}
        out["discogsId"] = rid
        out["discogsMatch"] = how
    if sync.get("rid") and sync["rid"] != rid:  # release changed: clean up the old one
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
        j = json.load(open(f))
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
            versions = json.load(open(a))
    do_all = "--all" in sys.argv
    wants = wantlist()
    writes, report = [], []
    for doc_id, ver, d in load(src, versions):
        if d.get("example"):
            continue
        if not (do_all or d.get("needsSync") or d.get("deleted") or not d.get("discogsSync")):
            continue
        sync = dict(d.get("discogsSync") or {})
        try:
            upd = sync_one(d, wants, sync)
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
    json.dump(writes, open(dst, "w"), indent=1)
    print("\n".join(report) or "Nothing to sync.")


if __name__ == "__main__":
    main()
