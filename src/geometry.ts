import { Sprite } from "./Sprite";

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

    const createSpritesData = (sprites: Sprite[], instanced: boolean = false) => {
        const count = instanced ? 1 : 4;
        const stride = 28;
        const buffer = new ArrayBuffer(sprites.length * count * stride);
        const view = new DataView(buffer);

        let offset = 0;
        for (const sprite of sprites) {
            const posX = sprite.position.x + sprite.offset.x;
            const posY = sprite.position.y + sprite.offset.y;

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

                offset += stride;
            }
        }

        return buffer;
    }


    return {
        quad,
        fullscreenQuad,
        createSpritesData
    }
})();