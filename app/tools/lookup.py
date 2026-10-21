#!/usr/bin/env python3
"""Vinyl Wall lookup: covers, details and About for the records waiting on them, fetched in plain Python.

Usage (the background task runs these; see its part L):
  python3 -I lookup.py plan      <records_dir> <artists_dir> <versions.json> <work> [<earlier plan.json>]
  python3 -I lookup.py save      <work> <group> [<record id>=<asset id> ...]
  python3 -I lookup.py summaries <work> <group> <claude.json>

plan       picks the waiting records, splits them into groups (4 first, so the wall starts filling in quickly, then up
           to 13) and starts looking every group up in the background, in order. Prints group 0's covers to upload.
           <versions.json> is {"records": {id: version}, "artists": {id: version}} from the list output. Records in an
           earlier plan.json (a first pass in the same run) are skipped.
           Lookups: Wikipedia + Wikidata in bulk first, Discogs for the exact pressing (cover, tracklist, runtime),
           Deezer/iTunes for covers and runtimes, MusicBrainz only when the others miss.
save       pass 1, nothing for Claude to write: takes the uploaded asset ids and prints the batch that saves the group's
           covers, details, key info, tracklists and artist links, then the next group's covers (or FACTS DONE and
           the first group's Wikipedia intros). Notes the version each write leaves, for pass 2.
summaries  pass 2: takes Claude's <claude.json> {"albums": {record id: {"summary", "recDates"}}, "artists": {artist id:
           {"summary"}}} for a group, prints its writes, then the next group's intros, or DONE with a timeline of every
           step. A record Wikimedia failed on is left for the next run rather than marked done.

Rules carried over from the task: fill only fields that are empty or listed in autoFilled; never catalog, pressing or
matrix; only links from typed Wikidata properties; a confident title + artist match or nothing. DISCOGS_TOKEN (optional,
from the environment) raises Discogs' rate limit; it is only ever sent to api.discogs.com.
"""
import datetime, glob, json, os, re, subprocess, sys, threading, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = "VinylWall/1.0 (https://github.com/ober37/vinyl-wall)"
TOKEN = os.environ.get("DISCOGS_TOKEN", "")
FIRST, GROUP, MAX_RECORDS = 4, 13, 60  # 13: two groups fit one 25-file cover upload each
ARTIST_FRESH_MS = 180 * 86400000
NO_COVER = "Auto-lookup couldn't find a confident match for the cover. Upload one from this sheet or check the spelling."
DEL = {"__delete__": True}
NOT_ALBUM = {"Q134556", "Q7366", "Q4167410"}  # single, song, disambiguation page
MUSIC_IDS = ("P434", "P1953", "P1902", "P2850")  # MusicBrainz, Discogs, Spotify, Apple Music artist ids
# a page with none of those still counts as an artist when it's a musical group or a person with a music occupation
GROUPS = {"Q215380", "Q5741069", "Q2088357", "Q9212979", "Q56816954", "Q641066", "Q216337"}
MUSICIANS = {"Q177220", "Q488205", "Q639669", "Q36834", "Q2252262", "Q855091", "Q753110", "Q386854", "Q584301", "Q486748",
             "Q130857", "Q183945", "Q1259917", "Q158852", "Q1415090"}
LINKS = [("P856", "website", "{}"), ("P2003", "instagram", "https://www.instagram.com/{}/"),
         ("P2397", "youtube", "https://www.youtube.com/channel/{}"), ("P1902", "spotify", "https://open.spotify.com/artist/{}"),
         ("P3283", "bandcamp", "https://{}.bandcamp.com/"), ("P2850", "applemusic", "https://music.apple.com/us/artist/{}"),
         ("P3040", "soundcloud", "https://soundcloud.com/{}"), ("P7085", "tiktok", "https://www.tiktok.com/@{}"),
         ("P2002", "x", "https://x.com/{}"), ("P2013", "facebook", "https://www.facebook.com/{}")]
Image, PILLOW = None, None


def ensure_pillow(work):
    """Pillow shrinks covers; without it (and if it can't be installed) covers keep their source size."""
    global Image
    try:
        from PIL import Image as I
    except ImportError:
        lib = os.path.join(work, ".pylib")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--target", lib, "pillow"], capture_output=True, timeout=180)
        sys.path.insert(0, lib)
        try:
            from PIL import Image as I
        except ImportError:
            return
    Image = I


# ---------- HTTP, with per-host spacing (MusicBrainz 1/s, Discogs 1/s with a token, else 25/min, Wikimedia 2/s) ----------

class Gate:
    def __init__(self, gap):
        self.gap, self.lock, self.next = gap, threading.Lock(), 0.0

    def wait(self):
        with self.lock:
            t = max(time.time(), self.next)
            self.next = t + self.gap
        time.sleep(max(0.0, t - time.time()))


GATES = {"musicbrainz.org": Gate(1.1), "api.discogs.com": Gate(1.1 if TOKEN else 2.5),
         "en.wikipedia.org": Gate(0.5), "www.wikidata.org": Gate(0.5)}
WIKIMEDIA = ("en.wikipedia.org", "www.wikidata.org")
stats = {"calls": 0, "errors": 0, "wikimedia": 0}


def fetch(url, params=None, raw=False):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    host = urllib.parse.urlparse(url).hostname or ""
    headers = {"User-Agent": UA}
    if TOKEN and host == "api.discogs.com":
        headers["Authorization"] = "Discogs token=" + TOKEN
    tries = 6  # a batched Wikimedia call that gives up costs many albums at once, so rate limits get waited out
    for attempt in range(tries):
        if host in GATES:
            GATES[host].wait()
        stats["calls"] += 1
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                body = r.read()
                return body if raw else json.loads(body or b"{}")
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503) and attempt < tries - 1:
                wait = e.headers.get("Retry-After", "") if e.headers else ""
                time.sleep(min(60, int(wait) if wait.isdigit() else 5 * 2 ** attempt))
                continue
            if e.code == 404:
                return None
            err = e
        except Exception as e:
            if attempt < 2:
                time.sleep(2)
                continue
            err = e
        stats["errors"] += 1
        if host in WIKIMEDIA:
            stats["wikimedia"] += 1
        print(f"lookup failed: {host} {err}", file=sys.stderr)
        return None


def chunks(xs, n):
    xs = list(xs)
    return [xs[i:i + n] for i in range(0, len(xs), n)]


# ---------- matching ----------

EDITION = re.compile(r"[(\[][^)\]]*(deluxe|remaster|edition|expanded|anniversary|version|bonus|reissue|mono|stereo)[^)\]]*[)\]]", re.I)


def words(s):
    s = re.sub(r"\s*\(\d+\)|\*", "", (s or "").lower()).replace("&", " and ")
    return "".join(w for w in re.split(r"[^a-z0-9]+", s) if w and w != "the")


def strip_title(s):  # "Okapi - EP", "Noir (Deluxe Edition)" -> the title alone
    return re.sub(r"\s+-\s+(single|ep)\s*$", "", EDITION.sub("", s or "").strip(), flags=re.I)


def tnorm(s):
    return words(strip_title(s))


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

    with ThreadPoolExecutor(2) as ex:
        hits = dict(ex.map(search, miss))
    check({rid: ts for rid, ts in hits.items() if ts})
    return found


def extracts(titles, intro=True, failed=None):
    """title -> its article's intro (or, with intro=False, the whole article, one per call); titles whose call failed
    go in `failed`."""
    out = {}
    for part in chunks(dict.fromkeys(t for t in titles if t), 20 if intro else 1):
        j = fetch("https://en.wikipedia.org/w/api.php", {"action": "query", "format": "json", "formatversion": 2, "redirects": 1,
                                                         "prop": "extracts", "explaintext": 1, "exlimit": len(part),
                                                         "titles": "|".join(part), **({"exintro": 1} if intro else {})})
        if j is None and failed is not None:
            failed.update(part)
        j = j or {}
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


def wiki_url(t, section=None):
    q = lambda x, safe: urllib.parse.quote(x.replace(" ", "_"), safe=safe)
    return "https://en.wikipedia.org/wiki/" + q(t, "_()',!-.") + ("#" + q(section, "_()',!-.:") if section else "")


PAGES = {}  # whole artist articles, by title


def full_texts(titles, failed=None):
    """Whole articles for these titles (cached in PAGES); titles whose call failed go in `failed`."""
    need = [t for t in dict.fromkeys(titles) if t and t not in PAGES]
    with ThreadPoolExecutor(2) as ex:
        for got in ex.map(lambda t: (t, extracts([t], intro=False, failed=failed).get(t, "")), need):
            PAGES[got[0]] = got[1]
    return {t: PAGES.get(t, "") for t in titles if t}


def mentions(text, title):
    t = strip_title(title)
    return bool(t) and bool(re.search(r"(?<!\w)" + re.escape(t) + r"(?!\w)", text or "", re.I))


def pick_artists(want, failed):
    """record id -> artist Wikidata id, for albums Wikidata couldn't place (#32). want: record id -> (name, title,
    MusicBrainz artist id or None, Discogs artist id or None). By MusicBrainz id first; then likely article titles, then
    one Wikipedia search, where a page counts only when its entity is an artist (no performer, as an album or song has)
    under that name and either carries the MusicBrainz or Discogs id we know, or is an artist (see is_artist) whose
    article mentions the album: a same-named different artist doesn't count.
    Records whose lookups Wikimedia failed on go in `failed`."""
    found, wm = {}, stats["wikimedia"]
    want = {rid: w for rid, w in want.items() if words(w[0]) not in ("variousartists", "various", "va")}

    def by_mbid(rid):
        j = fetch("https://www.wikidata.org/w/api.php", {"action": "query", "format": "json", "list": "search", "srlimit": 1,
                                                         "srsearch": f"haswbstatement:P434={want[rid][2]}"}) or {}
        return rid, next((x["title"] for x in (j.get("query") or {}).get("search") or [] if re.match(r"^Q\d+$", x.get("title", ""))), None)

    with ThreadPoolExecutor(2) as ex:
        for rid, q in ex.map(by_mbid, [rid for rid, w in want.items() if w[2]]):
            if q:
                found[rid] = q

    def check(cands):  # cands: record id -> [titles]
        qs = resolve([t for ts in cands.values() for t in ts])
        entities(qs.values())
        maybe = {}
        for rid, ts in cands.items():
            name, title, mbid, dgid = want[rid]
            for t in ts:
                e = ENT.get(qs.get(t)) or {}
                if not e or claims(e, "P175") or not artist_ok(name, label(qs[t])):
                    continue
                ids = claims(e, "P434")
                if mbid and ids and mbid not in ids:
                    continue
                if (mbid and mbid in ids) or (dgid and str(dgid) in map(str, claims(e, "P1953"))):
                    found[rid] = qs[t]
                    break
                if is_artist(e) and enwiki(e):
                    maybe.setdefault(rid, []).append(qs[t])
        pages = full_texts([enwiki(ENT[q]) for rid, qs_ in maybe.items() if rid not in found for q in qs_])
        for rid, qs_ in maybe.items():
            q = next((q for q in qs_ if mentions(pages.get(enwiki(ENT[q])), want[rid][1])), None) if rid not in found else None
            if q:
                found[rid] = q

    check({rid: [f"{n} (band)", f"{n} (musician)", f"{n} (singer)", n] for rid, (n, *_) in want.items() if rid not in found})

    def search(rid):
        j = fetch("https://en.wikipedia.org/w/api.php", {"action": "query", "format": "json", "formatversion": 2, "list": "search",
                                                         "srsearch": want[rid][0], "srlimit": 4}) or {}
        return rid, [x["title"] for x in (j.get("query") or {}).get("search") or []]

    with ThreadPoolExecutor(2) as ex:
        hits = dict(ex.map(search, [rid for rid in want if rid not in found]))
    check({rid: ts for rid, ts in hits.items() if ts})
    if stats["wikimedia"] > wm:  # a batched call can't say which record it failed for, so none of the misses count as done
        failed.update(rid for rid in want if rid not in found)
    return found


def is_artist(e):
    """Some artist id (MusicBrainz, Discogs, Spotify, Apple Music), or a musical group, or a person with a music
    occupation: many smaller artists' pages carry no ids at all."""
    p31 = set(claims(e, "P31"))
    return any(claims(e, p) for p in MUSIC_IDS) or bool(p31 & GROUPS) or ("Q5" in p31 and bool(set(claims(e, "P106")) & MUSICIANS))


ALBUM_CUE = re.compile(r"\b(album|LP|EP|record)\b", re.I)


def album_section(text, title):
    """From an artist's article: the section whose heading names the album (with its subsections), else the prose
    paragraphs that name it as an album, then any lead paragraphs that do. Returns (text, section heading or None), or
    None. A heading must list the album as one of its items ("2023–present: Okapi, and CODA"); a paragraph must say
    album/LP/EP/record and name it mid-sentence with a capital, so "Live performances" and "the song's coda" don't count.
    A title of digits alone (a year, mostly) is never matched."""
    t = strip_title(title)
    if not t or t.isdigit():
        return None
    pat = re.compile(r"(?<!\w)" + re.escape(t) + r"(?!\w)", re.I)

    def names(p):
        return bool(ALBUM_CUE.search(p)) and any(m.group(0)[0].isupper() and not re.search(r"(^|[.!?]\s+)$", p[:m.start()])
                                                 for m in pat.finditer(p) if m.group(0)[0].isalpha()) \
            or (not t[0].isalpha() and bool(ALBUM_CUE.search(p)) and bool(pat.search(p)))

    def in_heading(h):
        return any(title_ok(t, x) for x in re.split(r"\s*(?:[:,–—/&]|\band\b)\s*", h) if x.strip())

    parts = re.split(r"\n*^(={2,})\s*(.+?)\s*\1\s*$\n*", text or "", flags=re.M)
    lead = parts[0]
    secs_ = [(len(parts[i]), parts[i + 1], parts[i + 2]) for i in range(1, len(parts) - 2, 3)]  # (level, heading, body)
    paras = lambda s: [p.strip() for p in s.split("\n") if len(p.strip()) >= 80 and names(p.strip())]
    out, head = [], None
    for i, (lv, h, _) in enumerate(secs_):
        if in_heading(h):
            body = [secs_[i][2]]
            for lv2, h2, b2 in secs_[i + 1:]:  # its subsections, up to the next heading at its level or above
                if lv2 <= lv:
                    break
                body.append(b2)
            body = "\n\n".join(x.strip() for x in body if x.strip())
            if body:
                out, head = [body], h
                break
    if not out:
        for _, h, b in secs_:
            ps = paras(b)
            if ps:
                head = head or h
                out += ps
    out += paras(lead)  # last, so a long lead can't crowd the album's own text out of the 1500 characters Claude sees
    return ("\n\n".join(out), head) if out else None


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
    return not r.get("aboutAt") or (not r.get("aboutV") and bool(r.get("about")) and ab.get("source") != "claude") \
        or ((r.get("aboutV") or 0) < 3 and not ab.get("summary"))  # once more for albums with no article of their own (#32)


def plan(records_dir, artists_dir, versions_path, work, earlier=None):
    recs, arts, ver = load_dir(records_dir), load_dir(artists_dir) if os.path.isdir(artists_dir) else {}, json.load(open(versions_path))
    tried = set(json.load(open(earlier))["records"]) if earlier else set()
    todo = [rid for rid, r in recs.items() if rid not in tried and r.get("title") and r.get("artist") and (needs_a(r) or needs_f(r))]
    todo.sort(key=lambda rid: (-(recs[rid].get("added") or 0), recs[rid].get("title") or ""))  # newest first: a fresh add goes first
    later = max(0, len(todo) - MAX_RECORDS)
    todo = todo[:MAX_RECORDS]
    groups = [todo[:FIRST]] + chunks(todo[FIRST:], GROUP) if todo else []
    os.makedirs(work, exist_ok=True)
    _stamp(work, "plan")
    json.dump({"groups": groups, "records": {rid: {"data": recs[rid], "version": ver.get("records", {}).get(rid)} for rid in todo},
               "artists": {aid: {"data": a, "version": ver.get("artists", {}).get(aid)} for aid, a in arts.items()}},
              open(os.path.join(work, "plan.json"), "w"))
    if groups:  # look every group up in the background, in order, while the task saves the earlier ones
        log = open(os.path.join(work, "prefetch.log"), "w")
        pr = subprocess.Popen([sys.executable, "-I", os.path.abspath(__file__), "prefetch", work], stdout=log, stderr=log,
                              stdin=subprocess.DEVNULL, start_new_session=True)
        open(os.path.join(work, "prefetch.pid"), "w").write(str(pr.pid))
    print(f"{len(todo)} records waiting, in {len(groups)} groups (sizes {', '.join(str(len(g)) for g in groups) or '-'})"
          + (f"; {later} more wait for the next run" if later else "") + ".")
    if groups:
        _print_group(work, json.load(open(os.path.join(work, "plan.json"))), 0, pr)


def fetch_group(work, g, p, done):
    """Look up one group; `done` holds artist ids already taken by an earlier group of this run."""
    t0, wm0 = time.time(), stats["wikimedia"]
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
    entities([a for q in album_q.values() for a in claims(ENT.get(q) or {}, "P175")])
    for rid, q in album_q.items():
        perf = claims(ENT.get(q) or {}, "P175")
        artist_q[rid] = next((a for a in perf if artist_ok(recs[rid]["artist"], label(a))), perf[0] if perf else None)
    wm_own = stats["wikimedia"]  # failures from here to t_wiki are the #32 fallback's; they hold back only its own records
    wiki_failed, page_failed = set(), set()
    artist_q.update(pick_artists({rid: (recs[rid]["artist"], recs[rid]["title"], mbr.get(rid, {}).get("artist"), _dartist(src[rid]["discogs"]))
                                  for rid in F if not artist_q.get(rid)}, wiki_failed))
    wm_own = stats["wikimedia"] - wm_own
    entities([q for q in artist_q.values() if q])
    entities([v for q in album_q.values() for pr in ("P264", "P162", "P136", "P483") for v in claims(ENT.get(q) or {}, pr)
              if isinstance(v, str) and v.startswith("Q")], props="labels")
    titles = [enwiki(ENT.get(q) or {}) for q in album_q.values()] + [enwiki(ENT.get(q) or {}) for q in artist_q.values() if q]
    intro = extracts(titles)
    # an album with no article of its own (not one whose intro just failed to load): the section of its artist's
    # article that covers it (#32)
    side = {rid: enwiki(ENT.get(artist_q[rid]) or {}) for rid in F if artist_q.get(rid)
            and not (album_q.get(rid) and enwiki(ENT.get(album_q[rid]) or {}))}
    side = {rid: at for rid, at in side.items() if at}
    wm_side = stats["wikimedia"]
    pages = full_texts(side.values(), page_failed)
    wm_own += stats["wikimedia"] - wm_side
    via = {}
    for rid, at in side.items():
        if at in page_failed:
            wiki_failed.add(rid)
        hit = album_section(pages.get(at), recs[rid]["title"])
        if hit:
            via[rid] = (*hit, label(artist_q[rid]) or bare_title(at), at)
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
                    "label": [label((claims(e, "P264") or [""])[0]), dz.get("label"), _dlabel(dg)],
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
                about["wiki"], about["via"] = wiki_url(t), ""  # its own article: no "from <artist>" (update merges about)
                if intro.get(t):
                    f["albumIntro"] = intro[t]
            if rid in via and not f.get("albumIntro"):
                text, head, name, at = via[rid]
                about["wiki"] = wiki_url(at, head)
                about["via"] = name
                f["albumIntro"], f["albumFrom"] = text, {"name": name, "section": head}
            if released(e):
                about["released"] = released(e)
            for key, prop, n in (("label", "P264", 1), ("producers", "P162", 3), ("genres", "P136", 3)):
                ls = [label(v) for v in claims(e, prop) if isinstance(v, str)][:n]
                ls = [x for x in ls if x]
                if ls:
                    about[key] = ls[0] if key == "label" else ls
            if dg and not (about.get("released") and about.get("label") and about.get("genres")):
                about.update({k: v for k, v in _discogs_key_info(dg).items() if not about.get(k)})  # what Wikidata lacked (#32)
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

    if PILLOW:
        PILLOW.join()
    with ThreadPoolExecutor(6) as ex:
        paths = dict(zip([rid for rid in found if found[rid]["coverUrl"]],
                         ex.map(lambda rid: get_cover(found[rid]["coverUrl"], os.path.join(gdir, "covers", rid + ".jpg")),
                                [rid for rid in found if found[rid]["coverUrl"]])))
    for rid, path in paths.items():
        found[rid]["cover"] = path
        if path:
            covers[rid] = path
    # a record waits for the summaries pass when it has an album intro, or its artist (looked up in this group) has one
    # (a record Wikimedia failed on, with no intro to show for it, is left for the next run instead)
    failed = stats["wikimedia"] - wm_own > wm0  # the #32 fallback's own failures count only for its records
    for rid, f in found.items():
        f["summarise"] = bool(f.get("albumIntro") or (artists.get(f.get("artistKey")) or {}).get("intro"))
        f["retry"] = (failed or rid in wiki_failed) and f["needF"] and not f.get("albumIntro")
    tmp = os.path.join(gdir, "found.json.tmp")
    json.dump({"found": found, "artists": artists, "secs": round(time.time() - t0, 1)}, open(tmp, "w"))
    os.replace(tmp, os.path.join(gdir, "found.json"))  # appears whole, so a waiting step never reads half a file
    print(f"group {g}: sources {t_src - t0:.1f}s, musicbrainz {t_mb - t_src:.1f}s, wikipedia {t_wiki - t_mb:.1f}s, "
          f"covers {time.time() - t_wiki:.1f}s", flush=True)


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


def _dartist(dg):
    return (((dg or {}).get("artists") or [{}])[0]).get("id")


def _discogs_key_info(dg):
    """Released, label and genres from the linked pressing, for an album Wikidata has none for. A reissue isn't the
    album: when the master's year differs from the pressing's, only the master's year is used, not the pressing's
    date or label."""
    m = fetch(f"https://api.discogs.com/masters/{int(dg['master_id'])}") if str(dg.get("master_id") or "").isdigit() else None
    rel = str(dg.get("released") or "")
    rel = rel[:10] if re.match(r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$", rel[:10]) else rel[:4]
    first = str((m or {}).get("year") or "")
    reissue = re.match(r"^\d{4}$", first) and first != rel[:4]
    out = {"released": first if reissue else rel, "label": "" if reissue else _dlabel(dg),
           "genres": ((m or {}).get("styles") or (m or {}).get("genres") or dg.get("styles") or dg.get("genres") or [])[:3]}
    return {k: v for k, v in out.items() if v and (k != "released" or re.match(r"^\d{4}", v))}


def _dlabel(dg):
    """The pressing's first label; Discogs files self-released records under "Not On Label (… Self-released)"."""
    s = _clean((((dg or {}).get("labels") or [{}])[0]).get("name"))
    return "Self-released" if s.lower().startswith("not on label") else s


def _clean(s):
    return re.sub(r"\s*\(\d+\)$", "", (s or "").replace("*", "")).strip()


def prefetch(work):
    """Runs in the background from plan: looks up every group in order while the task saves the earlier ones."""
    global PILLOW
    PILLOW = threading.Thread(target=ensure_pillow, args=(work,))
    PILLOW.start()  # alongside the first lookups; covers wait for it
    p = json.load(open(os.path.join(work, "plan.json")))
    done = set()
    for g in range(len(p["groups"])):
        fetch_group(work, g, p, done)
    print(f"{stats['calls']} calls, {stats['errors']} errors, {stats['wikimedia']} from Wikimedia", flush=True)


def _stamp(work, what):
    """Note when each step ran; the gaps between script steps are Claude's own steps (uploads, batches, writing)."""
    path = os.path.join(work, "times.json")
    t = json.load(open(path)) if os.path.exists(path) else {}
    t.setdefault("steps", []).append([what, time.time()])
    json.dump(t, open(path, "w"))
    return t


def _timeline(t):
    t0 = t["steps"][0][1]
    return (f"plan at {datetime.datetime.fromtimestamp(t0, datetime.timezone.utc):%H:%M:%S} UTC; seconds after it: "
            + ", ".join(f"{w} {s - t0:.0f}" for w, s in t["steps"][1:]))


def _found(work, g):
    path = os.path.join(work, f"g{g}", "found.json")
    return json.load(open(path)) if os.path.exists(path) else None


def _wait_found(work, p, g, proc=None):
    """The background lookup's result for group g; if that process is gone, look the group up here instead.
    `proc` is the process itself when the caller started it (plan): a crashed child of ours would still answer
    a kill(pid, 0) probe until it's reaped, so ask it directly."""
    while _found(work, g) is None:
        if proc is not None:
            alive = proc.poll() is None
        else:
            try:
                os.kill(int(open(os.path.join(work, "prefetch.pid")).read()), 0)
                alive = True
            except (OSError, ValueError):
                alive = False
        if not alive:
            done = {k for i in range(g) for k in (_found(work, i) or {}).get("artists", {})}
            ensure_pillow(work)
            fetch_group(work, g, p, done)
            break
        time.sleep(1)
    return _found(work, g)


def _json(path, default):
    return json.load(open(path)) if os.path.exists(path) else default


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


def _print_group(work, p, g, proc=None):
    """Group g's lookups and the covers to upload (none already uploaded in this run)."""
    fj = _wait_found(work, p, g, proc)
    uploaded = _json(os.path.join(work, "assets.json"), {})
    covers = [os.path.abspath(f["cover"]) for rid, f in fj["found"].items() if f.get("cover") and rid not in uploaded]
    print(f"GROUP {g} of {len(p['groups'])} (looked up in {fj.get('secs', '?')}s)")
    for rid, f in fj["found"].items():
        r = p["records"][rid]["data"]
        bits = list(f["fill"]) + (["cover"] if f.get("cover") else []) + (["about"] if f.get("about") else [])
        print(f"- {rid}: {r['title']} / {r['artist']}: {', '.join(bits) or 'nothing found'}")
    print(f"COVERS {g}: " + json.dumps(covers))


def save(work, g, *pairs):
    """Pass 1: <record id>=<asset id> for each uploaded cover. Prints group g's BATCH, then the next group's covers, or
    FACTS DONE and the first summaries to write. Records the version each write will leave, for pass 2."""
    p = json.load(open(os.path.join(work, "plan.json")))
    _stamp(work, f"save {g}")
    uploaded = _json(os.path.join(work, "assets.json"), {})
    uploaded.update(dict(x.split("=", 1) for x in pairs if "=" in x))
    json.dump(uploaded, open(os.path.join(work, "assets.json"), "w"))
    after = _json(os.path.join(work, "versions-after.json"), {"records": {}, "artists": {}})
    fj = _wait_found(work, p, g)
    today = datetime.date.today().isoformat()
    writes, add = _writer(os.path.join(work, f"g{g}", "facts"))
    for key, a in fj["artists"].items():
        v = (p["artists"].get(key) or {}).get("version")
        add("update" if v else "set", "artists", key, _artist_doc(a), v)  # update keeps an existing summary until pass 2
        after["artists"][key] = (v or 0) + 1
    for rid, f in fj["found"].items():
        r, d = p["records"][rid]["data"], {}
        if f["needA"]:
            filled = dict(f["fill"])
            if not r.get("coverAsset") and uploaded.get(rid):
                filled["coverAsset"] = uploaded[rid]
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
            if f.get("about"):
                d["about"] = f["about"]
            if f.get("artistKey"):
                d["artistRef"] = f["artistKey"]
            if not f["summarise"] and not f["retry"]:  # nothing to write: done now; a rate-limited miss waits for the next run
                d["aboutAt"], d["aboutV"] = today, 3
        v = p["records"][rid]["version"]
        add("update", "records", rid, d, v)
        after["records"][rid] = (v or 0) + 1
    json.dump(after, open(os.path.join(work, "versions-after.json"), "w"))
    print(f"BATCH {g}: " + json.dumps(writes))
    if g + 1 < len(p["groups"]):
        _print_group(work, p, g + 1)
    else:
        print("FACTS DONE")
        summaries(work)


def _artist_doc(a):
    data = {k: v for k, v in a.items() if k != "intro" and v not in (None, "", [])}
    data["fetchedAt"] = int(time.time() * 1000)
    return data


def _intros(work, p, g):
    fj = _found(work, g)
    print(f"SUMMARISE GROUP {g}")
    for rid, f in fj["found"].items():
        if f.get("albumIntro"):
            r = p["records"][rid]["data"]
            rec_at = f" (recorded at: {f['recordedAt']})" if f.get("recordedAt") else ""
            fr = f.get("albumFrom")
            via = (f" (from the {fr['name']} article" + (f", section \"{fr['section']}\")" if fr.get("section") else ")")) if fr else ""
            print(f"\nALBUM {rid} | {r['title']} / {r['artist']}{rec_at}{via}\n{f['albumIntro'][:1500]}")
    for key, a in fj["artists"].items():
        if a.get("intro"):
            print(f"\nARTIST {key} | {a['name']}\n{a['intro'][:1500]}")


def summaries(work, g=None, claude_path=None):
    """Pass 2. With no group: print the first group's intros. With a group and Claude's file: print that group's writes
    (only the summaries; update merges them into what pass 1 saved), then the next group's intros, or DONE."""
    p = json.load(open(os.path.join(work, "plan.json")))
    fjs = [_found(work, i) or {"found": {}, "artists": {}} for i in range(len(p["groups"]))]
    todo = [i for i, fj in enumerate(fjs) if any(f.get("summarise") for f in fj["found"].values())]
    if g is None:
        if todo:
            _intros(work, p, todo[0])
        else:
            print("DONE. " + _timeline(_stamp(work, "done")))
        return
    _stamp(work, f"summaries {g}")
    cl = json.load(open(claude_path), strict=False)  # raw newlines in a summary are fine
    albums, arts = cl.get("albums") or {}, cl.get("artists") or {}
    ver = _json(os.path.join(work, "versions-after.json"), {"records": {}, "artists": {}})
    today = datetime.date.today().isoformat()
    writes, add = _writer(os.path.join(work, f"g{g}", "summaries"))
    for key, a in fjs[g]["artists"].items():
        s = ((arts.get(key) or {}).get("summary") or "").strip()
        if a.get("intro") and s:
            add("update", "artists", key, {"summary": s, "source": "claude"}, ver["artists"].get(key))
    for rid, f in fjs[g]["found"].items():
        if f.get("summarise"):
            al, about = albums.get(rid) or {}, {}
            if (al.get("summary") or "").strip():
                about.update(summary=al["summary"].strip(), source="claude", at=today)
            if f.get("recordedAt"):
                about["recorded"] = f["recordedAt"] + (" · " + al["recDates"].strip() if (al.get("recDates") or "").strip() else "")
            d = {"aboutAt": today, "aboutV": 3}
            if about:
                d["about"] = about
            add("update", "records", rid, d, ver["records"].get(rid))
    print(f"WRITES {g}: " + json.dumps(writes))
    nxt = [i for i in todo if i > g]
    if nxt:
        _intros(work, p, nxt[0])
    else:
        retry = sum(f.get("retry", False) for fj in fjs for f in fj["found"].values())
        print("DONE. " + _timeline(_stamp(work, "done"))
              + (f". {retry} records left for the next run (lookups rate-limited)." if retry else "."))


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "plan":
        plan(*args)
    elif cmd == "prefetch":
        prefetch(args[0])
    elif cmd == "save":
        save(args[0], int(args[1]), *args[2:])
    elif cmd == "summaries":
        summaries(args[0], int(args[1]), args[2]) if len(args) > 1 else summaries(args[0])
    else:
        sys.exit(__doc__)
