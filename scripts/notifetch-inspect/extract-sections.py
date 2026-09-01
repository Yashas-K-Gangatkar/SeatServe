#!/usr/bin/env python3
"""Extract the live NotiFetch landing markup into per-section HTML files for JSX reconstruction."""
import re, os, html as H

RAW = open('/home/z/my-project/scripts/notifetch-inspect/live.html').read()
OUT = '/home/z/my-project/scripts/notifetch-inspect/sections'
os.makedirs(OUT, exist_ok=True)

body = RAW.split('<body', 1)[1]
body = body[body.index('>') + 1:]
# strip all <script> blocks
body = re.sub(r'<script\b.*?</script>', '', body, flags=re.S)

def find_balanced(s, start):
    """Return the balanced tag block starting at <tag ...> position `start`."""
    m = re.match(r'<([a-zA-Z0-9]+)\b', s[start:])
    tag = m.group(1)
    i = start
    depth = 0
    while i < len(s):
        mt = re.compile(r'<(/?)' + tag + r'\b[^>]*?(/?)>').search(s, i)
        if not mt:
            return s[start:]
        if mt.group(2) == '/':  # self-closing
            if depth == 0:
                return s[start:mt.end()]
        elif mt.group(1) == '/':
            depth -= 1
            if depth == 0:
                return s[start:mt.end()]
        else:
            depth += 1
        i = mt.end()
    return s[start:]

# Landmarks: header, main sections, footer
header = find_balanced(body, body.index('<header'))
footer = find_balanced(body, body.index('<footer'))
open(f'{OUT}/00-header.html', 'w').write(header)
open(f'{OUT}/99-footer.html', 'w').write(footer)

# sections inside main
positions = [m.start() for m in re.finditer(r'<section\b', body)]
names = ['01-hero', '02-notif', '03-how', '04-why', '05-cta', '06-menus', '07-stats', '08-testimonials', '09-faq', '10-extra']
for idx, pos in enumerate(positions):
    block = find_balanced(body, pos)
    name = names[idx] if idx < len(names) else f'{idx+1:02d}-sec'
    open(f'{OUT}/{name}.html', 'w').write(block)
    print(f'{name}: {len(block)} bytes')

# global class+style summary for header/hero
hero = open(f'{OUT}/01-hero.html').read()
print('\n--- hero sample (first 3000 chars) ---')
print(H.unescape(hero[:3000]))
