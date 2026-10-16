"""Erzeugt die App-Icons. Aufruf: python3 tools/make-icons.py (braucht Pillow)."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..')
BG = (28, 77, 92)       # Deep Petrol #1C4D5C
ACCENT = (224, 138, 95)
INK = (28, 77, 92)      # Häkchen in Petrol
S = 2048  # in großer Auflösung zeichnen, dann verkleinern (glatte Kanten)


def draw_house(d, cx, cy, size):
    """Haus mit Dach und Häkchen, zentriert um (cx, cy), Breite ca. size."""
    w = size
    roof_top = cy - size * 0.50
    eave = cy - size * 0.06
    base = cy + size * 0.46
    half = w / 2
    body = w * 0.36
    lw = int(size * 0.075)
    # Dach
    d.line([(cx - half, eave + lw * 0.2), (cx, roof_top), (cx + half, eave + lw * 0.2)],
           fill=ACCENT, width=lw, joint='curve')
    for x, y in [(cx - half, eave + lw * 0.2), (cx + half, eave + lw * 0.2), (cx, roof_top)]:
        d.ellipse([x - lw / 2, y - lw / 2, x + lw / 2, y + lw / 2], fill=ACCENT)
    # Hauskörper
    r = size * 0.06
    d.rounded_rectangle([cx - body, eave - size * 0.02, cx + body, base], radius=r, fill=ACCENT)
    # Häkchen
    cw = int(size * 0.07)
    pts = [(cx - body * 0.48, cy + size * 0.20), (cx - body * 0.08, cy + size * 0.32), (cx + body * 0.55, cy + size * 0.04)]
    d.line(pts, fill=INK, width=cw, joint='curve')
    for x, y in (pts[0], pts[2]):
        d.ellipse([x - cw / 2, y - cw / 2, x + cw / 2, y + cw / 2], fill=INK)


def make(maskable):
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, S, S], fill=BG)
        draw_house(d, S / 2, S / 2 + S * 0.02, S * 0.58)
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=BG)
        draw_house(d, S / 2, S / 2 + S * 0.02, S * 0.66)
    return img


for maskable in (False, True):
    big = make(maskable)
    for size in (192, 512):
        name = 'icon-%s%d.png' % ('maskable-' if maskable else '', size)
        big.resize((size, size), Image.LANCZOS).save(os.path.join(ROOT, name), optimize=True)
        print('geschrieben:', name)
