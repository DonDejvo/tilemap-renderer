# Sprite Rendering

Rendering sprites involves drawing a texture—or a region of a texture—at a specific position on the screen. Because sprites depend on image data, a texture must be created before any rendering can take place.

## Texture Sources

A *texture source* can be:

- an external image file  
- another canvas  
- a raw buffer  

Most games load external images, so the library provides convenient image-loading utilities that handle asynchronous loading and texture creation.

## Creating a Tileset

The renderer accepts a map of texture names to texture sources and produces a *tileset*.  
A tileset is a definition of the underlying texture along with the data required to work with it.

Tilesets are explained in more detail later, but for now it is enough to know that they are used to create sprites.

## Static vs Dynamic Sprites

Sprites can be either **static** or **dynamic**:

- **Static sprites** are loaded and prepared once. They are ideal for objects that do not require frequent movement, scaling, or changes in appearance.  
- **Dynamic sprites** are designed for elements that move, transform, or update frequently during rendering.

Choosing between static and dynamic sprites can have performance implications, especially in scenes with many moving elements.

## Z-Index and Drawing Order

Each sprite has a **z-index**, which determines its drawing order.  
Sprites with a higher z-index are rendered after those with lower values, meaning they appear on top. This controls layering, foreground placement, and overall visual hierarchy in the scene.

---

## Sprite Parameters

Sprites are constructed by passing a configuration object (`SpriteParams`) to the constructor. These parameters define the tileset used, initial rendering behavior, and fundamental metadata required for Sprite setup.

### SpriteParams Interface

The parameters include:

```ts
interface SpriteParams {
    tileset: Tileset;
    tilesetRegion?: TilesetRegion; // { x, y, width?: 1, height?: 1 }
    zIndex?: number;               // default: 0
    isStatic?: boolean;            // default: false
}
```

### Behavior and Limitations

- Parameters are applied **only at construction time**.  
  Changing them afterward has **no effect**, except for `tilesetRegion`, which may be updated safely after the sprite has been added to a scene.
- `isStatic` improves GPU performance by preventing buffer updates, but should only be used for sprites that do not move, rotate, or scale.

---

## Sprite Properties

After creation, each sprite exposes several public properties. Most can be modified at runtime unless otherwise noted.

| Property        | Type            | Description |
|-----------------|-----------------|-------------|
| **zIndex**      | number          | Determines rendering order; higher values draw on top. |
| **tileset**     | Tileset         | The texture source used by the sprite. |
| **tilesetRegion** | TilesetRegion | The region of the tileset to render; can be changed at runtime. |
| **isStatic**    | boolean         | Indicates whether the sprite is static (GPU-optimized). |
| **position**    | Vector          | World-space position. |
| **offset**      | Vector          | Rendering offset; often used to define rotation origin. |
| **scale**       | Vector          | Scaling factors on X and Y axes. |
| **angle**       | number          | Sprite rotation in radians. |
| **tintColor**   | Color           | Multiplicative tint applied during rendering. |
| **maskColor**   | Color           | Mask color used depending on scene configuration. |

This section provides a complete overview of the construction parameters and runtime properties available when working with sprites in the Tilemap Renderer.

## Rendering Multiple Sprites

Below is a minimal example demonstrating:

- creating a renderer  
- loading a texture  
- creating sprites with different transformations  
- applying z-index layering  
- rendering a scene  

```js
const { createRenderer, Camera, Scene, Color, Sprite, Tileset, assets } = TilemapRenderer;

const main = async () => {
    const width = 300;
    const height = 400;

    // Load image
    const image = await assets.loadImage("../images/white_square.png");

    // Create renderer
    const renderer = createRenderer("webgl2");
    renderer.setSize(width, height);
    renderer.setClearColor(new Color(0, 0, 0, 1)); // White background

    // Create camera and scene
    const camera = new Camera(width, height);
    const scene = new Scene();

    // Create tileset from loaded image
    const tileset = Tileset.fromImage("WhiteSquare", image);

    const colors = [
        new Color(1, 0, 0), // Red
        new Color(0, 1, 0), // Green
        new Color(0, 0, 1)  // Blue
    ];

    // Create sprites with different transformations
    for (let i = 0; i < 3; ++i) {
        const sprite = new Sprite({
            tileset,
            zIndex: 3 - i // Higher z-index draws on top
        });

        sprite.position.set(100, 50);
        sprite.scale.scale(i + 1);

        // Center rotation origin
        sprite.offset.copy(sprite.scale.clone().scale(-0.5));

        sprite.angle = (i * Math.PI) / 8;
        sprite.tintColor = colors[i];

        scene.addSprite(sprite);
    }

    // Attach canvas to document
    document.body.appendChild(renderer.getCanvas());

    // Add textures (required before init)
    renderer.addTextures([tileset], { WhiteSquare: image });

    // Initialize renderer
    await renderer.init();

    // Render the scene
    renderer.render(scene, camera);
};

main();
```

## Live Demo

The demo below renders several sprites demonstrating sprite properties and layering:

<iframe src="demos/sprite.html" width="100%" height="400" style="border:1px solid #ddd;"></iframe>

<a href="demos/sprite.html" target="_blank">click here to open in separate window</a>