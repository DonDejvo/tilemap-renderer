import { Collider } from "./Collider";
import { Light } from "./Light";
import { Line } from "./LineRenderer";
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

    const spriteStride = 68;

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

                view.setFloat32(offset + 28, sprite.tintColor.r, true);
                view.setFloat32(offset + 32, sprite.tintColor.g, true);
                view.setFloat32(offset + 36, sprite.tintColor.b, true);
                view.setFloat32(offset + 40, sprite.tintColor.a, true);

                view.setFloat32(offset + 44, sprite.maskColor.r, true);
                view.setFloat32(offset + 48, sprite.maskColor.g, true);
                view.setFloat32(offset + 52, sprite.maskColor.b, true);
                view.setFloat32(offset + 56, sprite.maskColor.a, true);

                view.setFloat32(offset + 60, sprite.offset.x, true);
                view.setFloat32(offset + 64, sprite.offset.y, true);

                offset += stride;
            }
        }

        return buffer;
    }

    const lightStride = 48;

    const createLightsGeometry = (lights: Light[], instanced: boolean = false) => {
        const count = instanced ? 1 : 4;
        const data = new Float32Array(lights.length * 64); // Uniform alignment constraint

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

    const createShadow = (out: number[], light: Light, worldPoints: Vector[]): number => {
        const lightWorldPos = light.worldPosition;

        let count = 0;
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
            count += 12;
        }

        return count;
    }

    const createShadowsGeometry = (out: number[], light: Light, colliderIndices: number[], colliders: Collider[], offset: number = 0) => {
        for (let idx of colliderIndices) {
            const c = colliders[idx];
            offset += createShadow(out, light, c.getWorldPoints());
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