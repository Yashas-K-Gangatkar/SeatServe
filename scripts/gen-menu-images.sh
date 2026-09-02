#!/bin/bash
# Generate AI food photography for all prod menu items -> public/menu/*.jpg
OUT=/home/z/my-project/scripts/tmp-png
FINAL=/home/z/my-project/public/menu
mkdir -p "$OUT" "$FINAL"
STYLE="professional food photography, warm appetizing lighting, dark rustic wooden table, shallow depth of field, 45-degree close-up, high quality, detailed, no text, no watermark, no hands"

gen() { # slug, subject
  if [ -s "$OUT/$1.png" ]; then echo "SKIP $1 (generated)"; return; fi
  z-ai image -p "$2, $STYLE" -o "$OUT/$1.png" -s 1024x1024 >/dev/null 2>&1 \
    && echo "OK $1" || echo "FAIL $1"
}

gen cold-coffee "iced cold coffee in a tall glass topped with whipped cream, coffee beans scattered beside"
gen masala-chai "Indian masala chai in a traditional clay kulhad cup with rising steam, ginger and cardamom pods beside"
gen popcorn-butter "large red-striped bucket overflowing with golden butter popcorn, melted butter glisten"
gen popcorn-salted "large red-striped cinema bucket of classic salted popcorn, fluffy white and golden"
gen nachos-cheese "crunchy nacho chips loaded with melted cheese sauce, jalapeno slices and salsa in a paper tray"
gen samosa "two golden fried samosas on a plate with green mint chutney and tamarind sauce"
gen filter-coffee "South Indian filter coffee in steel tumbler and davara with frothy foam, chicory coffee"
gen gulab-jamun "two dark gulab jamun soaked in sugar syrup in a small glass bowl, pistachio garnish"
gen kaju-katli "diamond-shaped kaju katli cashew fudge sweets with edible silver leaf, pistachio garnish, arranged in a row"
gen rasmalai "two soft rasmalai cheese discs in creamy saffron milk syrup with pistachio slivers"
gen pizza-farmhouse "farmhouse pizza topped with capsicum onion tomato mushroom, one slice lifted with cheese pull"
gen pizza-margherita "classic margherita pizza with melted mozzarella and fresh basil leaves, wood-fired crust"
gen pizza-paneer-tikka "paneer tikka pizza with charred tandoori paneer cubes, red onion and capsicum"
gen garlic-bread "cheesy garlic bread sticks with melted mozzarella stretch and oregano herbs"
gen peri-peri-fries "crispy peri peri french fries dusted with red spice, served in a paper cone"
gen momo "eight steamed Himalayan chicken momo dumplings on a plate with spicy red chutney, steam rising"
gen wrap-chicken-seekh "grilled chicken seekh kebab wrap in a soft tortilla with pickled onions, cut in half showing juicy filling"
gen wrap-paneer-tikka "tandoori paneer tikka wrap with mint chutney and crunchy onions, cut in half showing filling"
gen wrap-veg-burrito "loaded veg burrito with mexican rice, black beans and peppers, cut in half showing colorful filling"

echo "ALL PNGs DONE — converting to JPG…"
python3 - << 'PYEOF'
import os
from PIL import Image
src = '/home/z/my-project/scripts/tmp-png'
dst = '/home/z/my-project/public/menu'
os.makedirs(dst, exist_ok=True)
count = 0
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'):
        continue
    out = os.path.join(dst, f[:-4] + '.jpg')
    if os.path.exists(out):
        continue
    im = Image.open(os.path.join(src, f)).convert('RGB')
    im.save(out, 'JPEG', quality=82, optimize=True)
    count += 1
    print('JPG:', f[:-4], os.path.getsize(out) // 1024, 'KB')
print('converted', count)
PYEOF
echo "ALL DONE"
