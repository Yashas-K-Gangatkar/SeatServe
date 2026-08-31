# Side-by-side proof: OLD frozen deployment (before) vs NEW build (after), mobile full-page
from PIL import Image

before = Image.open('/home/z/my-project/download/before-mobile-landing-full.png')
after = Image.open('/home/z/my-project/download/after-mobile-landing-full.png')

H = 3600
def scaled(im):
    w = int(im.width * H / im.height)
    return im.resize((w, H), Image.LANCZOS)

b, a = scaled(before), scaled(after)
gap = 24
canvas = Image.new('RGB', (b.width + a.width + gap * 3, H + gap * 2), '#E7E0D2')
canvas.paste(b, (gap, gap))
canvas.paste(a, (b.width + gap * 2, gap))
out = '/home/z/my-project/download/proof-final-before-vs-after-mobile.png'
canvas.save(out, optimize=True)
print('saved', out, canvas.size)
