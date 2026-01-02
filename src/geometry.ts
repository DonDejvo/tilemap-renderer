import { Collider } from "./Collider";
import { Light } from "./Light";
import { Line } from "./LineRenderer";
import { math } from "./math";
import { Sprite } from "./Sprite";
import { Vector } from "./Vector";

export const geometry = (() => {
    const quad = new Float32Array([
        0, 1, 0, 0,
        0, 0, 0, 1,
        1, 1, 1, 0,
        1, 0, 1, 1,
    ]);

    const fullscreenQuad = new Float32Array([
        -1, 1, 0, 0,
        -1, -1, 0, 1,
        1, 1, 1, 0,
        1, -1, 1, 1,
    ]);

    const spriteStride = 44;

    const createSpritesData = (sprites: Sprite[], instanced: boolean = false) => {
        const count = instanced ? 1 : 4;
        const stride = spriteStride;
        const buffer = new ArrayBuffer(sprites.length * count * stride);
        const view = new DataView(buffer);

        let offset = 0;
        for (const sprite of sprites) {
            const { x, y } = sprite.worldPosition;

            const scaleX = sprite.scale.x;
            const scaleY = sprite.scale.y;

            const angle = sprite.worldAngle;

            const regionX = sprite.tilesetRegion.x * (sprite.tileset.tileWidth + sprite.tileset.spacing) + sprite.tileset.margin;
            const regionY = sprite.tilesetRegion.y * (sprite.tileset.tileHeight + sprite.tileset.spacing) + sprite.tileset.margin;
            const regionW = sprite.tileset.tileWidth + ((sprite.tilesetRegion.width || 1) - 1) * (sprite.tileset.tileWidth + sprite.tileset.spacing);
            const regionH = sprite.tileset.tileHeight + ((sprite.tilesetRegion.height || 1) - 1) * (sprite.tileset.tileHeight + sprite.tileset.spacing);

            for (let i = 0; i < count; ++i) {
                view.setFloat32(offset, x, true);
                view.setFloat32(offset + 4, y, true);
                view.setFloat32(offset + 8, scaleX, true);
                view.setFloat32(offset + 12, scaleY, true);
                view.setFloat32(offset + 16, angle, true);

                view.setUint16(offset + 20, regionX, true);
                view.setUint16(offset + 22, regionY, true);
                view.setUint16(offset + 24, regionW, true);
                view.setUint16(offset + 26, regionH, true);

                view.setUint8(offset + 28, math.clamp(sprite.tintColor.r * 255, 0, 255));
                view.setUint8(offset + 29, math.clamp(sprite.tintColor.g * 255, 0, 255));
                view.setUint8(offset + 30, math.clamp(sprite.tintColor.b * 255, 0, 255));
                view.setUint8(offset + 31, math.clamp(sprite.tintColor.a * 255, 0, 255));

                view.setUint8(offset + 32, math.clamp(sprite.maskColor.r * 255, 0, 255));
                view.setUint8(offset + 33, math.clamp(sprite.maskColor.g * 255, 0, 255));
                view.setUint8(offset + 34, math.clamp(sprite.maskColor.b * 255, 0, 255));
                view.setUint8(offset + 35, math.clamp(sprite.maskColor.a * 255, 0, 255));

                view.setFloat32(offset + 36, sprite.offset.x, true);
                view.setFloat32(offset + 40, sprite.offset.y, true);

                offset += stride;
            }
        }

        return buffer;
    }

    const lightStride = 48;

    const createLightsGeometry = (lights: Light[], instanced: boolean = false) => {
        const count = instanced ? 1 : 4;
        const data = new Float32Array(lights.length * 64);

        let offset = 0;
        for (let light of lights) {
            for (let i = 0; i < count; ++i) {
                data.set(light.worldPosition.toArray(), offset);
                data[offset + 2] = light.radius;
                data.set(light.color.toArray(), offset + 4);
                data[offset + 7] = light.intensity;
                data.set(light.direction.toArray(), offset + 8);
                data[offset + 10] = light.outerCutoff;
                data[offset + 11] = Math.max(light.innerCutoff, light.outerCutoff);
                offset += 64;
            }
        }

        return data;
    }

    const createShadowsGeometry = (out: number[], light: Light, colliderIndices: number[], colliders: Collider[], offset: number = 0) => {
        const lightWorldPos = light.worldPosition;

        for (let idx of colliderIndices) {
            const worldPoints = colliders[idx].getWorldPoints();

            for (let i = 0; i < worldPoints.length; ++i) {
                const p0 = worldPoints[i];
                const p1 = worldPoints[(i + 1) % worldPoints.length];

                const edgeCenter = p0.clone().add(p1).scale(0.5);
                const toLight = lightWorldPos.clone().sub(edgeCenter);
                const edgeDir = p1.clone().sub(p0).normalize();

                const normal = new Vector(edgeDir.y, -edgeDir.x);

                const cosAngle = Vector.dot(normal, toLight.clone().normalize());
                if (cosAngle <= 0) continue;

                const dir0 = p0.clone().sub(lightWorldPos).normalize();
                const dir1 = p1.clone().sub(lightWorldPos).normalize();

                const shadowLength = Math.max(light.radius - toLight.len(), 0) * 100;

                const p2 = p0.clone().add(dir0.scale(shadowLength));
                const p3 = p1.clone().add(dir1.scale(shadowLength));

                out.push(
                    p0.x, p0.y,
                    p1.x, p1.y,
                    p2.x, p2.y,

                    p2.x, p2.y,
                    p1.x, p1.y,
                    p3.x, p3.y
                );
                offset += 6;
            }
        }
        return offset;
    }

    const lineStride = 6;

    const createLinesGeometry = (lines: Line[]) => {
        const data = new Float32Array(lines.length * 2 * lineStride);
        let offset = 0;
        for (let line of lines) {
            const colorData = line.color.toArray();
            data[offset] = line.x0;
            data[offset + 1] = line.y0;
            data.set(colorData, offset + 2);
            offset += lineStride;
            data[offset] = line.x1;
            data[offset + 1] = line.y1;
            data.set(colorData, offset + 2);
            offset += lineStride;
        }
        return data;
    }

    return {
        quad,
        fullscreenQuad,
        spriteStride,
        createSpritesData,
        lightStride,
        createLightsGeometry,
        createShadowsGeometry,
        lineStride,
        createLinesGeometry
    }
})();