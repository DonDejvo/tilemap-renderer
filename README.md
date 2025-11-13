# tilemap-renderer
web based tilemap renderer with WebGL, WebGL2 and WebGPU implementation variants

# Tutorial

Load tilesets:

```js
const tileset = new TilemapRenderer.Tileset({
    name: "MyTileset",
    imagewidth: 64,
    imageheight: 64,
    columns: 2,
    tilecount: 4,
    tilewidth: 32,
    tileheight: 32
});

const tilesetImage = await TilemapRenderer.assets.loadImage("url_path_to_image");
```

Create camera:

```js
const camera = new TilemapRenderer.Camera(viewportWidth, viewportHeight);
```

You can later update projection:

```js
camera.updateProjection(viewportWidth, viewportHeight);
```

Create scene:

```js
const scene = new TilemapRenderer.Scene();

const sprite = new TilemapRenderer.Sprite({
    tileset,
    tilesetRegion: { x: 0, y: 0 },
    /* optional */
    // zIndex: 0,
    // isStatic: false
});

// Coordinates start from left bottom corner
sprite.position.set(16, 8);

sprite.scale.set(32, 32);

scene.addSprite(s);
```

Finally create renderer:

```js
const renderer = TilemapRenderer.createRenderer(type /* webgl | webgl2 | webgpu */);

renderer.addTextures([tileset], { ["MyTileset"]: tilesetImage });

await renderer.init();

renderer.setSize(width, height);
renderer.setClearColor(new TilemapRenderer.Color(r, g, b, a));

// Place its canvas into DOM
document.body.appendChild(renderer.getCanvas());

// Render
camera.update();
renderer.render(scene, camera);
```
