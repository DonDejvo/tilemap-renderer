# Lighting

Throughout the library, we have been working with **lighted scenes**, and now we will explain how lighting works in detail. The library currently supports **three types of lights**: ambient, point, and spot lights.

Each light has a **color** and **intensity**, and the final effect on a pixel is computed as:

`pixelColor = lightColor * lightIntensity * pixelColor`

- **Ambient Light**: A uniform light that affects all pixels equally, providing base illumination across the entire scene.  

- **Point Light**: A localized light with a **position** and **radius**. Its intensity decreases with distance from the light's center, creating natural falloff effects.  

- **Spot Light**: A specialized point light that adds a **direction** and **cutoff angle**, allowing the light to illuminate only a specific cone-shaped area.  

Because point and spot lights share many properties, they are both represented by a single **Light class** in the library.

## Shadows

Shadows are generated using **colliders**. By default, colliders cast shadows, though this behavior can be disabled for individual colliders if needed. To see shadows in action, simply add some colliders to your scene.

Since this is the first mention of colliders, it’s worth noting that the scene uses a **spatial hash grid** to optimize frequent collider queries. You can adjust the **hash grid dimensions** and **bounds** through scene parameters to fine-tune performance for your specific game.

## Adding Lights to a Tilemap Scene

Following up on the previous **Tilemaps tutorial demo**, we will now add lighting to the scene:

1. **Lower the ambient light intensity** to make other lights more visible.

```ts
scene.ambientIntensity = 0.25;
```

2. **Create lights and colliders from the tilemap object layer**. The tilemap now stores positions for lights and colliders, allowing you to automatically populate the scene.

### Object Layer Handling

Here is an example of handling objects from the tilemap’s object layer:

```ts
const onObject = (obj, x, y, width, height, zIndex, tilemap, layer) => {
    switch(obj.name) {
        case "torch_light": {
            const light = new Light({
                radius: 120
            });
            light.position.set(x, y);
            scene.addNode(light);
            break;
        }
        case "lava_light": {
            const light = new Light({
                radius: 160,
                color: new Color(1.0, 0.85, 0.55)
            });
            light.position.set(x, y);
            scene.addNode(light);
            break;
        }
        case "collider":{
            const box = new colliders.BoxCollider({
                width,
                height,
                castShadow: true
            });
            box.position.set(x, y);
            scene.addNode(box);
            break;
        }
    }
}
```

## Renderer Pipeline

The renderer provides a configurable **post-processing pipeline** via `renderer.pipeline`.  
This pipeline defines how intermediate textures are processed and combined before the final image is rendered to the canvas.

Each pipeline step specifies:
- A **shader** to run
- One or more **input textures**
- A single **output texture**

The steps are executed in order, making it easy to build multi-pass effects such as lighting, blurring, and compositing.

---

### Texture Slots

The pipeline works with fixed texture slots that represent different resolutions:

- **`-1`** — the **canvas texture** (final output)
- **`0–3`** — **full-resolution offscreen textures**
- **`4–5`** — **half-resolution textures**
- **`6–7`** — **quarter-resolution textures**
- Additional slots continue with progressively lower resolutions

Using lower-resolution textures for expensive effects (such as blur) greatly improves performance while maintaining visual quality.

---

### Available Shaders

- **default**  
  A basic pass-through shader, primarily used internally or for simple texture copies.

- **light**  
  Combines a scene texture with a lightmap texture to produce the final lit image.  
  This shader always expects **two inputs**: the scene and the lightmap.

- **blurX**  
  Applies a horizontal blur. Commonly used as the first step in soft shadow or glow effects.

- **blurY**  
  Applies a vertical blur. Used together with `blurX` to form a separable blur.

---

## Sharp and Smooth Shadows

### Sharp Shadows

Sharp shadows are achieved by using the lightmap directly when combining it with the scene.  
Because no blur is applied, shadow edges remain crisp and well-defined.

This approach is best suited for:
- Pixel-art or low-resolution visuals
- Stylized lighting
- Situations where performance is critical

---

### Smooth Shadows

Smooth shadows are created by blurring the lightmap before it is combined with the scene.  
The blur is typically performed at **half resolution**, which produces soft shadow edges while keeping the cost low.

A common approach is:
1. Blur the lightmap horizontally
2. Blur the result vertically
3. Use the blurred lightmap for lighting

This technique results in:
- Soft, natural-looking shadows
- Better visual depth
- Efficient performance compared to full-resolution blur

#### Example: Smooth Shadow Pipeline

```ts
renderer.pipeline = [
    { shader: "blurX", inputs: [TEXID_LIGHTMAP], output: 4 },
    { shader: "blurY", inputs: [4], output: 5 },
    { shader: "light", inputs: [TEXID_SCENE, 5], output: -1 }
];

```

---


## Live Demo

The demo below renders the scene created from the tilemap with dynamic lighting:

<iframe src="demos/lighting.html" width="100%" height="400" style="border:1px solid #ddd;"></iframe>

<a href="demos/lighting.html" target="_blank">click here to open in separate window</a>