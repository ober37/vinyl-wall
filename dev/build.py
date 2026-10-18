"""Build dev/preview.html: the real page with the mock runtime, for a plain browser.
   python3 dev/build.py && python3 -m http.server 8765 -d dev   then open http://localhost:8765/preview.html?dz
   Covers show as generated sleeves (no image files); backgrounds load from app/backgrounds via the backgrounds/ path."""
import os, shutil
here = os.path.dirname(os.path.abspath(__file__))
page = open(os.path.join(here, "..", "app", "vinyl-wall.html")).read()
mock = open(os.path.join(here, "mock.js")).read()
head = ('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style><script>' + mock + '</script></head><body>')
open(os.path.join(here, "preview.html"), "w").write(head + page + "</body></html>")
dst = os.path.join(here, "backgrounds")
shutil.rmtree(dst, ignore_errors=True)  # always fresh, so replaced photos show up
shutil.copytree(os.path.join(here, "..", "app", "backgrounds"), dst)
print("wrote dev/preview.html")
