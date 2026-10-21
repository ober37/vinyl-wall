"""Offline checks for app/tools/lookup.py's pure helpers. Run by dev/test.sh."""
import os, sys

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
check("artist: the same page without the album named: not linked",
      L.pick_artists({"r": ("Jane Doe", "Loud Rooms", None, None)}, set()) == {})
lab = lambda n: L._dlabel({"labels": [{"name": n}]})
check("discogs label: Not On Label reads Self-released", lab("Not On Label (Novelists Self-released)") == "Self-released")
check("discogs label: a real label keeps its name, without the (2)", lab("ACKOR Music (2)") == "ACKOR Music")
sys.exit(1 if fails else 0)
