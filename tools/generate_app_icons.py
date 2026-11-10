"""Generate platform-native AfriFloW icons from the repository's existing logo.png.

Run from the repository root: python tools/generate_app_icons.py
Requires Pillow. Never modifies the original logo.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "logo.png"
if not source.is_file():
    raise FileNotFoundError(f"AfriFloW source logo missing: {source}")
logo = Image.open(source).convert("RGBA")
if logo.width != logo.height:
    # Preserve the entire logo if it isn't square, rather than cropping.
    side = max(logo.size)
    background = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    background.alpha_composite(logo, ((side - logo.width) // 2, (side - logo.height) // 2))
    logo = background

windows = ROOT / "desktop" / "assets"
windows.mkdir(parents=True, exist_ok=True)
ico_sizes = [16, 24, 32, 48, 64, 128, 256]
logo.resize((256, 256), Image.Resampling.LANCZOS).save(windows / "icon.png")
logo.save(windows / "icon.ico", format="ICO", sizes=[(n, n) for n in ico_sizes])

densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for density, pixels in densities.items():
    folder = ROOT / "android" / "app" / "src" / "main" / "res" / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    logo.resize((pixels, pixels), Image.Resampling.LANCZOS).save(folder / "ic_launcher.png")

print("Generated Windows .ico/.png and Android mipmap icons using AfriFloW logo.png")
