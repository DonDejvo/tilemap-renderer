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
const onObject = (obj, x, y, w, h, zIndex, tilemap, layer) => {
    switch(obj.name) {
        case "torch_light": {
            const light = new Light({
                radius: 120
            });
            light.position.set(x, y);
            scene.addLight(light);
            break;
        }
        case "lava_light": {
            const light = new Light({
                radius: 160,
                color: new Color(1.0, 0.85, 0.55)
            });
            light.position.set(x, y);
            scene.addLight(light);
            break;
        }
        case "collider":{
            const box = new colliders.BoxCollider(w, h);
            box.position.set(x, y);
            scene.addCollider(box);
            break;
        }
    }
}
```


## Live Demo

The demo below renders the scene created from the tilemap with dynamic lighting:

<iframe src="demos/lighting.html" width="100%" height="400" style="border:1px solid #ddd;"></iframe>

<a href="demos/lighting.html" target="_blank">click here to open in separate window</a>