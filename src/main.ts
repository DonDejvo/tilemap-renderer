import { loadImage } from "./assets";
import { Camera } from "./camera";
import { Renderer } from "./renderer";
import { Scene } from "./scene";
import { Sprite } from "./sprite";
import { SpriteAtlas } from "./sprite-atlas";
import { WebglRenderer } from "./webgl/renderer";
import { WebgpuRenderer } from "./webgpu/renderer";

const main = async () => {
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.display = "block";
    document.body.appendChild(canvas);

    const camera = new Camera();

    const resize = () => {
        canvas.width = innerWidth;
        canvas.height = innerHeight;

        camera.updateProjection(canvas.width, canvas.height);
    }

    addEventListener("resize", resize);
    resize();

    const spriteAtlas = await SpriteAtlas.load("/assets/tileset.json");
    const spriteAtlasImage = await loadImage("/assets/tileset.png");

    const scene = new Scene();

    const sprites: Sprite[] = [];
    for (let i = 0; i < 4; ++i) {
        const s = new Sprite(1, "tileset", i, false);
        s.position.set(32, 32 + i * 64);
        s.scale.set(64, 64);
        scene.addSprite(s);
        sprites.push(s);
    }

    const fpsElem = document.createElement("div");
    fpsElem.style.position = "fixed";
    fpsElem.style.left = "10px";
    fpsElem.style.top = "10px";
    fpsElem.style.color = "white";
    fpsElem.style.font = "14px monospace";
    fpsElem.style.zIndex = "9999";
    document.body.appendChild(fpsElem);

    let dt = 0;
    let lastRAF: number | undefined = undefined;
    let lastTime = 0;
    let frameCount = 0;
    let fps = 0;

    let renderer: Renderer;
    let rendererContext: string;

    if(prompt("Enter \"webgpu\" to use WebGPU renderer, otherwise WebGL2 will be used:") === "webgpu") {
        renderer = new WebgpuRenderer(canvas);
        rendererContext = "WebGPU";
    } else {
        renderer = new WebglRenderer(canvas);
        rendererContext = "WebGL2";
    }

    await renderer.init([{
        atlas: spriteAtlas, 
        name: "tileset", 
        imageData: spriteAtlasImage
    }]);

    const draw = () => {
        requestAnimationFrame((t) => {
            t *= 0.001;

            draw();

            frameCount++;
            dt = t - (lastRAF ?? t);
            if (t - lastTime >= 1) {
                fps = frameCount;
                frameCount = 0;
                lastTime = t;
                fpsElem.textContent = `${rendererContext} - FPS: ${fps}`;
            }
            lastRAF = t;

            for(let i = 0; i < sprites.length; ++i) {
                sprites[i].position.x += (i + 1) * 32 * dt;
                if(sprites[i].position.x - sprites[i].scale.x * 0.5 > camera.vw) {
                    sprites[i].position.x -= camera.vw + sprites[i].scale.x;
                } 
            }

            renderer.render(scene, camera);
        });
    }

    draw();
}

main();