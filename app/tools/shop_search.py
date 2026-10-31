#!/usr/bin/env python3
"""Find the search link of each shop on the wall that has a website but no search link (#118).

Usage: python3 -I shop_search.py <settings/site doc json> <out.json>

The owner never types a shop's search link: this tries the usual store searches on the shop's own site and keeps the
first that answers. A Shopify store's /search/suggest.json (which also marks it shopify), the site's OpenSearch
description, WooCommerce's and BigCommerce's search pages when the home page names the platform, then a search box on
the home page that submits as a plain link. A store whose search box is drawn by JavaScript has none of these. A shop where
none works is marked searchTried and tried again after SEARCH_RETRY_DAYS; the wall searches the web for the site and
the album meanwhile. out.json is {"shops": [the whole list]} to `update` settings/site with, or {} when nothing changed.
"""
import html, json, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = "VinylWall/1.0 (https://github.com/ober37/vinyl-wall)"
SEARCH_RETRY_DAYS = 30
PROBE = "vinyl"


def get(url):
    """(status, text) for a GET, or None when the site can't be reached."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json,*/*"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read(400_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:
        return None


def origin(url):
    u = urllib.parse.urlsplit(url)
    return f"https://{u.netloc}" if u.scheme in ("http", "https") and u.netloc else ""


def opensearch(o, home, fetch):
    """The search template from the site's OpenSearch description, with {q} for the words, or ''."""
    for tag in re.findall(r"<link\b[^>]*>", home, re.I):
        if "opensearchdescription+xml" not in tag.lower():
            continue
        href = re.search(r"""href\s*=\s*["']([^"']+)""", tag, re.I)
        if not href:
            continue
        r = fetch(urllib.parse.urljoin(o + "/", html.unescape(href.group(1))))
        if not r or r[0] != 200:
            continue
        for url in re.findall(r"<Url\b[^>]*>", r[1], re.I):
            if not re.search(r"""type\s*=\s*["']text/html["']""", url, re.I):
                continue
            t = re.search(r"""template\s*=\s*["']([^"']+)""", url, re.I)
            if not t:
                continue
            t = html.unescape(t.group(1)).replace("{searchTerms}", "{q}")
            t = re.sub(r"[?&][^=&]+=\{[^}]*\?\}", "", t)  # optional parameters ({startPage?}, …) left out
            if t.startswith("https://") and "{q}" in t and "{" not in t.replace("{q}", ""):
                return t
    return ""


SEARCH_NAMES = {"q", "query", "search", "s", "sf", "keyword", "keywords", "term", "k"}


def search_form(o, home, fetch):
    """A search box on the home page that submits as a link (GET, on the shop's own site), with {q} for the words, or ''."""
    for form in re.findall(r"<form\b.*?</form>", home, re.I | re.S):
        tag = re.match(r"<form\b[^>]*>", form, re.I).group(0)
        attr = lambda t, k: (m.group(1) if (m := re.search(k + r"""\s*=\s*["']([^"']*)""", t, re.I)) else "")
        if attr(tag, "method").lower() not in ("", "get"):
            continue
        action = urllib.parse.urljoin(o + "/", html.unescape(attr(tag, "action")) or "/")
        if origin(action) != o:
            continue
        box, keep = "", []
        for i in re.findall(r"<input\b[^>]*>", form, re.I):
            name, kind = attr(i, "name"), attr(i, "type").lower() or "text"
            if kind == "hidden" and name:
                keep.append((name, html.unescape(attr(i, "value"))))
            elif not box and name and (kind == "search" or kind == "text" and name.lower() in SEARCH_NAMES):
                box = name
        if not box:
            continue
        base = action.split("?")[0] + "?" + urllib.parse.urlencode(keep + [(box, "")])
        t = base[: -len(urllib.parse.quote(box) + "=")] + urllib.parse.quote(box) + "={q}" if base.endswith(box + "=") else ""
        # many stores refuse automated visits to their search page; the box on their own page is evidence enough then
        r = fetch(t.replace("{q}", PROBE)) if t else None
        if r and r[0] in (200, 403, 429, 503):
            return t
    return ""


def find_search(url, fetch=get):
    """{"search": …, "shopify": True?} for a shop's website, or None when no usual search answers."""
    o = origin(url)
    if not o:
        return None
    r = fetch(f"{o}/search/suggest.json?q={PROBE}&resources[type]=product")
    if r and r[0] == 200:
        try:
            if "resources" in json.loads(r[1]):
                return {"search": o + "/search?q={q}", "shopify": True}
        except ValueError:
            pass
    home = fetch(o + "/")
    if not home or home[0] != 200:
        return None
    t = opensearch(o, home[1], fetch)
    if t:
        return {"search": t}
    low = home[1].lower()
    for mark, path in (("woocommerce", "/?s={q}&post_type=product"), ("bigcommerce", "/search.php?search_query={q}")):
        if mark in low:
            r = fetch(o + path.replace("{q}", PROBE))
            if r and r[0] == 200:
                return {"search": o + path}
    t = search_form(o, home[1], fetch)
    return {"search": t} if t else None


def due(s, now_ms):
    if s.get("search") or not str(s.get("url") or "").startswith("https://"):
        return False
    tried = s.get("searchTried")
    return not isinstance(tried, (int, float)) or now_ms - tried > SEARCH_RETRY_DAYS * 86_400_000


def run(site, fetch=get, now_ms=None):
    """The whole shops list with what was found, and a line per shop tried; (None, []) when there's nothing to try."""
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    shops = site.get("shops")
    if not isinstance(shops, list):
        return None, []  # the defaults, which all have their search
    out, lines, changed = [], [], False
    for s in shops:
        if not isinstance(s, dict) or not due(s, now_ms):
            out.append(s)
            continue
        found = find_search(s["url"], fetch)
        s = {k: v for k, v in s.items() if k != "searchTried"}
        if found:
            s.update(found)
            lines.append(f"{s.get('name')}: {found['search']}")
        else:
            s["searchTried"] = now_ms
            lines.append(f"{s.get('name')}: no search found")
        out.append(s)
        changed = True
    return (out if changed else None), lines


if __name__ == "__main__":
    doc = json.load(open(sys.argv[1]))
    site = doc["data"] if isinstance(doc.get("data"), dict) else doc
    shops, lines = run(site)
    json.dump({"shops": shops} if shops is not None else {}, open(sys.argv[2], "w"))
    print("\n".join(lines) if lines else "No shops need a search link.")
