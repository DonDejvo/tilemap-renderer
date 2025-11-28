# Tilesets

Using a separate texture for every sprite is inefficient. Each texture switch on the GPU introduces overhead, and doing this repeatedly reduces rendering performance. To avoid this, sprites are grouped into **tilesets** — large images containing many smaller tiles arranged in a uniform grid.

A tileset contains multiple tiles of identical size placed into rows and columns. Since image dimensions are limited, it is generally best to keep the number of rows and columns balanced. If you have individual sprite images, you can use any sprite-packing tool to generate a tileset (also called a spritesheet).

Once you have a tileset image, you must provide its metadata to the renderer.  
There are **two supported methods**:

1. **Load a JSON file** that defines the tileset structure.  
2. **Pass a `TilesetJSON` object directly into the tileset constructor.**

```ts
interface TilesetJSON {
    name: string;                 // Name of the tileset
    imagewidth: number;           // Full width of the tileset image in pixels
    imageheight: number;          // Full height of the tileset image in pixels
    tilewidth: number;            // Width of a single tile in pixels
    tileheight: number;           // Height of a single tile in pixels
    columns: number;              // Number of columns in the tileset grid
    tilecount: number;            // Total number of tiles in the tileset
    tiles?: TileDataJSON[];       // Optional array of tile-specific metadata (properties or animations)
    margin?: number;              // Optional spacing between the tileset edge and the first tile
    spacing?: number;             // Optional spacing between individual tiles
}
```

---

## Compatibility With Tiled

The JSON structure used by this library is intentionally designed to be **compatible with the popular tileset and tilemap editor Tiled**.  
Tiled is a free, widely-used tool for designing 2D game maps and tilesets.

Official website:  
https://www.mapeditor.org/

Thanks to this compatibility, you can create and edit tilesets directly in Tiled and then export JSON files for use in the renderer without modification.

---

## Accessing Tile Information

The Tileset class provides methods for retrieving information about individual tiles.  
Tiles can be accessed either by:

- **Tile ID** (starting from 0), or  
- **Grid coordinates** (`x`, `y`)

Each tile may define **custom properties** and may also define animations consisting of multiple frames.  
Animation support is covered in the animations section.

## Using a Tileset and Selecting a Tile Region

Here is the tileset image used in this example:

![Player Tileset](/images/player.png)

Before rendering, a tileset must be created to describe how individual tiles are arranged inside the source image.  
In this example, the tileset defines a 5×2 grid of 16×16 tiles inside an 80×32 image.

A sprite can then reference a **specific tile** within this grid using `tilesetRegion`, which selects the tile by its `(x, y)` position in the tileset’s coordinate system.  
In the snippet below, `tilesetRegion: { x: 1, y: 1 }` selects the tile at second column, second row.

```ts
const { createRenderer, Camera, Scene, Color, Sprite, Tileset, assets } = TilemapRenderer;

const main = async () => {
    const w = 300;
    const h = 150;

    const playerImage = await assets.loadImage("../images/player.png");

    // Create renderer
    const renderer = createRenderer("webgl2");
    renderer.setSize(w, h);
    renderer.setClearColor(new Color(1, 1, 1, 1)); // White background

    // Create camera and scene
    const camera = new Camera(w, h);
    const scene = new Scene();

    // Create tileset
    const tileset = new Tileset({
        name: "Player",
        imagewidth: 80,
        imageheight: 32,
        columns: 5,
        tilecount: 10,
        tilewidth: 16,
        tileheight: 16
    });

    // Create sprite using a specific tile from the tileset
    const sprite = new Sprite({
        tileset,
        tilesetRegion: { x: 1, y: 1 }
    });
    sprite.position.set(50, 50);
    sprite.scale.scale(2);
    scene.addSprite(sprite);

    // Add canvas to document
    const canvas = renderer.getCanvas();
    document.body.appendChild(canvas);

    // Add textures to the renderer
    renderer.addTextures([tileset], { ["Player"]: playerImage });

    // Initialize and render
    await renderer.init();
    renderer.render(scene, camera);
};

main();
```

## Live Demo

The demo below renders a sprite from a tileset:

<iframe src="demos/tileset.html" width="300" height="150" style="border:1px solid #ddd;"></iframe>

<a href="demos/tileset.html" target="_blank">click here to open in separate window</a>