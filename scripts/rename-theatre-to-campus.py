#!/usr/bin/env python3
"""Theatre → Campus pivot: rename cinema/screen/showtime/mall vocabulary to
campus vocabulary across src, prisma, scripts, tests.

Safety design:
- word-boundary regex replacements (no substring hits: fullscreen/screenshot safe)
- emails are masked before replacement and restored after (logins must not change)
- `@media screen` CSS is masked (renaming it would break styles)
- DB column/table names stay untouched: schema.prisma gets @map attributes in a
  follow-up manual pass, so prisma db push must report zero changes from renames
- ordering: longest compound (screenId) before plain (screen); MALL_ADMIN before Mall
"""
import re, pathlib, sys

ROOT = pathlib.Path('/home/z/my-project')
TARGETS = [
    'src', 'prisma/schema.prisma', 'prisma/seed.ts', 'scripts', 'tests',
]
EXTS = {'.ts', '.tsx', '.mjs', '.js', '.sh', '.prisma'}
SKIP_DIRS = {'node_modules', '.next', 'download', 'tool-results', 'upload'}

# ordered: compounds & role literals first, then case variants
RULES = [
    (r'\bMALL_ADMIN\b', 'CAMPUS_ADMIN'),
    (r'\bCINEMA_MANAGER\b', 'BLOCK_MANAGER'),
    (r'\bscreenIds\b', 'classroomIds'),
    (r'\bscreenId\b', 'classroomId'),
    (r'\bshowtimeId\b', 'lectureId'),
    (r'\bshowtimeIds\b', 'lectureIds'),
    (r'\bcinemaId\b', 'blockId'),
    (r'\bcinemaIds\b', 'blockIds'),
    (r'\bmallId\b', 'campusId'),
    (r'\bmallIds\b', 'campusIds'),
    (r'\bmovieTitle\b', 'subject'),
    (r'\bmovieTitles\b', 'subjects'),
    (r'\bshowtimes\b', 'lectures'),
    (r'\bShowtime\b', 'Lecture'),
    (r'\bshowtime\b', 'lecture'),
    (r'\bscreens\b', 'classrooms'),
    (r'\bScreen\b', 'Classroom'),
    (r'\bscreen\b', 'classroom'),
    (r'\bcinemas\b', 'blocks'),
    (r'\bCinema\b', 'Block'),
    (r'\bcinema\b', 'block'),
    (r'\bmalls\b', 'campuses'),
    (r'\bMall\b', 'Campus'),
    (r'\bmall\b', 'campus'),
    # brand language (cookie ss_session intentionally untouched)
    (r'\bSeatServe\b', 'NotiFetch'),
    (r'\bseatserve-api\b', 'notifetch-api'),
]

EMAIL_RE = re.compile(r'[\w.+-]+@[\w.-]+\.\w+')
MEDIA_RE = re.compile(r'@media\s+screen', re.IGNORECASE)

def process(path: pathlib.Path) -> bool:
    text = path.read_text(encoding='utf-8')
    # mask protected tokens with sentinels
    masks = []
    def mask(m):
        masks.append(m.group(0))
        return f'\x00M{len(masks)-1}\x00'
    text = EMAIL_RE.sub(mask, text)
    text = MEDIA_RE.sub(mask, text)
    orig = text
    for pat, rep in RULES:
        text = re.sub(pat, rep, text)
    if text == orig:
        return False
    # restore
    text = re.sub(r'\x00M(\d+)\x00', lambda m: masks[int(m.group(1))], text)
    path.write_text(text, encoding='utf-8')
    return True

changed = []
for t in TARGETS:
    p = ROOT / t
    if p.is_file():
        if process(p): changed.append(t)
        continue
    for path in sorted(p.rglob('*')):
        if path.suffix not in EXTS: continue
        if any(d in path.parts for d in SKIP_DIRS): continue
        if path.name.startswith('rename-theatre'): continue
        if process(path): changed.append(str(path.relative_to(ROOT)))

print(f'{len(changed)} files changed')
for c in changed: print(' ', c)
