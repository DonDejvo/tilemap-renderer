export const worldToClipVertex = `vec4 worldToClip(vec2 worldPos, vec2 cameraPos, vec2 viewport) {
    vec2 pixelPos = worldPos - cameraPos;
    vec2 clipPos = vec2(pixelPos.x / viewport.x, 1.0 - pixelPos.y / viewport.y) * 2.0 - 1.0;
    return vec4(clipPos, 0.0, 1.0);
}
`;

export const lightStruct = `struct Light {
    vec2 center;
    float radius;
    vec3 color;
    float intensity;
    vec2 direction;
    float outerCutoff;
    float innerCutoff;
};`;

export const textureChannels = (n: number) => {
    return [...new Array(n)].map((_, i) => `uniform sampler2D uChannel${i};`).join("\n");
}