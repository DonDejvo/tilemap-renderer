# Tile Animation

Tile animation allows individual tiles within a tileset to display dynamic visual changes over time. Animations are defined as sequences of **frames**, each pointing to a specific tile ID in the tileset and a duration for how long that frame should be displayed.

```ts
interface TileAnimationFrameJSON {
    duration: number; // in ms
    tileid: number;
}
```

## Animator

The **Animator** manages tile animations for sprites. It tracks which frame of an animation should currently be displayed, updates the frame based on elapsed time, and loops or stops the sequence according to its configuration. The Animator ensures that the correct tile from the tileset is shown at each moment.

## Creating a Tile Animation

To create a tile animation, first define an array of animation frames for a tile in your tileset.  
Each frame specifies the tile ID and duration in milliseconds.  

Here is the tileset image used for the animation:

![Player Tileset](/images/player.png)

The **Player Run** animation uses a sequence of tiles in the following order: 0 → 1 → 2 → 1.

Next, create an **Animator** for the sprite you want to animate. The Animator controls which frame is displayed at each moment.

Use the `play` method to start an animation sequence:

- **tileXY** – the coordinates of the tile in the tileset grid where the animation begins.  
- **options** – optional configuration:  
  - `repeat`: whether the animation should loop continuously  
  - `restart`: whether to restart the animation if it is already playing  

Finally, in your game loop, call the Animator's `update` method with the elapsed time (`dt`) to advance the animation frames. Then render the scene to display the updated sprite.

```ts
const { createRenderer, Camera, Scene, Color, Sprite, Tileset, Animator, assets } = TilemapRenderer;

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

    // Create tileset with animation frames
    const tileset = new Tileset({
        name: "Player",
        imagewidth: 80,
        imageheight: 32,
        columns: 5,
        tilecount: 10,
        tilewidth: 16,
        tileheight: 16,
        tiles: [
            {
                id: 0,
                animation: [
                    { tileid: 0, duration: 160 },
                    { tileid: 1, duration: 160 },
                    { tileid: 2, duration: 160 },
                    { tileid: 1, duration: 160 }
                ]
            }
        ]
    });

    // Create sprite and assign tileset
    const sprite = new Sprite({ tileset });
    sprite.position.set(50, 50);
    sprite.scale.scale(2);
    scene.addSprite(sprite);

    // Create Animator and play animation
    const animator = new Animator(sprite);
    animator.play({ x: 0, y: 0 }, { repeat: true });

    // Add canvas to document
    const canvas = renderer.getCanvas();
    document.body.appendChild(canvas);

    // Add textures to renderer
    renderer.addTextures([tileset], { ["Player"]: playerImage });

    // Initialize renderer
    await renderer.init();

    // Animation loop
    let dt = 0;
    let prevTime = 0;
    const loop = () => {
        requestAnimationFrame(t => {
            loop();

            t *= 0.001;
            dt = t - (prevTime || t);
            prevTime = t;

            animator.update(dt);
            renderer.render(scene, camera);
        });
    };

    loop();
};

main();
```

## Live Demo

The demo below shows an animation of sprite:

<iframe src="demos/animation.html" width="300" height="150" style="border:1px solid #ddd;"></iframe>

<a href="demos/animation.html" target="_blank">click here to open in separate window</a>