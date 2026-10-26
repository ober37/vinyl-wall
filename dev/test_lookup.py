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
sys.exit(1 if fails else 0)
