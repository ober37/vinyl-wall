"""Build dev/preview.html: the real page with the mock runtime, for a plain browser.
   python3 dev/build.py && python3 -m http.server 8765 -d dev   then open http://localhost:8765/preview.html?dz
   Covers show as generated sleeves (no image files); backgrounds load from app/backgrounds via the backgrounds/ path."""
import os, shutil, subprocess
here = os.path.dirname(os.path.abspath(__file__))
page = open(os.path.join(here, "..", "app", "vinyl-wall.html")).read()
# on the React branch app/vinyl-wall.html is the new page (web/, tested by its own suite); the smoke test drives the
# plain-JS page as main had it where the branch started, so it still has a page that matches dev/test.html
if 'name="vinyl-wall-version"' in page:
    git = lambda *a: subprocess.run(["git", *a], cwd=here, capture_output=True, text=True, check=True).stdout.strip()
    page = git("show", git("merge-base", "HEAD", "main") + ":app/vinyl-wall.html")
mock = open(os.path.join(here, "mock.js")).read()
head = ('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style><script>' + mock + '</script></head><body>')
open(os.path.join(here, "preview.html"), "w").write(head + page + "</body></html>")
dst = os.path.join(here, "backgrounds")
shutil.rmtree(dst, ignore_errors=True)  # always fresh, so replaced photos show up
shutil.copytree(os.path.join(here, "..", "app", "backgrounds"), dst)
print("wrote dev/preview.html")
