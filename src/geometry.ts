import { CircleCollider, Collider, PolygonCollider } from "./Collider";
import { Light } from "./Light";
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
            const posX = sprite.position.x;
            const posY = sprite.position.y;

            const scaleX = sprite.scale.x;
            const scaleY = sprite.scale.y;

            const angle = sprite.angle;

            const regionX = sprite.tilesetRegion.x * (sprite.tileset.tileWidth + sprite.tileset.spacing) + sprite.tileset.margin;
            const regionY = sprite.tilesetRegion.y * (sprite.tileset.tileHeight + sprite.tileset.spacing) + sprite.tileset.margin;
            const regionW = sprite.tileset.tileWidth + ((sprite.tilesetRegion.width || 1) - 1) * (sprite.tileset.tileWidth + sprite.tileset.spacing);
            const regionH = sprite.tileset.tileHeight + ((sprite.tilesetRegion.height || 1) - 1) * (sprite.tileset.tileHeight + sprite.tileset.spacing);

            for (let i = 0; i < count; ++i) {
                view.setFloat32(offset, posX, true);
                view.setFloat32(offset + 4, posY, true);
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
        const data = new Float32Array(lights.length * 64);

        let offset = 0;
        for (let light of lights) {
            for (let i = 0; i < count; ++i) {
                data.set(light.position.toArray(), offset);
                data[offset + 2] = light.radius;
                data.set(light.color.toArray(), offset + 4);
                data[offset + 7] = light.intensity;
                data.set(light.direction.toArray(), offset + 8);
                data[offset + 10] = light.cutoff;
                offset += 64;
            }
        }
        
        return data;
    }

    const createCircleShadow = (light: Light, collider: CircleCollider): number[] => {
        const dir = collider.position.clone().sub(light.position).normalize();
        const tangent = new Vector(-dir.y, dir.x).scale(collider.radius);

        const p1 = collider.position.clone().sub(tangent);
        const p2 = collider.position.clone().add(tangent);

        const dir1 = p1.clone().sub(light.position).normalize();
        const dir2 = p2.clone().sub(light.position).normalize();

        const shadowLength = light.radius;

        const p3 = p1.clone().add(dir1.scale(shadowLength));
        const p4 = p2.clone().add(dir2.scale(shadowLength));

        return [
            // Triangle 1
            p1.x, p1.y,
            p2.x, p2.y,
            p3.x, p3.y,

            // Triangle 2
            p3.x, p3.y,
            p2.x, p2.y,
            p4.x, p4.y
        ];
    }

    const createPolygonShadow = (light: Light, collider: PolygonCollider): number[] => {
        const vertices: number[] = [];
        const shadowLength = light.radius;

        const worldPoints = collider.points.map(p => p.clone().add(collider.position));

        for (let i = 0; i < worldPoints.length; i++) {
            const p0 = worldPoints[i];
            const p1 = worldPoints[(i + 1) % worldPoints.length];

            const edgeCenter = p0.clone().add(p1).scale(0.5);
            const toLight = edgeCenter.clone().sub(light.position).normalize();
            const edgeDir = p1.clone().sub(p0).normalize();

            const normal = new Vector(-edgeDir.y, edgeDir.x);
            if (Vector.dot(normal, toLight) < 0) normal.scale(-1);

            if (Vector.dot(normal, toLight) <= 0) continue;

            const dir0 = p0.clone().sub(light.position).normalize();
            const dir1 = p1.clone().sub(light.position).normalize();

            const p2 = p0.clone().add(dir0.scale(shadowLength));
            const p3 = p1.clone().add(dir1.scale(shadowLength));

            vertices.push(
                p0.x, p0.y,
                p1.x, p1.y,
                p2.x, p2.y,

                p2.x, p2.y,
                p1.x, p1.y,
                p3.x, p3.y
            );
        }

        return vertices;
    };


    const createShadowsGeometry = (lights: Light[], colliders: Collider[]) => {
        const vertices: number[] = [];
        const drawCalls: { count: number; offset: number; }[] = []

        for (let light of lights) {
            let vertexOffset = vertices.length / 2;

            for (let collider of colliders) {
                switch (collider.getType()) {
                    case "circle":
                        vertices.push(...createCircleShadow(light, collider as CircleCollider));
                        break;
                    case "polygon":
                        vertices.push(...createPolygonShadow(light, collider as PolygonCollider));
                        break;
                }
            }

            drawCalls.push({ count: vertices.length / 2 - vertexOffset, offset: vertexOffset });
        }
        return {
            drawCalls,
            vertices: new Float32Array(vertices)
        };
    }

    return {
        quad,
        fullscreenQuad,
        spriteStride,
        createSpritesData,
        lightStride,
        createLightsGeometry,
        createShadowsGeometry
    }
})();