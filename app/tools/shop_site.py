#!/usr/bin/env python3
"""Find the website of each local shop on the wall that has a town but no website (#155).

Usage: python3 -I shop_site.py plan <settings/site doc json> <work dir>
       python3 -I shop_site.py finish <work dir> <claude.json> <out.json>

plan picks up to MAX_SHOPS local shops with a town (from the address, or "… in <town>, <ST>" ending the name), no website, and no
try in the last RETRY_DAYS days; looks each up on OpenStreetMap (Nominatim, one request a second); saves what it found in
<work>/plan.json; and prints one "ASK <id> | <name> | <town>[ | has a website]" line per shop for the task's web searches, or NOTHING TO DO.

finish reads the task's findings, {"<id>": {"rsd": {"site", "phone", "address"}, "web": "<url>"}} (any part may be
missing), and checks each candidate website: https, not a directory, social or marketplace site, not one the owner turned
down, not parked, and its page names the shop and shows a phone number or street address another source gave. A site
that blocks scripts or doesn't answer is kept only when two sources name it. It fills only what the shop leaves blank:
the website, and the phone and address when two sources agree (or the website's page confirms them), and records them in
`found`. Then shop_search.py finds the search link of every shop that needs one. out.json is {"shops": [the whole list]}
to `update` settings/site with, or {} when nothing changed.
"""
import html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shop_search

UA = "VinylWall/1.0 (https://github.com/ober37/vinyl-wall)"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
RETRY_DAYS = 30
MAX_SHOPS = 5
# never a shop's own website: social pages, directories, maps, marketplaces and the sources themselves
BLOCKED = ("facebook.com", "fb.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "linktr.ee",
           "yelp.com", "google.com", "goo.gl", "g.page", "mapquest.com", "tripadvisor.com", "yellowpages.com", "foursquare.com",
           "bbb.org", "wikipedia.org", "openstreetmap.org", "recordstoreday.com", "discogs.com", "ebay.com", "amazon.com",
           "bandcamp.com", "etsy.com", "giftly.com", "timeout.com", "nextdoor.com", "allevents.in", "vinylpackman.com")
STREET = r"(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way|ln|lane|ct|court|pl|place|pkwy|parkway|hwy|highway|route|rte|ter|terrace|cir|circle|sq|square|trl|trail)"
SMALL = {"the", "and", "of", "in", "at", "on", "a", "records", "record", "music", "shop", "store", "co", "inc", "llc"}


def get(url):
    """(status, text, final url) for a GET, or None when the site can't be reached. Up to 3 MB: a site builder's home
    page can carry its address and phone after megabytes of script."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json,*/*"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read(3_000_000).decode("utf-8", "replace"), r.geturl()
    except urllib.error.HTTPError as e:
        try:
            body = e.read(20_000).decode("utf-8", "replace")
        except Exception:
            body = ""
        return e.code, body, url
    except Exception:
        return None


ORDINAL = {"first": "1st", "second": "2nd", "third": "3rd", "fourth": "4th", "fifth": "5th", "sixth": "6th", "seventh": "7th",
           "eighth": "8th", "ninth": "9th", "tenth": "10th"}


def fold(t):
    """lower case, accents and punctuation gone ("Val's halla" and "Vals halla" alike), "First" as "1st" """
    import unicodedata
    t = unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"[^a-z0-9]+", " ", t.replace("'", "").replace("&", " and ")).strip()
    return re.sub(r"\b(" + "|".join(ORDINAL) + r")\b", lambda m: ORDINAL[m.group(1)], t)


# a town and state at the end of a shop's name: "Northside Trading Post in Lakeview, IL"
IN_TOWN = r"\s+in\s+([^,]+,\s*[A-Z]{2})$"


def core_name(name):
    """the shop's name without a town at its end"""
    return re.sub(IN_TOWN, "", str(name or "")).strip()


def words(name):
    return [w for w in fold(core_name(name)).split() if w not in SMALL] or fold(core_name(name)).split()


def town_of(shop):
    """the town to look a shop up in: the city part of its address, else "<town>, <ST>" ending its name; '' when neither"""
    parts = [p.strip() for p in str(shop.get("place") or "").split(",") if p.strip()]
    if parts and fold(parts[-1]) in ("usa", "us", "united states"):
        parts = parts[:-1]
    if len(parts) >= 2:
        state = re.sub(r"\s*\d[\d-]*$", "", parts[-1]).strip()
        city = parts[-2]
        m = re.match(r"^\d+\w*\s+.*?\b" + STREET + r"\.?\s+(.+)$", city, re.I)
        if m:
            city = m.group(1)
        if re.match(r"^\d", city):
            city = ""
        if city:
            return f"{city.strip().title() if city.islower() else city.strip()}, {state}".strip(", ")
    elif len(parts) == 1 and not re.search(r"\d", parts[0]):
        return parts[0]
    m = re.search(IN_TOWN, str(shop.get("name") or ""))
    return m.group(1).strip() if m else ""


def due(shop, now_ms):
    if not isinstance(shop, dict) or shop.get("kind") != "local" or shop.get("url") or not town_of(shop):
        return False
    tried = shop.get("siteTried")
    return not isinstance(tried, (int, float)) or now_ms - tried > RETRY_DAYS * 86_400_000


def host(url):
    try:
        h = urllib.parse.urlsplit(str(url or "").strip()).hostname or ""
    except ValueError:
        return ""
    return h.lower().removeprefix("www.")


def blocked(h):
    return any(h == b or h.endswith("." + b) for b in BLOCKED)


def phone10(p):
    d = re.sub(r"\D", "", str(p or ""))
    d = d[1:] if len(d) == 11 and d.startswith("1") else d
    return d if len(d) == 10 else ""


def street_of(addr):
    """(house number, first word of the street) from an address, or None ("180 West First Street": 180, 1st)"""
    m = re.match(r"^\s*(\d+[a-z]?)\s+(?:[nsew]\.?\s+|north\s+|south\s+|east\s+|west\s+)?([a-z0-9]+)", fold(addr))
    return (m.group(1), m.group(2)) if m else None


# OpenStreetMap -------------------------------------------------------------------------------------------------

def osm_lookup(shop, town, fetch, wait):
    """what OpenStreetMap has for the one music shop with this name in this town: {site, phone, address}, or {}"""
    q = urllib.parse.urlencode({"q": f"{core_name(shop.get('name'))}, {town}", "format": "jsonv2", "extratags": 1,
                                "addressdetails": 1, "limit": 5})
    wait()
    r = fetch(f"{NOMINATIM}?{q}")
    try:
        rows = json.loads(r[1]) if r and r[0] == 200 else []
    except ValueError:
        rows = []
    want = set(words(shop.get("name")))
    city = fold(town.split(",")[0])
    hits = []
    for x in rows if isinstance(rows, list) else []:
        a = x.get("address") or {}
        places = {fold(a.get(k)) for k in ("city", "town", "village", "hamlet", "suburb", "municipality", "county")}
        if x.get("category") == "shop" and want <= set(fold(x.get("name")).split()) and (not city or city in places):
            hits.append(x)
    if len({h.get("osm_id") for h in hits}) != 1:
        return {}
    t, a = hits[0].get("extratags") or {}, hits[0].get("address") or {}
    site = t.get("website") or t.get("contact:website") or t.get("url") or ""
    street = " ".join(filter(None, [a.get("house_number"), a.get("road")]))
    city_name = a.get("city") or a.get("town") or a.get("village") or a.get("hamlet") or ""
    state = a.get("ISO3166-2-lvl4", "").split("-")[-1] if a.get("ISO3166-2-lvl4") else a.get("state", "")
    address = ", ".join(filter(None, [street, city_name, " ".join(filter(None, [state, a.get("postcode")]))]))
    return {k: v for k, v in {"site": site, "phone": t.get("phone") or t.get("contact:phone") or "",
                              "address": address if street else ""}.items() if v}


def plan(site, work, fetch=get, now_ms=None, wait=lambda: time.sleep(1.1)):
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    shops = site.get("shops") if isinstance(site.get("shops"), list) else []
    todo = []
    for s in [s for s in shops if due(s, now_ms)][:MAX_SHOPS]:
        town = town_of(s)
        todo.append({"id": s.get("id"), "name": core_name(s.get("name")), "town": town, "osm": osm_lookup(s, town, fetch, wait)})
    os.makedirs(work, exist_ok=True)
    json.dump({"shops": todo}, open(os.path.join(work, "plan.json"), "w"))
    return todo


# checking a website ----------------------------------------------------------------------------------------------

def page_says(text):
    """the page's title and site name, and every phone number and the text, folded"""
    title = " ".join(re.findall(r"<title[^>]*>(.*?)</title>", text, re.I | re.S)[:1])
    site_name = " ".join(re.findall(r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)', text, re.I))
    plain = re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)\b.*?</\1>", " ", text, flags=re.I | re.S))
    phones = {phone10(m) for m in re.findall(r"(?:tel:)?\+?1?[\s.(-]*\d{3}[\s.)-]*\d{3}[\s.-]*\d{4}", html.unescape(text))}
    # "2843 N. Clark St" reads as "2843 clark st", as street_of reads an address
    text_ = re.sub(r"\b(\d+[a-z]?) (?:n|s|e|w|north|south|east|west) ", r"\1 ", fold(html.unescape(plain)))
    return fold(html.unescape(title)), fold(html.unescape(site_name)), phones - {""}, " " + text_ + " "


CONTACT = re.compile(r"contact|about|visit|location|hours|find|directions|store", re.I)


def more_pages(url, text, limit=3):
    """the site's own contact, about or visit pages linked from its home page, where a shop keeps its address and phone"""
    out = []
    for href, label in re.findall(r'<a\b[^>]*href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', text, re.I | re.S):
        u = urllib.parse.urljoin(url, html.unescape(href))
        if host(u) == host(url) and u.rstrip("/") != url.rstrip("/") and CONTACT.search(href + " " + re.sub(r"<[^>]+>", "", label)) and u not in out:
            out.append(u)
    return out[:limit]


def anchored(text, phones, streets):
    _, _, page_phones, plain = page_says(text)
    return {("phone", p) for p in phones & page_phones} | {("street", s) for s in streets if f" {s[0]} {s[1]} " in plain}


def check(url, name, phones, streets, fetch):
    """'ok', 'mismatch' (it isn't the shop's), 'parked', or 'unsure' (blocked or not answering); with the anchors it showed"""
    r = fetch(url)
    if not r:
        return "unsure", set()
    status, text, final = r
    challenge = re.search(r"<title[^>]*>\s*(just a moment|attention required|access denied|security check)", text[:20000], re.I)
    if status in (401, 403, 429, 503) or challenge:
        return "unsure", set()
    if status != 200:
        return "unsure" if status >= 500 else "parked", set()
    if host(final) != host(url) or re.search(r"/lander\b|domain (is )?for sale|parked free|buy this domain", text[:20000], re.I):
        return "parked", set()
    title, site_name, _, _ = page_says(text)
    if not title and not site_name:
        return "parked", set()
    want = words(name)
    h = host(url).replace(".", " ").replace("-", " ")
    named = all(w in f" {title} {site_name} ".split() for w in want) or "".join(want) in h.replace(" ", "")
    anchors = anchored(text, phones, streets)
    # not on the home page: the site's own contact or visit page
    for u in more_pages(final, text) if named and not anchors else []:
        p = fetch(u)
        if p and p[0] == 200:
            anchors = anchored(p[1], phones, streets)
            if anchors:
                break
    return ("ok" if named and anchors else "mismatch"), anchors


def finish(site, plan_rows, found, fetch=get, now_ms=None):
    """the whole shops list with what was found, and a line per shop; (None, lines) when nothing changed"""
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    shops = [dict(s) if isinstance(s, dict) else s for s in site.get("shops") or []]
    lines, changed = [], False
    for row in plan_rows:
        s = next((x for x in shops if isinstance(x, dict) and x.get("id") == row.get("id")), None)
        if not s or not due(s, now_ms):
            continue
        f = found.get(row["id"]) if isinstance(found.get(row["id"]), dict) else {}
        rsd = f.get("rsd") if isinstance(f.get("rsd"), dict) else {}
        info = {"osm": row.get("osm") or {}, "rsd": {k: str(rsd.get(k) or "") for k in ("site", "phone", "address") if rsd.get(k)}}
        rejected = {str(h).lower() for h in s.get("siteRejected") or []}
        # each website named, by host, with who named it
        cands = {}
        for src, url in (("osm", info["osm"].get("site")), ("rsd", info["rsd"].get("site")), ("web", f.get("web"))):
            h = host(url)
            if not h or "." not in h or blocked(h) or h in rejected or not re.match(r"^https?://", str(url).strip(), re.I):
                continue
            cands.setdefault(h, set()).add(src)
        phones = {p for p in (phone10(info[k].get("phone")) for k in ("osm", "rsd")) if p} | ({phone10(s.get("phone"))} - {""})
        streets = {x for x in (street_of(info[k].get("address")) for k in ("osm", "rsd")) if x}
        pick, anchors, how = None, set(), set()
        for h, srcs in sorted(cands.items(), key=lambda kv: -len(kv[1])):
            tries = [f"https://{h}/"]
            # a listed address that's gone (a "webstore." that no longer answers): the shop's main domain too
            if h.count(".") >= 2:
                tries.append("https://" + h.split(".", 1)[1] + "/")
            for url in tries:
                verdict, a = check(url, s.get("name"), phones, streets, fetch)
                if verdict == "ok" or (verdict == "unsure" and len(srcs) >= 2):
                    pick, anchors, how = url, a, set(srcs)
                    break
            if pick:
                break
        # the phone and address: confirmed by the website's page, or the same from two sources
        add = {}
        if pick:
            add["url"] = pick
        sp, rp = phone10(info["osm"].get("phone")), phone10(info["rsd"].get("phone"))
        conf_phone = next((p for k, p in anchors if k == "phone"), "") or (sp if sp and sp == rp else "")
        if conf_phone and not s.get("phone"):
            src = info["osm"].get("phone") if phone10(info["osm"].get("phone")) == conf_phone else info["rsd"].get("phone")
            add["phone"] = src.strip()
            how |= {k for k in ("osm", "rsd") if phone10(info[k].get("phone")) == conf_phone}
        so, sr = street_of(info["osm"].get("address")), street_of(info["rsd"].get("address"))
        conf_street = next((x for k, x in anchors if k == "street"), None) or (so if so and so == sr else None)
        if conf_street and not s.get("place"):
            k = "rsd" if sr == conf_street and info["rsd"].get("address") else "osm"
            add["place"] = info[k]["address"].strip()
            how |= {x for x, st in (("osm", so), ("rsd", sr)) if st == conf_street}
        s.pop("siteTried", None)
        if add:
            s.update(add)
            had = s.get("found") if isinstance(s.get("found"), dict) else {}
            s["found"] = {"by": sorted(set(had.get("by") or []) | how), "keys": sorted(set(had.get("keys") or []) | set(add))}
        if not pick:
            s["siteTried"] = now_ms
        lines.append(f"{s.get('name')}: " + (f"website {pick} (from {', '.join(sorted(how))})" if pick else "no website found")
                     + "".join(f", {k}" for k in add if k != "url"))
        changed = True
    # the search link of every shop with a website and none yet, as part S always finds them
    out, more = shop_search.run({"shops": shops}, fetch=lambda u: (lambda r: r and r[:2])(fetch(u)), now_ms=now_ms)
    lines += more
    return (out if out is not None else shops if changed else None), lines


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "plan":
        doc = json.load(open(sys.argv[2]))
        todo = plan(doc["data"] if isinstance(doc.get("data"), dict) else doc, sys.argv[3])
        json.dump(doc["data"] if isinstance(doc.get("data"), dict) else doc, open(os.path.join(sys.argv[3], "site.json"), "w"))
        print("\n".join(f"ASK {t['id']} | {t['name']} | {t['town']}" + (" | has a website" if t["osm"].get("site") else "") for t in todo)
              if todo else "NOTHING TO DO")
    elif cmd == "finish":
        work = sys.argv[2]
        site = json.load(open(os.path.join(work, "site.json")))
        rows = json.load(open(os.path.join(work, "plan.json"))).get("shops", []) if os.path.exists(os.path.join(work, "plan.json")) else []
        try:
            found = json.load(open(sys.argv[3]))
        except (OSError, ValueError):
            found = {}
        shops, lines = finish(site, rows, found if isinstance(found, dict) else {})
        json.dump({"shops": shops} if shops is not None else {}, open(sys.argv[4], "w"))
        print("\n".join(lines) if lines else "No shops need a website or a search link.")
    else:
        sys.exit(__doc__)
