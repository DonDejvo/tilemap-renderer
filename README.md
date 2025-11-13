# tilemap-renderer
web based tilemap renderer with WebGL, WebGL2 and WebGPU implementation variants

# Tutorial

Load tilesets:

```js
const tileset = new TilemapRenderer.Tileset({
    name: "MyTileset",
    imageWidth: 64,
    imageHeight: 64,
    tilesPerRow: 2,
    totalTiles: 4,
    tileSize: 32
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
    tilesetName: "MyTileset",
    tilesetIdx: 0,
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

await renderer.init([
    { tileset, image: tilesetImage }
]);

renderer.setSize(width, height);
renderer.setClearColor(new TilemapRenderer.Color(r, g, b, a));

// Place its canvas into DOM
document.body.appendChild(renderer.getCanvas());

// Render
renderer.render(scene, camera);
```
