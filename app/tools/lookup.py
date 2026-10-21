#!/usr/bin/env python3
"""Vinyl Wall lookup: covers, details and About for the records waiting on them, fetched in plain Python.

Usage (the background task runs these; see its part L):
  python3 -I lookup.py plan      <records_dir> <artists_dir> <versions.json> <work> [<earlier plan.json>]
  python3 -I lookup.py fetch     <work>
  python3 -I lookup.py facts     <work> <covers.json>
  python3 -I lookup.py summaries <work> [<group> <claude.json> <versions.json>]

plan       picks the waiting records and splits them into small groups (the first one smaller). <versions.json> is
           {"records": {id: version}, "artists": {id: version}} from the list output. Records in an earlier plan.json
           (a first pass in the same run) are skipped, so a second pass only takes new ones.
fetch      looks up every group: Wikipedia + Wikidata in bulk first, Discogs for the exact pressing (cover, tracklist,
           runtime), Deezer/iTunes for covers and runtimes, MusicBrainz only when the others miss. Downloads and shrinks
           covers into <work>/g<group>/covers/<record id>.jpg and prints them (COVERS) for one upload.
facts      pass 1, nothing for Claude to write: takes <covers.json> {record id: asset id} and prints the batches that save
           covers, details, key info, tracklists and artist links (BATCH n lines, at most 50 writes each).
summaries  pass 2: with no group, prints the first group's Wikipedia intros. With a group, Claude's <claude.json>
           {"albums": {record id: {"summary", "recDates"}}, "artists": {artist id: {"summary"}}} and the versions after
           pass 1, prints that group's writes, then the next group's intros (or DONE with the timings).

Rules carried over from the task: fill only fields that are empty or listed in autoFilled; never catalog, pressing or
matrix; only links from typed Wikidata properties; a confident title + artist match or nothing. DISCOGS_TOKEN (optional,
from the environment) raises Discogs' rate limit; it is only ever sent to api.discogs.com.
"""
import datetime, glob, json, os, re, sys, threading, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = "VinylWall/1.0 (https://github.com/ober37/vinyl-wall)"
TOKEN = os.environ.get("DISCOGS_TOKEN", "")
FIRST, GROUP, MAX_RECORDS = 4, 8, 60
ARTIST_FRESH_MS = 180 * 86400000
NO_COVER = "Auto-lookup couldn't find a confident match for the cover. Upload one from this sheet or check the spelling."
DEL = {"__delete__": True}
NOT_ALBUM = {"Q134556", "Q7366", "Q4167410"}  # single, song, disambiguation page
LINKS = [("P856", "website", "{}"), ("P2003", "instagram", "https://www.instagram.com/{}/"),
         ("P2397", "youtube", "https://www.youtube.com/channel/{}"), ("P1902", "spotify", "https://open.spotify.com/artist/{}"),
         ("P3283", "bandcamp", "https://{}.bandcamp.com/"), ("P2850", "applemusic", "https://music.apple.com/us/artist/{}"),
         ("P3040", "soundcloud", "https://soundcloud.com/{}"), ("P7085", "tiktok", "https://www.tiktok.com/@{}"),
         ("P2002", "x", "https://x.com/{}"), ("P2013", "facebook", "https://www.facebook.com/{}")]
try:
    from PIL import Image
except ImportError:
    Image = None


# ---------- HTTP, with per-host spacing (MusicBrainz 1/s, Discogs 1/s with a token, else 25/min) ----------

class Gate:
    def __init__(self, gap):
        self.gap, self.lock, self.next = gap, threading.Lock(), 0.0

    def wait(self):
        with self.lock:
            t = max(time.time(), self.next)
            self.next = t + self.gap
        time.sleep(max(0.0, t - time.time()))


GATES = {"musicbrainz.org": Gate(1.1), "api.discogs.com": Gate(1.1 if TOKEN else 2.5)}
stats = {"calls": 0, "errors": 0}


def fetch(url, params=None, raw=False):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    host = urllib.parse.urlparse(url).hostname or ""
    headers = {"User-Agent": UA}
    if TOKEN and host == "api.discogs.com":
        headers["Authorization"] = "Discogs token=" + TOKEN
    for attempt in range(3):
        if host in GATES:
            GATES[host].wait()
        stats["calls"] += 1
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                body = r.read()
                return body if raw else json.loads(body or b"{}")
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503) and attempt < 2:
                time.sleep(5 * (attempt + 1))
                continue
            if e.code != 404:
                stats["errors"] += 1
            return None
        except Exception:
            if attempt < 2:
                time.sleep(2)
                continue
            stats["errors"] += 1
            return None


def chunks(xs, n):
    xs = list(xs)
    return [xs[i:i + n] for i in range(0, len(xs), n)]


# ---------- matching ----------

EDITION = re.compile(r"[(\[][^)\]]*(deluxe|remaster|edition|expanded|anniversary|version|bonus|reissue|mono|stereo)[^)\]]*[)\]]", re.I)


def words(s):
    s = re.sub(r"\s*\(\d+\)|\*", "", (s or "").lower()).replace("&", " and ")
    return "".join(w for w in re.split(r"[^a-z0-9]+", s) if w and w != "the")


def tnorm(s):
    s = EDITION.sub("", s or "")
    s = re.sub(r"\s+-\s+(single|ep)\s*$", "", s.strip(), flags=re.I)
    return words(s)


def title_ok(a, b):
    x, y = tnorm(a), tnorm(b)
    if not x or not y:
        return False
    if x == y:
        return True
    short, long_ = sorted((x, y), key=len)  # "Unplugged" ~ "MTV Unplugged"
    return len(short) >= 6 and (long_.startswith(short) or long_.endswith(short))


def lev(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def artist_ok(a, b):
    x, y = words(a), words(b)
    if not x or not y:
        return False
    if x == y or x + "s" == y or y + "s" == x:
        return True
    return min(len(x), len(y)) >= 5 and lev(x, y) <= (2 if min(len(x), len(y)) >= 9 else 1)


def bare_title(t):  # "Toxicity (System of a Down album)" -> "Toxicity"
    return re.sub(r"\s*\([^)]*\)\s*$", "", t or "")


def mmss(sec):
    return "%d:%02d" % (sec // 60, sec % 60)


def secs(d):
    p = [int(x) for x in re.findall(r"\d+", d or "")]
    return p[0] * 60 + p[1] if len(p) == 2 else (p[0] * 3600 + p[1] * 60 + p[2] if len(p) == 3 else 0)


# ---------- Wikipedia + Wikidata, in bulk ----------

ENT = {}


def entities(ids, props="labels|claims|sitelinks"):
    need = [q for q in dict.fromkeys(ids) if q and q not in ENT]
    for part in chunks(need, 50):
        j = fetch("https://www.wikidata.org/w/api.php", {"action": "wbgetentities", "ids": "|".join(part), "props": props,
                                                         "languages": "en", "sitefilter": "enwiki", "format": "json"}) or {}
        for q, e in (j.get("entities") or {}).items():
            ENT[q] = e
    return {q: ENT.get(q) or {} for q in ids if q}


def label(q):
    return ((ENT.get(q) or {}).get("labels") or {}).get("en", {}).get("value", "")


def claims(e, p):
    out = []
    for c in (e.get("claims") or {}).get(p, []):
        if c.get("rank") == "deprecated":
            continue
        v = (c.get("mainsnak") or {}).get("datavalue", {}).get("value")
        if v is not None:
            out.append(v["id"] if isinstance(v, dict) and "id" in v else v)
    return out


def enwiki(e):
    return ((e.get("sitelinks") or {}).get("enwiki") or {}).get("title", "")


def resolve(titles):
    """title -> Wikidata id of the page it lands on (after redirects), skipping missing and disambiguation pages."""
    out = {}
    for part in chunks(dict.fromkeys(titles), 50):
        j = fetch("https://en.wikipedia.org/w/api.php", {"action": "query", "format": "json", "formatversion": 2, "redirects": 1,
                                                         "prop": "pageprops", "ppprop": "wikibase_item|disambiguation",
                                                         "titles": "|".join(part)}) or {}
        q = j.get("query") or {}
        step = {x["from"]: x["to"] for x in (q.get("normalized") or []) + (q.get("redirects") or [])}
        pages = {p["title"]: p for p in q.get("pages") or []}
        for t in part:
            final = t
            for _ in range(3):
                final = step.get(final, final)
            p = pages.get(final) or {}
            pp = p.get("pageprops") or {}
            if not p.get("missing") and "disambiguation" not in pp and pp.get("wikibase_item"):
                out[t] = pp["wikibase_item"]
    return out


def album_entity_ok(q, rec):
    e = ENT.get(q) or {}
    if not e or NOT_ALBUM & set(claims(e, "P31")):
        return False
    names = [label(q), bare_title(enwiki(e))]
    if not any(title_ok(rec["title"], n) for n in names if n):
        return False
    return any(artist_ok(rec["artist"], label(a)) for a in claims(e, "P175"))


def pick_albums(recs):
    """record id -> album Wikidata id, trying likely article titles in bulk, then one search per album that missed."""
    found = {}

    def check(cands):  # cands: record id -> [titles]
        qs = resolve([t for ts in cands.values() for t in ts])
        entities(qs.values())
        entities([a for q in qs.values() for a in claims(ENT.get(q) or {}, "P175")])
        for rid, ts in cands.items():
            for t in ts:
                if t in qs and album_entity_ok(qs[t], recs[rid]):
                    found[rid] = qs[t]
                    break

    check({rid: [f"{r['title']} ({r['artist']} album)", f"{r['title']} (album)", r["title"]] for rid, r in recs.items()})
    miss = [rid for rid in recs if rid not in found]

    def search(rid):
        r = recs[rid]
        j = fetch("https://en.wikipedia.org/w/api.php", {"action": "query", "format": "json", "formatversion": 2, "list": "search",
                                                         "srsearch": f"{r['title']} {r['artist']} album", "srlimit": 4}) or {}
        return rid, [x["title"] for x in (j.get("query") or {}).get("search") or []]

    with ThreadPoolExecutor(6) as ex:
        hits = dict(ex.map(search, miss))
    check({rid: ts for rid, ts in hits.items() if ts})
    return found


def extracts(titles):
    out = {}
    for part in chunks(dict.fromkeys(t for t in titles if t), 20):
        j = fetch("https://en.wikipedia.org/w/api.php", {"action": "query", "format": "json", "formatversion": 2, "redirects": 1,
                                                         "prop": "extracts", "exintro": 1, "explaintext": 1, "exlimit": 20,
                                                         "titles": "|".join(part)}) or {}
        q = j.get("query") or {}
        step = {x["from"]: x["to"] for x in (q.get("normalized") or []) + (q.get("redirects") or [])}
        pages = {p["title"]: (p.get("extract") or "").strip() for p in q.get("pages") or []}
        for t in part:
            final = t
            for _ in range(3):
                final = step.get(final, final)
            if pages.get(final):
                out[t] = pages[final]
    return out


def wiki_url(t):
    return "https://en.wikipedia.org/wiki/" + urllib.parse.quote(t.replace(" ", "_"), safe="_()',!-.")


def released(e):
    best = None
    for v in claims(e, "P577"):
        if isinstance(v, dict) and v.get("time"):
            t, p = v["time"].lstrip("+"), v.get("precision", 9)
            s = t[:10] if p >= 11 else t[:4]
            if re.match(r"^\d{4}", s) and (best is None or s < best):
                best = s
    return best


def artist_links(e):
    out = []
    for p, kind, fmt in LINKS:
        v = next((x for x in claims(e, p) if isinstance(x, str)), None)
        if not v:
            continue
        if p == "P856":
            if v.startswith("https://"):
                out.append({"kind": kind, "url": v})
        elif not re.search(r"[/?#\s]", v):
            out.append({"kind": kind, "url": fmt.format(urllib.parse.quote(v, safe="@._-"))})
    return out


# ---------- per-record sources ----------

def discogs_release(rid):
    return fetch(f"https://api.discogs.com/releases/{int(rid)}") if str(rid).strip().isdigit() else None


def deezer(rec):
    j = fetch("https://api.deezer.com/search/album", {"q": f"{rec['artist']} {rec['title']}"}) or {}
    ok = [a for a in j.get("data") or [] if title_ok(rec["title"], a.get("title")) and artist_ok(rec["artist"], (a.get("artist") or {}).get("name"))]
    ok.sort(key=lambda a: (a.get("record_type") != "album", bool(EDITION.search(a.get("title") or ""))))
    for a in ok[:2]:
        d = fetch(f"https://api.deezer.com/album/{a['id']}") or {}
        if d.get("nb_tracks", 0) >= 6 or a is ok[-1]:
            return {"cover": a.get("cover_big"), "label": d.get("label"), "year": (d.get("release_date") or "")[:4],
                    "runtime": round(d["duration"] / 60) if d.get("duration") and d.get("nb_tracks", 0) >= 6 else None}
    return None


def itunes(rec):
    j = fetch("https://itunes.apple.com/search", {"term": f"{rec['artist']} {rec['title']}", "entity": "album", "limit": 15}) or {}
    ok = [a for a in j.get("results") or [] if title_ok(rec["title"], a.get("collectionName")) and artist_ok(rec["artist"], a.get("artistName"))]
    ok.sort(key=lambda a: (a.get("trackCount", 0) < 6, bool(EDITION.search(a.get("collectionName") or ""))))
    if not ok:
        return None
    a = ok[0]
    rt = None
    if a.get("trackCount", 0) >= 6:
        t = fetch("https://itunes.apple.com/lookup", {"id": a["collectionId"], "entity": "song"}) or {}
        ms = sum(x.get("trackTimeMillis", 0) for x in t.get("results") or [] if x.get("wrapperType") == "track")
        rt = round(ms / 60000) or None
    art = (a.get("artworkUrl100") or "").replace("100x100bb", "500x500bb")
    return {"cover": art or None, "year": (a.get("releaseDate") or "")[:4], "runtime": rt}


def mb_group(rec):
    q = f'releasegroup:"{rec["title"]}" AND artist:"{rec["artist"]}"'
    j = fetch("https://musicbrainz.org/ws/2/release-group/", {"query": q, "fmt": "json", "limit": 10}) or {}
    ok = [g for g in j.get("release-groups") or [] if title_ok(rec["title"], g.get("title"))
          and artist_ok(rec["artist"], ((g.get("artist-credit") or [{}])[0].get("name")))]
    ok.sort(key=lambda g: g.get("primary-type") != "Album")
    return ok[0] if ok else None


def mb_wikidata(gid):
    j = fetch(f"https://musicbrainz.org/ws/2/release-group/{gid}", {"inc": "url-rels", "fmt": "json"}) or {}
    for rel in j.get("relations") or []:
        m = re.search(r"/wiki/(Q\d+)", (rel.get("url") or {}).get("resource", "")) if rel.get("type") == "wikidata" else None
        if m:
            return m.group(1)
    return None


def mb_tracks(gid):
    j = fetch("https://musicbrainz.org/ws/2/release", {"release-group": gid, "inc": "recordings", "status": "official", "fmt": "json", "limit": 25}) or {}
    rels = j.get("releases") or []
    if not rels:
        return None
    vinyl = [r for r in rels if any("Vinyl" in (m.get("format") or "") for m in r.get("media") or [])]
    r = vinyl[0] if vinyl else sorted(rels, key=lambda r: r.get("date") or "9999")[0]
    out = []
    for m in r.get("media") or []:
        for t in m.get("tracks") or []:
            x = {"pos": t.get("number") or str(t.get("position", "")), "title": t.get("title", "")}
            if t.get("length"):
                x["dur"] = mmss(round(t["length"] / 1000))
            out.append(x)
    return {"tracks": out, "tracksSource": "musicbrainz", "tracksUrl": f"https://musicbrainz.org/release/{r['id']}"} if out else None


def discogs_profile(release):
    a = ((release or {}).get("artists") or [{}])[0].get("id")
    j = fetch(f"https://api.discogs.com/artists/{a}") if a else None
    p = (j or {}).get("profile") or ""
    p = re.sub(r"\[url=[^\]]*\]|\[/url\]", "", p)
    p = re.sub(r"\[[alm]=([^\]]+)\]", r"\1", p)
    p = re.sub(r"\[[^\]]*\]", "", p).strip()
    if not p:
        return None
    return {"summary": " ".join(re.split(r"(?<=[.!?])\s+", p)[:3]), "source": "discogs", "wiki": f"https://www.discogs.com/artist/{a}"}


def get_cover(url, dst):
    try:
        return _get_cover(url, dst)
    except Exception:  # a broken image leaves the cover for the next run
        stats["errors"] += 1
        return None


def _get_cover(url, dst):
    body = fetch(url, raw=True) if url and url.startswith("https://") else None
    if not body or not (body[:3] == b"\xff\xd8\xff" or body[:8] == b"\x89PNG\r\n\x1a\n"):
        return None
    if Image is None:
        dst = dst[:-4] + (".png" if body[:4] == b"\x89PNG" else ".jpg")
        open(dst, "wb").write(body)
        return dst
    tmp = dst + ".orig"
    open(tmp, "wb").write(body)
    im = Image.open(tmp).convert("RGB")
    im.thumbnail((500, 500))
    im.save(dst, "JPEG", quality=82)
    os.remove(tmp)
    return dst


# ---------- plan / fetch / finish ----------

def load_dir(d):
    out = {}
    for f in sorted(glob.glob(os.path.join(d, "**", "*.json"), recursive=True)):
        j = json.load(open(f))
        out[os.path.splitext(os.path.basename(f))[0]] = j["data"] if isinstance(j.get("data"), dict) else j
    return out


def needs_a(r):
    return not r.get("deleted") and bool(r.get("needsEnrich") or not r.get("coverAsset") or not r.get("runtime"))


def needs_f(r):
    if r.get("deleted") or r.get("example") or r.get("aboutBlocked"):
        return False
    ab = r.get("about") or {}
    return not r.get("aboutAt") or (not r.get("aboutV") and bool(r.get("about")) and ab.get("source") != "claude")


def plan(records_dir, artists_dir, versions_path, work, earlier=None):
    recs, arts, ver = load_dir(records_dir), load_dir(artists_dir) if os.path.isdir(artists_dir) else {}, json.load(open(versions_path))
    tried = set(json.load(open(earlier))["records"]) if earlier else set()
    todo = [rid for rid, r in recs.items() if rid not in tried and (needs_a(r) or needs_f(r))]
    todo.sort(key=lambda rid: (-(recs[rid].get("added") or 0), recs[rid].get("title") or ""))  # newest first: a fresh add goes first
    later = max(0, len(todo) - MAX_RECORDS)
    todo = todo[:MAX_RECORDS]
    groups = [todo[:FIRST]] + chunks(todo[FIRST:], GROUP) if todo else []
    os.makedirs(work, exist_ok=True)
    _stamp(work, "plan")
    json.dump({"groups": groups, "records": {rid: {"data": recs[rid], "version": ver.get("records", {}).get(rid)} for rid in todo},
               "artists": {aid: {"data": a, "version": ver.get("artists", {}).get(aid)} for aid, a in arts.items()}},
              open(os.path.join(work, "plan.json"), "w"))
    print(f"{len(todo)} records waiting, in {len(groups)} groups (sizes {', '.join(str(len(g)) for g in groups) or '-'})"
          + (f"; {later} more wait for the next run" if later else "") + ".")


def fetch_group(work, g, p, done):
    """Look up one group; `done` holds artist ids already taken by an earlier group of this run."""
    t0 = time.time()
    gdir = os.path.join(work, f"g{g}")
    os.makedirs(os.path.join(gdir, "covers"), exist_ok=True)
    recs = {rid: p["records"][rid]["data"] for rid in p["groups"][g]}
    A = {rid for rid, r in recs.items() if needs_a(r)}
    F = {rid for rid, r in recs.items() if needs_f(r)}
    now_ms = int(time.time() * 1000)

    # sources that don't depend on Wikipedia run alongside it
    def per_record(rid):
        try:
            return _per_record(rid)
        except Exception:
            stats["errors"] += 1
            return rid, {"discogs": None}

    def _per_record(rid):
        r = recs[rid]
        out = {"discogs": discogs_release(r.get("discogsId")) if r.get("discogsId") else None}
        if rid in A and (not r.get("coverAsset") or not r.get("runtime") or not r.get("year") or not r.get("label")):
            out["deezer"] = deezer(r)
            if not out["deezer"] or not out["deezer"].get("cover") or not out["deezer"].get("runtime"):
                out["itunes"] = itunes(r)
        return rid, out

    with ThreadPoolExecutor(8) as ex:
        fut = [ex.submit(per_record, rid) for rid in recs]
        album_q = pick_albums({rid: recs[rid] for rid in recs})
        src = dict(f.result() for f in fut)
    t_src = time.time()

    # MusicBrainz last: for an album Wikipedia couldn't place, for a tracklist without a Discogs pressing, or for a cover nobody else had
    def mb(rid):
        try:
            return _mb(rid)
        except Exception:
            stats["errors"] += 1
            return rid, {}

    def _mb(rid):
        r, s = recs[rid], src[rid]
        want_q = rid in F and rid not in album_q
        want_tracks = rid in F and not s["discogs"]
        want_cover = rid in A and not r.get("coverAsset") and not r.get("coverHint") and not _discogs_image(s["discogs"]) \
            and not (s.get("deezer") or {}).get("cover") and not (s.get("itunes") or {}).get("cover")
        if not (want_q or want_tracks or want_cover):
            return rid, {}
        grp = mb_group(r)
        if not grp:
            return rid, {}
        out = {"gid": grp["id"], "artist": ((grp.get("artist-credit") or [{}])[0].get("artist") or {}).get("id")}
        if want_q:
            out["q"] = mb_wikidata(grp["id"])
        if want_tracks:
            out["tracks"] = mb_tracks(grp["id"])
        return rid, out

    with ThreadPoolExecutor(4) as ex:
        mbr = dict(ex.map(mb, recs))
    for rid, m in mbr.items():
        if m.get("q"):
            album_q[rid] = m["q"]
    t_mb = time.time()

    # artists, key info labels and intros, in bulk
    entities(album_q.values())
    artist_q = {}
    for rid, q in album_q.items():
        perf = [a for a in claims(ENT.get(q) or {}, "P175")]
        entities(perf)
        artist_q[rid] = next((a for a in perf if artist_ok(recs[rid]["artist"], label(a))), perf[0] if perf else None)
    entities([q for q in artist_q.values() if q])
    entities([v for q in album_q.values() for pr in ("P264", "P162", "P136", "P483") for v in claims(ENT.get(q) or {}, pr)
              if isinstance(v, str) and v.startswith("Q")], props="labels")
    titles = [enwiki(ENT.get(q) or {}) for q in album_q.values()] + [enwiki(ENT.get(q) or {}) for q in artist_q.values() if q]
    intro = extracts(titles)
    t_wiki = time.time()

    found, artists, covers = {}, {}, {}
    for rid, r in recs.items():
        s, m = src[rid], mbr.get(rid, {})
        q = album_q.get(rid)
        e = ENT.get(q) or {} if q else {}
        dz, it, dg = s.get("deezer") or {}, s.get("itunes") or {}, s["discogs"]
        f = {"needA": rid in A, "needF": rid in F, "fill": {}, "coverUrl": None}

        if rid in A:
            auto = set(r.get("autoFilled") or [])
            free = lambda k: not r.get(k) or k in auto
            dg_rt = _discogs_runtime(dg)
            cand = {"year": [(released(e) or "")[:4], dz.get("year"), it.get("year"), str((dg or {}).get("year") or "")],
                    "label": [label((claims(e, "P264") or [""])[0]), dz.get("label"), _clean((((dg or {}).get("labels") or [{}])[0]).get("name"))],
                    "runtime": [dg_rt, dz.get("runtime"), it.get("runtime")]}
            for k, vals in cand.items():
                v = next((x for x in vals if x and (k != "year" or re.match(r"^\d{4}$", str(x)))), None)
                if v and free(k) and v != r.get(k):
                    f["fill"][k] = int(v) if k == "runtime" else v
            if not r.get("coverAsset"):
                gid = m.get("gid")
                f["coverUrl"] = r.get("coverHint") or _discogs_image(dg) or dz.get("cover") or it.get("cover") \
                    or (f"https://coverartarchive.org/release-group/{gid}/front-500" if gid else None)

        if rid in F:
            about = {}
            if q and enwiki(e):
                t = enwiki(e)
                about["wiki"] = wiki_url(t)
                if intro.get(t):
                    f["albumIntro"] = intro[t]
            if released(e):
                about["released"] = released(e)
            for key, prop, n in (("label", "P264", 1), ("producers", "P162", 3), ("genres", "P136", 3)):
                ls = [label(v) for v in claims(e, prop) if isinstance(v, str)][:n]
                ls = [x for x in ls if x]
                if ls:
                    about[key] = ls[0] if key == "label" else ls
            places = [label(v) for v in claims(e, "P483") if isinstance(v, str) and label(v)]
            if places:
                f["recordedAt"] = ", ".join(places)
            if dg and dg.get("tracklist"):
                tr = [{"pos": t.get("position", ""), "title": t.get("title", ""), **({"dur": t["duration"]} if t.get("duration") else {})}
                      for t in dg["tracklist"] if t.get("type_", "track") == "track"]
                if tr:
                    about.update(tracks=tr, tracksSource="discogs", tracksUrl=f"https://www.discogs.com/release/{dg['id']}")
            elif m.get("tracks"):
                about.update(m["tracks"])
            f["about"] = about

            aq = artist_q.get(rid)
            ae = ENT.get(aq) or {} if aq else {}
            key = next((v for v in claims(ae, "P434") if isinstance(v, str)), None) or m.get("artist") or (f"wd-{aq}" if aq else None)
            if key:
                f["artistKey"] = key
                old = (p["artists"].get(key) or {}).get("data") or {}
                fresh = old.get("source") == "claude" and now_ms - (old.get("fetchedAt") or 0) < ARTIST_FRESH_MS
                if not fresh and key not in done and key not in artists:
                    a = {"name": label(aq) if aq else r["artist"], "links": artist_links(ae) if ae else []}
                    if aq:
                        a["wikidata"] = aq
                    at = enwiki(ae)
                    if at:
                        a["wiki"] = wiki_url(at)
                        a["intro"] = intro.get(at, "")
                    elif dg:
                        a.update(discogs_profile(dg) or {})
                    artists[key] = a
                    done.add(key)
        found[rid] = f

    with ThreadPoolExecutor(6) as ex:
        paths = dict(zip([rid for rid in found if found[rid]["coverUrl"]],
                         ex.map(lambda rid: get_cover(found[rid]["coverUrl"], os.path.join(gdir, "covers", rid + ".jpg")),
                                [rid for rid in found if found[rid]["coverUrl"]])))
    for rid, path in paths.items():
        found[rid]["cover"] = path
        if path:
            covers[rid] = path
    # a record waits for the summaries pass when it has an album intro, or its artist (looked up in this group) has one
    for rid, f in found.items():
        f["summarise"] = bool(f.get("albumIntro") or (artists.get(f.get("artistKey")) or {}).get("intro"))
    json.dump({"found": found, "artists": artists}, open(os.path.join(gdir, "found.json"), "w"))
    t_end = time.time()
    print(f"GROUP {g}: {len(recs)} records, {len(covers)} covers; sources {t_src - t0:.1f}s, musicbrainz {t_mb - t_src:.1f}s, "
          f"wikipedia {t_wiki - t_mb:.1f}s, covers {t_end - t_wiki:.1f}s")
    for rid, f in found.items():
        r = recs[rid]
        bits = [k for k in f["fill"]] + (["cover"] if f.get("cover") else []) + (["about"] if f.get("about") else [])
        print(f"- {rid}: {r['title']} / {r['artist']}: {', '.join(bits) or 'nothing found'}")
    return covers


def _discogs_image(dg):
    imgs = (dg or {}).get("images") or []
    im = next((i for i in imgs if i.get("type") == "primary"), imgs[0] if imgs else {})
    u = im.get("uri") or ""
    return u if u.startswith("https://") else None


def _discogs_runtime(dg):
    tr = [t for t in (dg or {}).get("tracklist") or [] if t.get("type_", "track") == "track"]
    if len(tr) < 6 or not all(secs(t.get("duration")) for t in tr):
        return None
    return round(sum(secs(t["duration"]) for t in tr) / 60) or None


def _clean(s):
    return re.sub(r"\s*\(\d+\)$", "", (s or "").replace("*", "")).strip()


def fetch_all(work):
    p = json.load(open(os.path.join(work, "plan.json")))
    done, covers = set(), {}
    for g in range(len(p["groups"])):
        covers.update(fetch_group(work, g, p, done))
    _stamp(work, "fetched")
    print(f"{stats['calls']} calls, {stats['errors']} errors")
    print("COVERS: " + json.dumps([os.path.abspath(c) for c in covers.values()]))


def _stamp(work, what):
    path = os.path.join(work, "times.json")
    t = json.load(open(path)) if os.path.exists(path) else {}
    t[what] = time.time()
    json.dump(t, open(path, "w"))
    return t


def _found(work, p):
    return [json.load(open(os.path.join(work, f"g{g}", "found.json"))) for g in range(len(p["groups"]))]


def _writer(wdir):
    os.makedirs(wdir, exist_ok=True)
    writes = []

    def add(op, coll, doc_id, data, version):
        path = os.path.abspath(os.path.join(wdir, f"{coll}_{doc_id}.json"))
        json.dump(data, open(path, "w"))
        w = {"op": op, "collection": coll, "doc_id": doc_id, "file_path": path}
        if version:
            w["if_version"] = version
        writes.append(w)
    return writes, add


def _artist_doc(a, summary=""):
    data = {k: v for k, v in a.items() if k != "intro" and v not in (None, "", [])}
    if summary:
        data.update(summary=summary, source="claude")
    data["fetchedAt"] = int(time.time() * 1000)
    return data


def _about(f, al=None):
    about, al = dict(f.get("about") or {}), al or {}
    if (al.get("summary") or "").strip():
        about.update(summary=al["summary"].strip(), source="claude", at=datetime.date.today().isoformat())
    if f.get("recordedAt"):
        about["recorded"] = f["recordedAt"] + (" · " + al["recDates"].strip() if (al.get("recDates") or "").strip() else "")
    return about


def facts(work, covers_path):
    """Pass 1, no Claude writing: covers, details, key info, tracklists, artist links. Records with nothing to summarise
    are finished here; the rest get aboutAt in pass 2, so an interrupted run picks their summaries up next time."""
    p = json.load(open(os.path.join(work, "plan.json")))
    covers = json.load(open(covers_path)) if os.path.exists(covers_path) else {}
    today = datetime.date.today().isoformat()
    writes, add = _writer(os.path.join(work, "facts"))
    for fj in _found(work, p):
        for key, a in fj["artists"].items():
            add("set", "artists", key, _artist_doc(a), (p["artists"].get(key) or {}).get("version"))
        for rid, f in fj["found"].items():
            r, d = p["records"][rid]["data"], {}
            if f["needA"]:
                filled = dict(f["fill"])
                if not r.get("coverAsset") and covers.get(rid):
                    filled["coverAsset"] = covers[rid]
                d.update(filled)
                if filled:
                    d["autoFilled"] = sorted(set(r.get("autoFilled") or []) | set(filled))
                d["needsEnrich"], d["coverHint"] = DEL, DEL
                notes = list(r.get("notes") or [])
                has = any((n or {}).get("t") == NO_COVER for n in notes)
                if "coverAsset" in filled and has:
                    d["notes"] = [n for n in notes if (n or {}).get("t") != NO_COVER]
                elif not r.get("coverAsset") and not f.get("coverUrl") and not has:
                    d["notes"] = notes + [{"d": today, "t": NO_COVER}]
            if f["needF"]:
                about = _about(f)
                if about:
                    d["about"] = about
                if f.get("artistKey"):
                    d["artistRef"] = f["artistKey"]
                if not f["summarise"]:
                    d["aboutAt"], d["aboutV"] = today, 2
            add("update", "records", rid, d, p["records"][rid]["version"])
    _stamp(work, "facts")
    for i, part in enumerate(chunks(writes, 50)):
        print(f"BATCH {i}: " + json.dumps(part))


def _intros(work, p, g):
    fj = json.load(open(os.path.join(work, f"g{g}", "found.json")))
    print(f"SUMMARISE GROUP {g}")
    for rid, f in fj["found"].items():
        if f.get("albumIntro"):
            r = p["records"][rid]["data"]
            rec_at = f" (recorded at: {f['recordedAt']})" if f.get("recordedAt") else ""
            print(f"\nALBUM {rid} | {r['title']} / {r['artist']}{rec_at}\n{f['albumIntro'][:1500]}")
    for key, a in fj["artists"].items():
        if a.get("intro"):
            print(f"\nARTIST {key} | {a['name']}\n{a['intro'][:1500]}")


def summaries(work, g=None, claude_path=None, versions_path=None):
    """Pass 2. With no group: print the first group's intros. With a group and Claude's file: print that group's writes
    (versions from <versions.json>, as left by pass 1), then the next group's intros, or DONE with the timings."""
    p = json.load(open(os.path.join(work, "plan.json")))
    fjs = _found(work, p)
    todo = [i for i, fj in enumerate(fjs) if any(f.get("summarise") for f in fj["found"].values())]
    if g is None:
        if todo:
            _intros(work, p, todo[0])
        else:
            print("DONE: nothing to summarise.")
        return
    cl, ver = json.load(open(claude_path), strict=False), json.load(open(versions_path))  # raw newlines in a summary are fine
    albums, arts = cl.get("albums") or {}, cl.get("artists") or {}
    today = datetime.date.today().isoformat()
    writes, add = _writer(os.path.join(work, f"g{g}", "summaries"))
    for key, a in fjs[g]["artists"].items():
        s = ((arts.get(key) or {}).get("summary") or "").strip()
        if a.get("intro") and s:
            add("set", "artists", key, _artist_doc(a, s), ver.get("artists", {}).get(key))
    for rid, f in fjs[g]["found"].items():
        if f.get("summarise"):
            d = {"aboutAt": today, "aboutV": 2}
            about = _about(f, albums.get(rid))
            if about:
                d["about"] = about
            add("update", "records", rid, d, ver.get("records", {}).get(rid))
    print(f"WRITES {g}: " + json.dumps(writes))
    nxt = [i for i in todo if i > g]
    if nxt:
        _intros(work, p, nxt[0])
    else:
        t = _stamp(work, "done")
        print(f"DONE. Facts ready {t['facts'] - t['plan']:.0f}s after plan; summaries done {t['done'] - t['plan']:.0f}s after plan.")


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "plan":
        plan(*args)
    elif cmd == "fetch":
        fetch_all(args[0])
    elif cmd == "facts":
        facts(*args)
    elif cmd == "summaries":
        summaries(args[0], int(args[1]), args[2], args[3]) if len(args) > 1 else summaries(args[0])
    else:
        sys.exit(__doc__)
