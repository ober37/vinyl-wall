"""Offline checks for app/tools/lookup.py's pure helpers. Run by dev/test.sh."""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "tools"))
import lookup as L

ARTICLE = """Novelists are a French metalcore band. They published their fifth studio album, CODA, in 2025, through their own label.

== History ==

=== 2013–2020: Early years ===
The debut full-length Souvenirs (2015) on Arising Empire was followed by Noir in 2017, on SharpTone Records, to good reviews.

=== 2023–present: Okapi, and CODA ===
The band selected a new vocalist and recorded the album over the winter, mixing it themselves in Paris.

== Musical style ==
Their songs often end in a long coda that builds slowly over a minute or more before the final chorus returns once more."""

fails = 0


def check(name, ok, got=""):
    global fails
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {got!r}"))
    fails += not ok


text, head = L.album_section(ARTICLE, "CODA")
check("artist article: the section whose heading names the album, after the lead", head == "2023–present: Okapi, and CODA"
      and text.startswith("Novelists are") and "over the winter" in text and "Souvenirs" not in text, (head, text))
check("artist article: case doesn't matter in the title typed", L.album_section(ARTICLE, "Coda")[1] == head)
text, head = L.album_section(ARTICLE, "Noir")
check("artist article: else the paragraphs that name it", head == "2013–2020: Early years" and text.startswith("The debut"), (head, text))
check("artist article: lowercase prose isn't a mention", L.album_section(ARTICLE.replace("CODA", "Other"), "Coda") is None)
check("artist article: nothing when the album isn't there", L.album_section(ARTICLE, "Okapi Live") is None)

done = {"title": "x", "aboutAt": "2026-10-01", "aboutV": 2, "about": {"summary": "s", "source": "claude"}}
check("redo: a summary from an older run stays", not L.needs_f(done))
check("redo: an older run with no summary goes once more", L.needs_f({**done, "about": {}}))
check("redo: a redo that found nothing is done", not L.needs_f({**done, "about": {}, "aboutV": 3}))
sys.exit(1 if fails else 0)
