# Tilemap Renderer

**Tilemap Renderer** is a high-performance, modular, and easy-to-use 2D rendering engine for JavaScript.  
It supports WebGL, WebGL2, and WebGPU, offering one of the fastest and most flexible sprite rendering pipelines available for modern web applications.

---

## Documentation

Full documentation, guides, and examples:

**https://dondejvo.github.io/tilemap-renderer**

All setup instructions and API details are available there.

---

## Features

- Fast tilemap and sprite rendering  
- Modular architecture — use only what you need  
- Color, blending, and shader support  
- Camera system with transforms  
- Texture atlases and tilesets  
- Vector shape rendering  
- Post-processing pipeline  
- Lighting system  
- Supports WebGL, WebGL2, and WebGPU  

---

## Installation

### CDN (UMD)
```html
<script src="https://cdn.jsdelivr.net/gh/dondejvo/tilemap-renderer@latest/build/tilemap-renderer.min.js"></script>
```

---

### ES Modules
```js
import { createRenderer } from "https://cdn.jsdelivr.net/gh/dondejvo/tilemap-renderer@latest/build/tilemap-renderer.module.min.js";
```

---

## Quick Example
```js
const { createRenderer, Scene, Camera, Color } = TilemapRenderer;

const renderer = createRenderer("webgl2");
renderer.setSize(360, 480);
renderer.setClearColor(new Color(0, 0, 1, 1)); // blue background

document.body.appendChild(renderer.getCanvas());

const camera = new Camera(360, 480);
const scene = new Scene();

renderer.render(scene, camera);
```

## Contributing

Contributions, bug reports, and suggestions are welcome.  
Feel free to open an issue or submit a pull request.

---

## License

MIT License © 2025 dondejvo


