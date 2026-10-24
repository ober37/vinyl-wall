"""Build the React page (web/) into app/vinyl-wall.html, the file SETUP.md publishes, and check its version matches VERSION.
   python3 dev/build_web.py            the page loads React and appica from jsdelivr (cdn-lock.json); about 250 KB
   python3 dev/build_web.py --bundle   everything inlined in one file instead (about 850 KB): the fallback if the CDN can't be used"""
import os, re, subprocess, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
web = os.path.join(root, "web")
env = dict(os.environ, **({"BUNDLE": "1"} if "--bundle" in sys.argv else {}))
subprocess.run(["npx", "vite", "build"], cwd=web, env=env, check=True, stdout=subprocess.DEVNULL)
page = open(os.path.join(web, "dist", "index.html")).read()
version = open(os.path.join(root, "VERSION")).read().strip()
m = re.search(r'<meta name="vinyl-wall-version" content="([0-9.]+)"', page)
if not m or m.group(1) != version:
    sys.exit(f"page version {m and m.group(1)} doesn't match VERSION {version}")
open(os.path.join(root, "app", "vinyl-wall.html"), "w").write(page)
print(f"wrote app/vinyl-wall.html ({len(page) // 1024} KB, version {version})")
