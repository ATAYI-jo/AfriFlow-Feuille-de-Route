"""Create native app icons from AfriFloW's original logo with safe margins.

The source logo remains unchanged. The original fills much of its canvas;
Android launchers and desktop docks can mask/crop its edges. We place the
complete original inside a padded square to preserve the wordmark.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "logo.png"
if not source.is_file():
    raise FileNotFoundError(f"AfriFloW source logo missing: {source}")

logo = Image.open(source).convert("RGBA")
# The logo must remain fully visible inside the launcher mask. We deliberately
# use an opaque white background and reserve ~21% padding on each edge.
MASTER_SIZE = 1024
SAFE_ARTWORK_FRACTION = 0.58
artwork_side = round(MASTER_SIZE * SAFE_ARTWORK_FRACTION)
logo.thumbnail((artwork_side, artwork_side), Image.Resampling.LANCZOS)
canvas = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (255, 255, 255, 255))
canvas.alpha_composite(
    logo,
    ((MASTER_SIZE - logo.width) // 2, (MASTER_SIZE - logo.height) // 2),
)

windows = ROOT / "desktop" / "assets"
windows.mkdir(parents=True, exist_ok=True)
ico_sizes = [16, 24, 32, 48, 64, 128, 256]
canvas.resize((256, 256), Image.Resampling.LANCZOS).save(windows / "icon.png")
canvas.save(windows / "icon.ico", format="ICO", sizes=[(n, n) for n in ico_sizes])

densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for density, pixels in densities.items():
    folder = ROOT / "android" / "app" / "src" / "main" / "res" / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    canvas.resize((pixels, pixels), Image.Resampling.LANCZOS).save(folder / "ic_launcher.png")

print("AfriFloW logo icons regenerated with protective launcher margins.")
