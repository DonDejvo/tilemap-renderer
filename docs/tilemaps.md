# Tilemaps

Finally, we are getting to the core concept of this library: **tilemaps**. The library is designed to integrate seamlessly with the **Tiled editor** mentioned earlier, allowing you to create tilemaps in Tiled and load them directly from JSON files.

So far, we have been creating tilesets manually, but they can also be loaded from JSON files. This approach is preferred, as it makes handling **animations** much easier using the Tiled editor GUI. When loading a tilemap, you pass pairs of **tileset name → URL path** for all tilesets used in the map, and they are loaded automatically.

A **tilemap** is composed of multiple layers. There are two types of layers:

- **Tile layers**: Grids of tiles referencing tilesets. These form the visible structure of the level.  
- **Object group layers**: Collections of points or rectangles placed at specific positions. Objects themselves have no inherent meaning—they must be interpreted in your game, for example as enemies, pickups, or triggers.

### Scene Add Tilemap Configuration

When adding a tilemap to a scene, you can pass a configuration object:

```ts
interface SceneAddTilemapConfig {
    layers?: {
        name: string;
        zIndex?: number;
    }[];
    tileWidth?: number;
    tileHeight?: number;
    onObject?: (obj: TilemapObject, x: number, y: number, w: number, h: number, zIndex: number, scene: Scene, layer: ObjectLayer) => void;
}
```

This configuration allows you to define:

- Optional **layers** and their z-index  
- **Tile width and height**  
- Callback **onObject** for handling object layers  

### Creating Tilemap

In the example below:

- Load a **tileset image** for the environment.  
- Load a **tilemap** file describing the level layout.  
- Create a **renderer, camera, and scene**.  
- Configure **tile size** and an empty `onObject` callback.  
- Add the tilemap to the scene, add textures to the renderer, and initialize it.  
- Run a **render loop** to update animated tiles and render the scene.

```ts
const { createRenderer, Camera, Scene, Color, Sprite, Tileset, Animator, Tilemap, Vector, assets } = TilemapRenderer;

const main = async () => {
    const width = 300;
    const height = 400;

    const environmentImage = await assets.loadImage("../images/environment.png");
    
    const tilemap = await Tilemap.load("../level_0.tmj", {
        ["environment"]: "../environment.tsj"
    });

    // Create renderer
    const renderer = createRenderer("webgl2");
    renderer.setClearColor(new Color(0, 0, 0, 1));

    // Create camera and scene
    const camera = new Camera(0, 0);
    const scene = new Scene();

    // Set initial size
    renderer.setSize(width, height);
    camera.vw = width;
    camera.vh = height;

    const tileSize = 32;

    const onObject = (obj, x, y, w, h, zIndex, tilemap, layer) => {
        switch(obj.name) {
            // Create sprites from the objects and add them into the scene
        }
    };

    const { sprites, animators } = scene.addTilemap(tilemap, {
        tileWidth: tileSize,
        tileHeight: tileSize,
        onObject
    });

    const canvas = renderer.getCanvas();
    document.body.appendChild(canvas);

    // Add textures (must be done before calling init!)
    renderer.addTextures(tilemap.getTilesets(), { ["environment"]: environmentImage });

    // Initialize renderer
    await renderer.init();

    let dt = 0;
    let prevTime = 0;

    const loop = () => {
        requestAnimationFrame(t => {
            loop();

            t *= 0.001;
            dt = t - (prevTime || t);
            prevTime = t;

            // Update animated tiles
            for (let animator of animators) {
                animator.update(dt);
            }

            renderer.render(scene, camera);
        });
    };

    loop();
};

main();
```

## Live Demo

The demo below renders the scene created from the tilemap:

<iframe src="demos/tilemap.html" width="100%" height="400" style="border:1px solid #ddd;"></iframe>

<a href="demos/tilemap.html" target="_blank">click here to open in separate window</a>