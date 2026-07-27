"""Build the local WebP catalog images from the documented source photos."""

from pathlib import Path

from PIL import Image, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp" / "materials"
OUTPUT = ROOT / "public" / "assets" / "materials"
SIZE = (900, 720)


def save(image: Image.Image, name: str) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(
        OUTPUT / name,
        "WEBP",
        quality=84,
        method=6,
        exif=b"",
    )


def build_wallpaper() -> Image.Image:
    source = Image.open(SOURCE / "wallpaper.jpg").convert("RGB")
    roll = source.crop((120, 245, 1160, 430))
    roll.thumbnail((820, 210), Image.Resampling.LANCZOS)

    canvas = Image.new("RGB", SIZE, "#f3f2ef")
    shadow = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    shadow_roll = Image.new("RGBA", roll.size, (25, 32, 31, 80))
    shadow_roll = shadow_roll.filter(ImageFilter.GaussianBlur(16))
    x = (SIZE[0] - roll.width) // 2
    y = (SIZE[1] - roll.height) // 2
    shadow.alpha_composite(shadow_roll, (x + 10, y + 20))
    canvas.paste(shadow, mask=shadow.getchannel("A"))
    canvas.paste(roll, (x, y))
    return canvas


def build_tile() -> Image.Image:
    source = Image.open(SOURCE / "tile.jpg").convert("RGB")
    texture = source.crop((285, 385, 705, 775))
    tile_size = (438, 348)
    panels = [
        ImageOps.fit(texture, tile_size, Image.Resampling.LANCZOS),
        ImageOps.fit(ImageOps.mirror(texture), tile_size, Image.Resampling.LANCZOS),
        ImageOps.fit(ImageOps.flip(texture), tile_size, Image.Resampling.LANCZOS),
        ImageOps.fit(ImageOps.mirror(ImageOps.flip(texture)), tile_size, Image.Resampling.LANCZOS),
    ]
    canvas = Image.new("RGB", SIZE, "#d2d3d0")
    positions = ((8, 8), (454, 8), (8, 364), (454, 364))
    for panel, position in zip(panels, positions, strict=True):
        canvas.paste(panel, position)
    return canvas


def main() -> None:
    flooring = ImageOps.fit(
        Image.open(SOURCE / "flooring-new.jpg").convert("RGB"),
        SIZE,
        Image.Resampling.LANCZOS,
    )
    paint = ImageOps.fit(
        Image.open(SOURCE / "paint-new.jpg").convert("RGB"),
        SIZE,
        Image.Resampling.LANCZOS,
        centering=(0.5, 0.48),
    )
    tools = ImageOps.fit(
        Image.open(SOURCE / "paint-new.jpg").convert("RGB"),
        SIZE,
        Image.Resampling.LANCZOS,
        centering=(0.36, 0.30),
    )

    save(build_wallpaper(), "wallpaper.webp")
    save(flooring, "flooring.webp")
    save(build_tile(), "tile.webp")
    save(paint, "paint.webp")
    save(tools, "tools.webp")


if __name__ == "__main__":
    main()
