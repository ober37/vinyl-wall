"""Offline checks for app/tools/lookup.py's pure helpers. Run by dev/test.sh."""
import json, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "tools"))
import lookup as L

ARTICLE = """Novelists are a French metalcore band. They published their fifth studio album, CODA, in 2025, through their own label.

== History ==

=== 2013–2020: Early years ===
The debut album Souvenirs (2015) on Arising Empire was followed by Noir in 2017, on SharpTone Records, to good reviews.

=== 2023–present: Okapi, and CODA ===
The band selected a new vocalist and recorded the album over the winter, mixing it themselves in Paris.

== Live performances ==
In 2020 the band toured Europe twice, playing the new album live in full on most nights of both legs.

== Musical style ==
Their songs often end in a long coda that builds slowly over a minute or more before the final chorus returns once more."""

fails = 0


def check(name, ok, got=""):
    global fails
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {got!r}"))
    fails += not ok


text, head = L.album_section(ARTICLE, "CODA")
check("artist article: the section whose heading names the album, then the lead", head == "2023–present: Okapi, and CODA"
      and text.startswith("The band selected") and text.endswith("own label.") and "Souvenirs" not in text, (head, text))
check("artist article: case doesn't matter in the title typed", L.album_section(ARTICLE, "Coda")[1] == head)
text, head = L.album_section(ARTICLE, "Noir")
check("artist article: else the paragraphs that name it", head == "2013–2020: Early years" and text.startswith("The debut"), (head, text))
check("artist article: lowercase prose isn't a mention", L.album_section(ARTICLE.replace("CODA", "Other"), "Coda") is None)
check("artist article: nothing when the album isn't there", L.album_section(ARTICLE, "Okapi Live") is None)
check("artist article: a heading word isn't the album", L.album_section(ARTICLE, "Live") is None, L.album_section(ARTICLE, "Live"))
check("artist article: a year title is never matched", L.album_section(ARTICLE, "2020") is None)
SUB = "Lead.\n\n== Coda ==\n\n=== Recording ===\nRecorded in Paris over two winters with the band producing.\n\n== Tours ==\nToured a lot."
text, head = L.album_section(SUB, "Coda") or (None, None)
check("artist article: a section's subsections come with it", head == "Coda" and "Recorded in Paris" in (text or "")
      and "Toured" not in (text or ""), (head, text))
check("artist article: a sentence-initial word isn't a mention",
      L.album_section("Lead.\n\n== History ==\nNoise is what the album was built on, said the drummer about the whole record.", "Noise") is None)

done = {"title": "x", "aboutAt": "2026-10-01", "aboutV": 2, "about": {"summary": "s", "source": "claude"}}
check("redo: a summary from an older run stays", not L.needs_f(done))
check("redo: an older run with no summary goes once more", L.needs_f({**done, "about": {}}))
check("redo: a redo that found nothing is done", not L.needs_f({**done, "about": {}, "aboutV": 3}))
check("redo: the page's reset (Find cover & details, a new title) looks it up again",
      L.needs_f({**done, "about": {}, "aboutV": 0, "aboutAt": ""}))
snak = lambda v: {"rank": "normal", "mainsnak": {"datavalue": {"value": {"id": v}}}}
singer = {"claims": {"P31": [snak("Q5")], "P106": [snak("Q488205")]}}
check("artist: a singer-songwriter with no music ids counts", L.is_artist(singer))
check("artist: a band counts", L.is_artist({"claims": {"P31": [snak("Q5741069")]}}))
check("artist: a person with another job doesn't", not L.is_artist({"claims": {"P31": [snak("Q5")], "P106": [snak("Q82955")]}}))
L.ENT.update({"Q900": {**singer, "labels": {"en": {"value": "Jane Doe"}}, "sitelinks": {"enwiki": {"title": "Jane Doe"}}}})
L.resolve = lambda ts: {t: "Q900" for t in ts if t == "Jane Doe"}
L.entities = lambda ids, props=None: {}
L.fetch = lambda *a, **k: {}
L.PAGES["Jane Doe"] = "Jane Doe is a singer.\n\n== Discography ==\n\"Quiet Rooms\" (2019 Small Label)"
check("artist: no ids, no MusicBrainz match, the article names the album: linked",
      L.pick_artists({"r": ("Jane Doe", "Quiet Rooms", None, None)}, set()) == {"r": "Q900"})
L.ENT["Q901"] = {**singer, "labels": {"mul": {"value": "Jane Roe"}, "fr": {"value": "Jane Roe"}}, "sitelinks": {"enwiki": {"title": "Jane Roe (singer)"}}}
L.ENT["Q902"] = {"sitelinks": {"enwiki": {"title": "Jane Poe (singer)"}}}
check("label: the shared mul name when there's no English one", L.label("Q901") == "Jane Roe")
check("label: else the article title without its parenthetical", L.label("Q902") == "Jane Poe")
L.resolve = lambda ts: {t: "Q901" for t in ts if t == "Jane Roe (singer)"}
L.PAGES["Jane Roe (singer)"] = "Jane Roe is a singer.\n\n== Discography ==\n\"Quiet Rooms\" (2019 Small Label)"
check("artist: a page with only a mul label is picked", L.pick_artists({"r": ("Jane Roe", "Quiet Rooms", None, None)}, set()) == {"r": "Q901"})
L.resolve = lambda ts: {t: "Q900" for t in ts if t == "Jane Doe"}
check("artist: the same page without the album named: not linked",
      L.pick_artists({"r": ("Jane Doe", "Loud Rooms", None, None)}, set()) == {})
lab = lambda n: L._dlabel({"labels": [{"name": n}]})
check("discogs label: Not On Label reads Self-released", lab("Not On Label (Novelists Self-released)") == "Self-released")
check("discogs label: a real label keeps its name, without the (2)", lab("ACKOR Music (2)") == "ACKOR Music")
med = lambda f, *ns: {"format": f, "tracks": [{"number": n, "title": n} for n in ns]}
box = {"id": "box", "media": [med("12\" Vinyl", "A1", "B1"), med("12\" Vinyl", "C1", "D1"), med("CD", "1", "2"), med("DVD", "1", "2")]}
L.fetch = lambda *a, **k: {"releases": [box]}
got = [t["pos"] for t in L.mb_tracks("g")["tracks"]]
check("tracks: a box set lists only its vinyl", got == ["A1", "B1", "C1", "D1"], got)
L.fetch = lambda *a, **k: {"releases": [box, {"id": "lp", "media": [med("12\" Vinyl", "A1", "B1")]}]}
check("tracks: an all-vinyl release wins over a box set", L.mb_tracks("g")["tracksUrl"].endswith("/lp"))
L.fetch = lambda *a, **k: {"releases": [{"id": "cd", "media": [med("CD", "1", "2")]}]}
check("tracks: no vinyl, the earliest release's tracks", [t["pos"] for t in L.mb_tracks("g")["tracks"]] == ["1", "2"])
import tempfile
writes, add = L._writer(tempfile.mkdtemp(), 5)
add("update", "records", "r1", {"x": 1}, 3)
beat = json.load(open(writes[0]["file_path"]))
check("batches: every write to an existing doc is pinned", all(w["op"] == "set" or w.get("if_version") for w in writes), writes)
check("batches: each tells the page the run is still going and what it leaves for the next", writes[0]["collection"] == "settings" and writes[0]["doc_id"] == "site"
      and writes[0]["if_version"] == "SETTINGS_VERSION" and beat["run"]["beatMs"] > 0 and beat["lookupLeft"] == 5 and writes[1]["doc_id"] == "r1",
      (writes, beat))

DAY, now = 86400000, 1_800_000_000_000
miss = lambda n, ago, v=L.LOOKUP_V: {"lookTries": n, "lookedAt": now - ago, "lookV": v}
check("retries: never tried is due", L.due({}, now))
check("retries: a miss waits a day", not L.due(miss(1, DAY - 1), now) and L.due(miss(1, DAY), now))
check("retries: a second miss waits a week", not L.due(miss(2, 6 * DAY), now) and L.due(miss(2, 7 * DAY), now))
check("retries: the third miss stops it", not L.due(miss(3, 999 * DAY), now))
check("retries: asking again (needsEnrich) always runs, and counts from zero",
      L.due({**miss(3, 0), "needsEnrich": True}, now) and L.tries({**miss(3, 0), "needsEnrich": True}) == 0)
check("retries: a newer lookup gives a stopped record one more try",
      L.due(miss(3, 7 * DAY, v=0), now) and L.tries(miss(3, 0, v=0)) == 2)
ts = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "src", "model", "task.ts")).read()
check("retries: the page's LOOKUP_V matches", f"export const LOOKUP_V = {L.LOOKUP_V}\n" in ts)

import contextlib, io
work = tempfile.mkdtemp()
recs = {"none": {"title": "a", "artist": "x"}, "again": {"title": "b", "artist": "x", "lookTries": 1, "lookV": L.LOOKUP_V},
        "found": {"title": "c", "artist": "x", "lookTries": 2, "lookV": L.LOOKUP_V, "lookedAt": 1},
        "rate": {"title": "d", "artist": "x", "coverAsset": "a", "runtime": 40}}
fill = lambda rid, **kw: {"needA": rid != "rate", "needF": True, "fill": kw, "coverUrl": None, "summarise": False, "retry": rid == "rate"}
json.dump({"groups": [list(recs)], "later": [], "left": 0, "artists": {},
           "records": {rid: {"data": r, "version": 1} for rid, r in recs.items()}}, open(os.path.join(work, "plan.json"), "w"))
os.makedirs(os.path.join(work, "g0"))
json.dump({"found": {"none": fill("none"), "again": fill("again", runtime=40), "found": fill("found", runtime=40), "rate": fill("rate")},
           "artists": {}}, open(os.path.join(work, "g0", "found.json"), "w"))
with contextlib.redirect_stdout(io.StringIO()):
    L.save(work, 0, "found=asset1")
out = {f.split("records_")[1][:-5]: json.load(open(os.path.join(work, "g0", "facts", f)))
       for f in os.listdir(os.path.join(work, "g0", "facts")) if f.startswith("records_")}
check("retries: a miss is counted", out["none"]["lookTries"] == 1 and out["none"]["lookV"] == L.LOOKUP_V and out["none"]["lookedAt"] > 0, out["none"])
check("retries: a runtime but still no cover is another miss", out["again"]["lookTries"] == 2, out["again"])
check("retries: a cover and runtime found clears the count", out["found"]["lookTries"] == L.DEL and out["found"]["lookedAt"] == L.DEL, out["found"])
check("retries: a rate-limited album info lookup is a miss", out["rate"]["lookTries"] == 1, out["rate"])
db = tempfile.mkdtemp()
json.dump({"title": "a", "artist": "x", **miss(3, 0)}, open(os.path.join(db, "stopped.json"), "w"))
json.dump({"records": {}, "artists": {}}, open(os.path.join(db, "v.json"), "w"))
with contextlib.redirect_stdout(io.StringIO()):
    L.plan(db, os.path.join(db, "none"), os.path.join(db, "v.json"), os.path.join(db, "work"))
check("retries: the plan leaves out a record the lookup stopped on",
      json.load(open(os.path.join(db, "work", "plan.json")))["records"] == {})

aja = {"title": "Aja", "artist": "Steely Dan"}
wd = lambda y: {"claims": {"P577": [{"rank": "normal", "mainsnak": {"datavalue": {"value": {"time": f"+{y}-09-23T00:00:00Z", "precision": 11}}}}]}}
reissue, original = {"year": "2023", "label": "UMe", "runtime": 40}, {"year": "1977"}
check("year: the earliest a source gives, not the store's reissue", L.facts(aja, {}, reissue, original, None, None) == {"year": "1977", "runtime": 40},
      L.facts(aja, {}, reissue, original, None, None))
check("year: a reissue's label isn't the album's", "label" not in L.facts(aja, {}, reissue, {}, None, "1977"))
check("year: a store's label when its edition is the original", L.facts(aja, {}, {"year": "1977", "label": "ABC"}, {}, None, None)["label"] == "ABC")
looked = {**aja, "year": "1977", "label": "ABC", "runtime": 40, "autoFilled": ["year", "label"]}
check("year: a looked-up original stays when a refresh finds only a reissue", L.facts(looked, {}, reissue, {}, None, None) == {})
check("year: a looked-up year gives way to an earlier one", L.facts({**looked, "year": "2023"}, {}, {}, original, None, None) == {"year": "1977"})
check("year: a looked-up year gives way to Wikidata's", L.facts({**looked, "year": "1974"}, wd(1999), {}, {}, None, None) == {"year": "1999"})
check("year: a typed year is never touched", L.facts({**aja, "year": "1980"}, wd(1977), {}, original, None, None) == {})
check("year: a pressing's year 0 doesn't count", L.facts(aja, {}, {}, {}, {"year": 0}, None) == {})

# #95: Wikidata's label only when no other source says otherwise
L.ENT.update({"Q1": {"labels": {"en": {"value": "Big Brother Recordings"}}}, "Q2": {"labels": {"en": {"value": "Epic Records"}}},
              "Q3": {"labels": {"en": {"value": "Warner Bros. Records"}}}})
labels = lambda *qs: {"claims": {"P264": [{"rank": "normal", "mainsnak": {"datavalue": {"value": {"id": q}}}} for q in qs]}}
rumours = {"title": "Rumours", "artist": "Fleetwood Mac"}
remaster, first = {"year": "2004", "label": "Rhino/Warner Records"}, {"year": "1977", "label": "Rhino/Warner Records"}
check("label: loose agreement", L.labels_agree("Warner Bros. Records", "Rhino/Warner Records")
      and not L.labels_agree("Big Brother Recordings", "Rhino/Warner Records") and not L.labels_agree("Records", "Recordings"))
check("label: Rumours doesn't get Big Brother Recordings", "label" not in L.facts(rumours, labels("Q1", "Q2"), remaster, {}, None, "1977"),
      L.facts(rumours, labels("Q1", "Q2"), remaster, {}, None, "1977"))
check("label: nor in its Key info", L.wd_album_label(labels("Q1", "Q2"), remaster, None) is None)
check("label: an original's label from another source when Wikidata's disagree",
      L.facts(rumours, labels("Q1", "Q2"), first, {}, None, None).get("label") == "Rhino/Warner Records")
check("label: Wikidata's wording when another source agrees",
      L.facts(rumours, labels("Q3"), remaster, {}, None, "1977").get("label") == "Warner Bros. Records")
check("label: the Wikidata label that agrees, not just the first", L.wd_album_label(labels("Q1", "Q3"), remaster, None) == "Warner Bros. Records")
check("label: the linked pressing counts as another source",
      L.wd_album_label(labels("Q1"), {}, {"labels": [{"name": "Warner Bros. Records"}]}) is None)
check("label: Wikidata's alone when no other source has one", L.facts(rumours, labels("Q1"), {"year": "2004"}, {}, None, "1977").get("label")
      == "Big Brother Recordings" and L.wd_album_label(labels("Q2", "Q1"), {}, None) == "Epic Records")
check("label: a typed label is never touched", "label" not in L.facts({**rumours, "label": "WB"}, labels("Q3"), first, {}, None, None))

check("thin: one word each", L.thin({"title": "Test", "artist": "Test"}) and L.thin({"title": "Okapi", "artist": "Novelists"}))
check("thin: a two-word artist isn't", not L.thin(aja) and not L.thin({"title": "Tusk", "artist": "Fleetwood Mac"}))
check("thin: sources agree within a year", L.agree("2026", None, "2026") and L.agree("2025", "2024", None))
check("thin: one source, or years apart, isn't agreement", not L.agree("1974", None, "1999-01-01") and not L.agree(None, "2026", None))
SRC = {"Test": ({"year": "1974", "cover": "https://dz/test.jpg", "label": "WM Poland"}, None, {"id": "g1", "title": "TEST", "first-release-date": "1999"}),
       "Untitled": (None, {"year": "2026", "cover": "https://it/u.jpg"}, None),
       "Mahjong": ({"year": "2026", "cover": "https://dz/m.jpg"}, None, {"id": "g2", "first-release-date": "2026-08-28"}),
       "Aja": (reissue | {"cover": "https://dz/aja.jpg"}, None, None)}
L.deezer, L.itunes, L.mb_group = (lambda r: SRC[r["title"]][0]), (lambda r: SRC[r["title"]][1]), (lambda r: SRC[r["title"]][2])
L.mb_tracks = lambda gid: {"tracks": [{"pos": "A1", "title": "x"}], "tracksSource": "musicbrainz", "tracksUrl": ""}
L.mb_wikidata, L.pick_albums, L.extracts, L.full_texts = (lambda gid: None), (lambda recs: {}), (lambda *a, **k: {}), (lambda *a, **k: {})
L.pick_artists = lambda want, failed: {rid: "Q900" for rid in want}
L.get_cover = lambda url, dst: dst
thins = {"t": {"title": "Test", "artist": "Test"}, "u": {"title": "Untitled", "artist": "Unknown"},
         "m": {"title": "Mahjong", "artist": "ASAVA"}, "a": aja}
work = tempfile.mkdtemp()
with contextlib.redirect_stdout(io.StringIO()):
    L.fetch_group(work, 0, {"groups": [list(thins)], "records": {k: {"data": r} for k, r in thins.items()}, "artists": {}}, set())
got = json.load(open(os.path.join(work, "g0", "found.json")))["found"]
check("thin: Test / Test gets no cover, label or album info", got["t"]["fill"] == {} and not got["t"]["coverUrl"]
      and got["t"]["about"] == {} and "artistKey" not in got["t"], got["t"])
check("thin: a single store's match isn't enough", got["u"]["fill"] == {} and not got["u"]["coverUrl"], got["u"])
check("thin: two sources that agree still match", got["m"]["fill"].get("year") == "2026" and got["m"]["coverUrl"], got["m"])
check("thin: a two-word artist matches on one source, as before", got["a"]["coverUrl"] and got["a"]["fill"].get("year") == "2023", got["a"])

check("removed cover: not waited for", not L.needs_a({"coverAsset": "", "coverBlocked": True, "runtime": 40}))
work = tempfile.mkdtemp()
off = {"title": "Aja", "artist": "Steely Dan", "coverAsset": "", "coverBlocked": True}
p = {"groups": [["b"]], "records": {"b": {"data": off, "version": 1}}, "artists": {}, "left": 0}
json.dump(p, open(os.path.join(work, "plan.json"), "w"))
with contextlib.redirect_stdout(io.StringIO()):
    L.fetch_group(work, 0, p, set())
    L.save(work, 0)
got = json.load(open(os.path.join(work, "g0", "found.json")))["found"]["b"]
d = json.load(open(os.path.join(work, "g0", "facts", "records_b.json")))
check("removed cover: the lookup doesn't put one back, but still fills the details", not got["coverUrl"] and got["fill"].get("runtime") == 40, got)
check("removed cover: no \"couldn't find\" note, and not counted as a miss", "notes" not in d and "lookTries" not in d, d)

# #94: a retitled record (relook) looks up again what was filled in for the old album; typed values and uploaded or
# removed covers stay, and a lookup that finds nothing keeps what was there
done = {"aboutAt": "2026-10-01", "aboutV": 3, "about": {"summary": "s"}}  # album info already looked up: pass 1 only
was = {"artist": "Fleetwood Mac", "year": "1977", "label": "Warner Bros. Records", "runtime": 40, "coverAsset": "old",
       "autoFilled": ["coverAsset", "label", "runtime", "year"], "discogsId": 1, "needsEnrich": True, "relook": True, **done}
rumours_dg = {"title": "Rumours", "artists": [{"name": "Fleetwood Mac"}], "year": 1977, "labels": [{"name": "Warner Bros. Records"}],
              "images": [{"type": "primary", "uri": "https://dg/rumours.jpg"}]}
SRC.update({"Tango in the Night": ({"year": "1987", "runtime": 45, "cover": "https://dz/tango.jpg", "label": "Warner Bros."}, None, None),
            "Rumors": (None, None, None)})
L.discogs_release = lambda rid: rumours_dg
check("relook: the linked pressing still counts when it's the album's", L.pressing_ok(rumours_dg, {"title": "Rumours (Deluxe)", "artist": "Fleetwood Mac"})
      and not L.pressing_ok(rumours_dg, {"title": "Tango in the Night", "artist": "Fleetwood Mac"})
      and not L.pressing_ok(rumours_dg, {"title": "Rumours", "artist": "The Corrs"}))
relooks = {"new": {**was, "title": "Tango in the Night"},
           "typed": {**was, "title": "Tango in the Night", "autoFilled": ["label", "runtime"]},  # typed year, uploaded cover
           "removed": {**was, "title": "Tango in the Night", "coverAsset": "", "coverBlocked": True},
           "typo": {**was, "title": "Rumors"},
           "plain": {**{k: v for k, v in was.items() if k != "relook"}, "title": "Tango in the Night"}}  # asked again, not retitled
work = tempfile.mkdtemp()
p = {"groups": [list(relooks)], "records": {k: {"data": r, "version": 1} for k, r in relooks.items()}, "artists": {}, "left": 0}
json.dump(p, open(os.path.join(work, "plan.json"), "w"))
with contextlib.redirect_stdout(io.StringIO()):
    L.fetch_group(work, 0, p, set())
    L.save(work, 0, "new=asset2", "plain=asset3")
got = json.load(open(os.path.join(work, "g0", "found.json")))["found"]
d = {rid: json.load(open(os.path.join(work, "g0", "facts", f"records_{rid}.json"))) for rid in relooks}
check("relook: a new album's year, label and runtime replace the old one's, even a later year",
      got["new"]["fill"] == {"year": "1987", "label": "Warner Bros.", "runtime": 45}, got["new"]["fill"])
check("relook: a looked-up cover is replaced, not from the old album's linked pressing",
      got["new"]["coverUrl"] == "https://dz/tango.jpg" and d["new"].get("coverAsset") == "asset2", (got["new"]["coverUrl"], d["new"]))
check("relook: the flag comes off with needsEnrich", d["new"]["relook"] == L.DEL and d["new"]["needsEnrich"] == L.DEL, d["new"])
check("relook: a typed year and an uploaded cover stay", "year" not in got["typed"]["fill"] and not got["typed"]["coverUrl"]
      and "coverAsset" not in d["typed"] and got["typed"]["fill"].get("runtime") == 45, (got["typed"], d["typed"]))
check("relook: a removed cover stays removed", not got["removed"]["coverUrl"] and "coverAsset" not in d["removed"], got["removed"])
check("relook: a typo fix that finds nothing keeps what was there", got["typo"]["fill"] == {} and not got["typo"]["coverUrl"]
      and not {"year", "label", "runtime", "coverAsset", "notes"} & set(d["typo"]) and d["typo"]["relook"] == L.DEL, (got["typo"], d["typo"]))
check("relook: without it, a looked-up year and cover stay as before (#64)", "year" not in got["plain"]["fill"]
      and not got["plain"]["coverUrl"] and "coverAsset" not in d["plain"] and "relook" not in d["plain"], (got["plain"], d["plain"]))
sys.exit(1 if fails else 0)
