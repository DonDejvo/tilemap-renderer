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
            const posX = Math.round(sprite.position.x + sprite.offset.x * sprite.scale.x);
            const posY = Math.round(sprite.position.y + sprite.offset.y * sprite.scale.y);
            const scaleX = Math.round(sprite.scale.x);
            const scaleY = Math.round(sprite.scale.y);

            const regionX = sprite.tilesetRegion.x * (sprite.tileset.tileWidth + sprite.tileset.spacing) + sprite.tileset.margin;
            const regionY = sprite.tilesetRegion.y * (sprite.tileset.tileHeight + sprite.tileset.spacing) + sprite.tileset.margin;
            const regionW = sprite.tileset.tileWidth + ((sprite.tilesetRegion.width || 1) - 1) * (sprite.tileset.tileWidth + sprite.tileset.spacing);
            const regionH = sprite.tileset.tileHeight + ((sprite.tilesetRegion.height || 1) - 1) * (sprite.tileset.tileHeight + sprite.tileset.spacing);

            for (let i = 0; i < count; ++i) {
                view.setFloat32(offset, posX, true);
                view.setFloat32(offset + 4, posY, true);
                view.setFloat32(offset + 8, scaleX, true);
                view.setFloat32(offset + 12, scaleY, true);

                view.setUint16(offset + 16, regionX, true);
                view.setUint16(offset + 18, regionY, true);
                view.setUint16(offset + 20, regionW, true);
                view.setUint16(offset + 22, regionH, true);

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