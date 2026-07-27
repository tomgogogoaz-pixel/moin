# Material image sources

All catalog source images were downloaded from Wikimedia Commons and converted locally to WebP (metadata removed, cropped to 900x720). The app serves the local WebP files and does not hotlink the originals. `scripts/process_materials.py` records the reproducible crop and composition steps.

- `wallpaper.webp` - [Wallpaper roll (AM 2017.2.1-7)](https://commons.wikimedia.org/wiki/File:Wallpaper_roll_(AM_2017.2.1-7).jpg), CC BY 4.0, attribution: Auckland Museum. The roll was cropped and placed on a neutral product-card background.
- `flooring.webp` - [Wooden floor.jpg](https://commons.wikimedia.org/wiki/File:Wooden_floor.jpg), public domain; author Titus Tscharntke.
- `tile.webp` - [Ceramic Tile.jpg](https://commons.wikimedia.org/wiki/File:Ceramic_Tile.jpg), CC0 1.0. The unobstructed material texture was cropped and arranged as a four-tile sample.
- `paint.webp`, `tools.webp` - [Paint bucket and brush.jpg](https://commons.wikimedia.org/wiki/File:Paint_bucket_and_brush.jpg), CC0 1.0; author Ionenlaser. Separate crops emphasize the paint container and hand tool.

Generated project visuals (`public/assets/generated/*.webp`) were created for this Moin prototype from the supplied wireframe composition and contain no embedded UI text.
