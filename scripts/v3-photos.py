"""Owner photos (quiz/brands/aromastylist/photos-src/<question>-<answer>-<her|him|both>.png|jpg) -> theme-files/assets/
sq-photo-<question>-<answer>-<her|him>.webp, square, 600 px, <= 30 KB each. Run: python3 scripts/v3-photos.py"""
import os
from PIL import Image

SRC, OUT, SIZE, MAX = 'quiz/brands/aromastylist/photos-src', 'theme-files/assets', 600, 30000
for name in sorted(os.listdir(SRC)):
    base, ext = os.path.splitext(name)
    if ext.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
        continue
    im = Image.open(f'{SRC}/{name}')
    if im.mode in ('RGBA', 'LA', 'P'):  # a transparent background becomes white, like the other tiles
        im = im.convert('RGBA')
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    im = im.convert('RGB')
    side = min(im.size)  # centre square crop
    left, top = (im.width - side) // 2, (im.height - side) // 2
    im = im.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)
    out = f'{OUT}/sq-photo-{base}.webp'
    for q in range(85, 30, -5):
        im.save(out, 'WEBP', quality=q, method=6)
        if os.path.getsize(out) <= MAX:
            break
    print(out, os.path.getsize(out), 'q', q)
