import { Sprite } from "./Sprite";

export const geometry = (() => {
    const quad = new Float32Array([
        -0.5, 0.5, 0, 0,
        -0.5, -0.5, 0, 1,
        0.5, 0.5, 1, 0,
        0.5, -0.5, 1, 1,
    ]);

    const createSpritesData = (sprites: Sprite[], instanced: boolean = false) => {
        const count = instanced ? 1 : 4;
        const stride = 24;
        const buffer = new ArrayBuffer(sprites.length * count * stride);
        const view = new DataView(buffer);

        let offset = 0;
        for (const sprite of sprites) {
            for (let i = 0; i < count; ++i) {
                view.setFloat32(offset, sprite.position.x + sprite.offset.x * sprite.scale.x, true);
                view.setFloat32(offset + 4, sprite.position.y + sprite.offset.y * sprite.scale.y, true);
                view.setFloat32(offset + 8, sprite.scale.x, true);
                view.setFloat32(offset + 12, sprite.scale.y, true);

                view.setUint16(offset + 16, sprite.tilesetRegion.x, true);
                view.setUint16(offset + 18, sprite.tilesetRegion.y, true);
                view.setUint16(offset + 20, sprite.tilesetRegion.width || 1, true);
                view.setUint16(offset + 22, sprite.tilesetRegion.height || 1, true);

                offset += stride;
            }
        }

        return buffer;
    }


    return {
        quad,
        createSpritesData
    }
})();