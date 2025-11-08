import { Sprite } from "./sprite";

export const quad = new Float32Array([
    -0.5, 0.5, 0, 0,
    -0.5, -0.5, 0, 1,
    0.5, 0.5, 1, 0,
    0.5, -0.5, 1, 1,
]);

export const createSpritesData = (sprites: Sprite[]) => {
    const data: number[] = [];

    for (const sprite of sprites) {
        data.push(sprite.position.x, sprite.position.y, sprite.scale.x, sprite.scale.y, sprite.tileId);
    }
    return new Float32Array(data);
}