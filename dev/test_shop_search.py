"""Offline checks for app/tools/shop_search.py, with canned site answers. Run by dev/test.sh."""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "tools"))
import shop_search as S

fails = 0


def check(name, ok, got=""):
    global fails
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {got!r}"))
    fails += not ok


def site(pages):
    """A fake fetch answering the pages given (url → (status, text)) and 404 for the rest; records what was asked."""
    asked = []

    def fetch(url):
        asked.append(url)
        return pages.get(url, (404, ""))
    fetch.asked = asked
    return fetch


O = "https://shop.example.com"
SUGGEST = f"{O}/search/suggest.json?q=vinyl&resources[type]=product"

f = site({SUGGEST: (200, '{"resources": {"results": {}}}')})
check("Shopify: suggest.json answers, so its search and shopify", S.find_search(O + "/collections/vinyl", f) == {"search": O + "/search?q={q}", "shopify": True})

f = site({O + "/": (200, '<link rel="search" type="application/opensearchdescription+xml" href="/opensearch.xml">'),
          O + "/opensearch.xml": (200, '<Url type="application/rss+xml" template="https://shop.example.com/rss?q={searchTerms}"/>'
                                       '<Url type="text/html" template="https://shop.example.com/find?term={searchTerms}&amp;page={startPage?}"/>')})
check("OpenSearch: the HTML template, {q} for the words, optional parameters left out", S.find_search(O, f) == {"search": O + "/find?term={q}"}, S.find_search(O, f))

f = site({O + "/": (200, '<body class="woocommerce-page">'), O + "/?s=vinyl&post_type=product": (200, "results")})
check("WooCommerce: named on the home page, and its search answers", S.find_search(O, f) == {"search": O + "/?s={q}&post_type=product"})

f = site({O + "/": (200, '<script src="https://cdn11.bigcommerce.com/x.js">'), O + "/search.php?search_query=vinyl": (200, "results")})
check("BigCommerce: named on the home page, and its search answers", S.find_search(O, f) == {"search": O + "/search.php?search_query={q}"})

f = site({O + "/": (200, '<body class="woocommerce">')})
check("a platform named but its search not answering: nothing", S.find_search(O, f) is None)
f = site({O + "/": (200, '<form id="login"><input name="email"></form><form name="search" action="/search.php" method="get">'
                       '<input type="hidden" name="type" value="lp"><input type="text" name="sf"></form>'),
          O + "/search.php?type=lp&sf=vinyl": (200, "results")})
check("a search box that submits as a link, with its hidden fields", S.find_search(O, f) == {"search": O + "/search.php?type=lp&sf={q}"}, S.find_search(O, f))
f = site({O + "/": (200, '<form action="search" method="post"><input type="search" name="q"></form>'
                       '<form action="https://elsewhere.example.com/s"><input type="search" name="q"></form>')})
f = site({O + "/": (200, '<form action="/find"><input type="search" name="term"></form>'), O + "/find?term=vinyl": (403, "")})
check("a search box whose page refuses automated visits: kept", S.find_search(O, f) == {"search": O + "/find?term={q}"})
f = site({O + "/": (200, '<form action="/find"><input type="search" name="term"></form>')})
check("a search box whose page isn't there: nothing", S.find_search(O, f) is None)
check("a search box that posts, or goes to another site: nothing", S.find_search(O, f) is None)
check("a plain site: nothing", S.find_search(O, site({O + "/": (200, "<html>Records</html>")})) is None)
check("a site that can't be reached: nothing", S.find_search(O, lambda u: None) is None)
check("not a web address: nothing, and nothing asked", S.find_search("ftp://x", site({})) is None)

NOW = 1_800_000_000_000
shops = [
    {"id": "a", "name": "Has one", "kind": "online", "url": O + "/", "search": O + "/s?q={q}"},
    {"id": "b", "name": "Shopify one", "kind": "online", "url": O + "/"},
    {"id": "c", "name": "No site", "kind": "local", "place": "Main St"},
    {"id": "d", "name": "Tried lately", "kind": "online", "url": "https://other.example.com/", "searchTried": NOW - 86_400_000},
    {"id": "e", "name": "Tried long ago", "kind": "online", "url": "https://old.example.com/", "searchTried": NOW - 31 * 86_400_000},
]
f = site({SUGGEST: (200, '{"resources": {}}')})
out, lines = S.run({"shops": [dict(s) for s in shops]}, f, NOW)
check("run: finds one, marks the one that has none, leaves the rest as they are",
      out[0] == shops[0] and out[1] == {**shops[1], "search": O + "/search?q={q}", "shopify": True} and out[2] == shops[2]
      and out[3] == shops[3] and out[4] == {**shops[4], "searchTried": NOW}, out)
check("run: asks only the shops due (no search, a website, not tried in 30 days)",
      not any("other.example.com" in u for u in f.asked) and any("old.example.com" in u for u in f.asked), f.asked)
check("run: a line per shop tried", lines == [f"Shopify one: {O}/search?q={{q}}", "Tried long ago: no search found"], lines)
check("run: the defaults (no list saved) need nothing", S.run({}, site({}), NOW) == (None, []))
check("run: nothing due, nothing to write", S.run({"shops": [shops[0], shops[3]]}, site({}), NOW)[0] is None)

print(f"{fails} failed" if fails else "all passed")
sys.exit(1 if fails else 0)
