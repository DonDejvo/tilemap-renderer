# Quick Start

This guide shows how to quickly set up a minimal scene using **TilemapRenderer**, a 2D web rendering library.  
The library provides both **UMD** and **ES module** builds, so you can choose the one that fits your project.

---

## Using the UMD Build

You can include TilemapRenderer via a **CDN script**. Specify a **version** to ensure stability, for example `@1.5.0`, or use `@latest` to always get the newest release.  

```html
<!-- UMD build from CDN -->
<script src="https://cdn.jsdelivr.net/gh/dondejvo/tilemap-renderer@1.6.1/build/tilemap-renderer.min.js"></script>
<script>
    const { createRenderer, Camera, Scene, Color } = TilemapRenderer;

    const main = async () => {
        let w = 300, h = 150;

        // Create renderer
        const renderer = createRenderer("webgpu");
        renderer.setSize(w, h);
        renderer.setClearColor(new Color(0, 0, 1, 1)); // blue background
        document.body.appendChild(renderer.getCanvas());

        // Create camera and scene
        const camera = new Camera(w, h);
        const scene = new Scene();

        // Initialize renderer
        await renderer.init();

        // Render the scene
        renderer.render(scene, camera);
    }

    main();
</script>
```

## Using the ES Module Build

For modern projects with bundlers like Vite, you can import TilemapRenderer as an ES module:

```html
<script type="module">
    import { createRenderer, Camera, Scene, Color } from "https://cdn.jsdelivr.net/gh/dondejvo/tilemap-renderer@1.6.1/build/tilemap-renderer.module.min.js";
    // The rest of the code is the same as the UMD example above.
</script>
```

---

You can see a working live demo below. The demo renders an empty scene with a blue background:

<iframe src="demos/intro.html" width="300" height="150" style="border:1px solid #ddd;"></iframe>

<a href="demos/intro.html" target="_blank">click here to open in separate window</a>