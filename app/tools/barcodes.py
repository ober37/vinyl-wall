#!/usr/bin/env python3
"""Store each copy's barcodes from its Discogs release, so a shop's barcode page opens that pressing (#88).

Usage: [DISCOGS_TOKEN=...] python3 -I barcodes.py <records_dir> <versions.json> <out.json>

<records_dir> holds one JSON file per record doc as written by ArtifactData list/out_dir (each file {"data": …} or the
raw doc); versions.json maps doc_id -> its version. A copy's barcodes live with the copy, beside its pressing and
discogsId: the record's own fields for its first copy (its copy, on a record you have), each entry of moreCopies for
the rest, and each entry of ownedCopies for the other copies you have (#121). They're kept as {"rid": <the release they came from>, "codes": [digits, …]}, so a copy whose release changed
(or whose barcodes were moved beside the wrong copy) is read again; a release with none keeps "codes": [] and isn't
asked again. A release the sync guessed for the record (discogsMatch "master main release" or "vinyl: …", often the
original pressing, not the one wanted) isn't the copy's pressing: it gets no barcodes, and any saved from it go. At most MAX_RELEASES releases a run; the rest wait for the next one. out.json is a list of batch writes.
"""
import glob, json, os, re, sys, time, urllib.error, urllib.request

UA = "VinylWall/1.0 (https://github.com/ober37/vinyl-wall)"
MAX_RELEASES = 40
DEL = {"__delete__": True}


def guessed(r):
    """The record's release is the sync's guess (tools/discogs_sync.py), not a pressing someone chose or matched by catalog."""
    m = str(r.get("discogsMatch") or "")
    return m == "master main release" or m.startswith("vinyl: ")


def rid_of(v):
    s = str(v if v is not None else "").strip()
    return int(s) if s.isdigit() and int(s) > 0 else 0


def codes_of(release):
    """A release's barcodes, digits only, in order, each once."""
    out = []
    for i in (release or {}).get("identifiers") or []:
        if str(i.get("type", "")).lower() == "barcode":
            d = re.sub(r"\D", "", str(i.get("value", "")))
            if len(d) >= 8 and d not in out:
                out.append(d)
    return out


def stale(c):
    """The copy has a Discogs release whose barcodes aren't stored beside it."""
    rid = rid_of(c.get("discogsId"))
    b = c.get("barcodes")
    return bool(rid) and not (isinstance(b, dict) and b.get("rid") == rid and isinstance(b.get("codes"), list))


def release_fetcher(token):
    last = [0.0]
    wait = 1.1 if token else 2.5  # Discogs allows 60 requests a minute with a token, 25 without

    def fetch(rid):
        """The release, {} when Discogs has none, or None when it couldn't be read (tried again next run)."""
        time.sleep(max(0.0, last[0] + wait - time.time()))
        last[0] = time.time()
        headers = {"User-Agent": UA}
        if token:
            headers["Authorization"] = f"Discogs token={token}"
        try:
            with urllib.request.urlopen(urllib.request.Request(f"https://api.discogs.com/releases/{rid}", headers=headers), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            return {} if e.code == 404 else None
        except Exception:
            return None
    return fetch


def plan(records, versions, fetch, limit=MAX_RELEASES):
    """(writes, lines): one update per record whose copies got barcodes, and what was done."""
    got, asked, writes, waiting = {}, 0, [], 0
    for rid_doc, r in sorted(records.items()):
        if r.get("deleted") or r.get("example"):
            continue
        more = r.get("moreCopies") if isinstance(r.get("moreCopies"), list) else []
        owned = r.get("ownedCopies") if isinstance(r.get("ownedCopies"), list) else []
        copies = [r] + [c for c in more + owned if isinstance(c, dict)]
        data = {}
        if guessed(r) and "barcodes" in r:
            data["barcodes"] = DEL
        for c in copies:
            if (c is r and guessed(r)) or not stale(c):
                continue
            rid = rid_of(c["discogsId"])
            if rid not in got:
                if asked >= limit:
                    waiting += 1
                    continue
                asked += 1
                rel = fetch(rid)
                got[rid] = None if rel is None else codes_of(rel)
            if got[rid] is None:
                continue
            c["barcodes"] = {"rid": rid, "codes": got[rid]}
            if c is r:
                data["barcodes"] = c["barcodes"]
            elif any(c is x for x in owned):
                data["ownedCopies"] = owned
            else:
                data["moreCopies"] = more
        if data and rid_doc in versions:
            writes.append({"op": "update", "collection": "records", "doc_id": rid_doc, "if_version": versions[rid_doc], "data": data})
    found = sum(1 for v in got.values() if v)
    lines = [f"{asked} Discogs releases read, {found} with barcodes, {len(writes)} records to update"
             + (f"; {waiting} copies wait for the next run" if waiting else "") + "."]
    return writes, lines


def load(records_dir):
    out = {}
    for f in glob.glob(os.path.join(records_dir, "*.json")):
        j = json.load(open(f))
        out[os.path.splitext(os.path.basename(f))[0]] = j["data"] if isinstance(j.get("data"), dict) else j
    return out


if __name__ == "__main__":
    records = load(sys.argv[1])
    versions = json.load(open(sys.argv[2]))
    writes, lines = plan(records, versions.get("records", versions), release_fetcher(os.environ.get("DISCOGS_TOKEN", "")))
    json.dump(writes, open(sys.argv[3], "w"))
    print("\n".join(lines))
