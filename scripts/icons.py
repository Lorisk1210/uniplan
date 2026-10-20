"""Draws the Uniplan app icons from the logo (two course blocks on a dark tile).

Writes the desktop icon (apps/desktop/build/icon.png) and replaces every launcher icon and
splash image in the Android and iOS projects, keeping each file's size.
Needs Pillow: python3 -m pip install pillow
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
INK = (28, 27, 25, 255)
BLUE = (168, 197, 255, 255)
ORANGE = (246, 196, 143, 255)
LIGHT_BG = (248, 247, 244, 255)
DARK_BG = (17, 17, 16, 255)
SS = 4  # supersampling for smooth edges


def blocks(draw, x, y, unit):
    """The two blocks of the 32-unit logo grid, with the grid's origin at (x, y)."""
    r = 2 * unit
    draw.rounded_rectangle((x + 7 * unit, y + 8 * unit, x + 15 * unit, y + 17 * unit), r, fill=BLUE)
    draw.rounded_rectangle((x + 17 * unit, y + 12 * unit, x + 25 * unit, y + 24 * unit), r, fill=ORANGE)


def canvas(size, bg=(0, 0, 0, 0)):
    img = Image.new('RGBA', (size * SS, size * SS), bg)
    return img, ImageDraw.Draw(img)


def done(img, size):
    return img.resize((size, size), Image.LANCZOS)


def desktop_icon():
    """macOS-style: a rounded tile with margin and a soft shadow, on transparency."""
    size, tile, off = 1024, 824, 100
    img, d = canvas(size)
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        ((off) * SS, (off + 12) * SS, (off + tile) * SS, (off + tile + 12) * SS), 185 * SS, fill=(0, 0, 0, 90))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(18 * SS)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((off * SS, off * SS, (off + tile) * SS, (off + tile) * SS), 185 * SS, fill=INK)
    blocks(d, off * SS, off * SS, tile / 32 * SS)
    return done(img, size)


def full_bleed_icon():
    """iOS / Android legacy: square, opaque; the OS rounds the corners."""
    size = 1024
    img, d = canvas(size, INK)
    blocks(d, 0, 0, size / 32 * SS)
    return done(img, size).convert('RGB')


def adaptive_foreground():
    """Android adaptive icon foreground: logo kept inside the central safe zone."""
    size = 1024
    img, d = canvas(size)
    grid = size * 0.62
    o = (size - grid) / 2
    blocks(d, o * SS, o * SS, grid / 32 * SS)
    return done(img, size)


def splash(width, height, bg=LIGHT_BG):
    """Logo tile centred on the app background."""
    logo = round(min(width, height) * 0.22)
    img = Image.new('RGBA', (width * SS, height * SS), bg)
    d = ImageDraw.Draw(img)
    x, y = (width - logo) / 2, (height - logo) / 2
    d.rounded_rectangle((x * SS, y * SS, (x + logo) * SS, (y + logo) * SS), logo * 0.25 * SS, fill=INK)
    blocks(d, x * SS, y * SS, logo / 32 * SS)
    return img.resize((width, height), Image.LANCZOS).convert('RGB')


def masked(img, shape):
    """Cuts the full-bleed icon into a rounded square or a circle (legacy Android launchers)."""
    size = img.size[0]
    mask = Image.new('L', (size * SS, size * SS), 0)
    d = ImageDraw.Draw(mask)
    if shape == 'circle':
        d.ellipse((0, 0, size * SS - 1, size * SS - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, size * SS - 1, size * SS - 1), size * 0.22 * SS, fill=255)
    out = img.convert('RGBA')
    out.putalpha(mask.resize((size, size), Image.LANCZOS))
    return out


def native(mobile):
    android = mobile / 'android/app/src/main/res'
    ios = mobile / 'ios/App/App/Assets.xcassets'
    full = full_bleed_icon()
    fg = adaptive_foreground()
    for f in android.glob('mipmap-*/*.png'):
        size = Image.open(f).size[0]
        if f.name == 'ic_launcher_foreground.png':
            fg.resize((size, size), Image.LANCZOS).save(f)
        else:
            masked(full.resize((size, size), Image.LANCZOS), 'circle' if 'round' in f.name else 'square').save(f)
    for f in android.glob('drawable*/splash.png'):
        splash(*Image.open(f).size).save(f)
    bg = android / 'values/ic_launcher_background.xml'
    bg.write_text(bg.read_text().replace('#FFFFFF', '#1C1B19'))
    for f in ios.glob('AppIcon.appiconset/*.png'):
        size = Image.open(f).size[0]
        full.resize((size, size), Image.LANCZOS).save(f)
    for f in ios.glob('Splash.imageset/*.png'):
        splash(*Image.open(f).size).save(f)


if __name__ == '__main__':
    desktop = ROOT / 'apps/desktop/build'
    desktop.mkdir(parents=True, exist_ok=True)
    desktop_icon().save(desktop / 'icon.png')
    native(ROOT / 'apps/mobile')
    print('icons written')
