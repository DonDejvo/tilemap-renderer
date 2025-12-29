export interface GPUConfig {
    device: GPUDevice;
    format: GPUTextureFormat;
}

export const requestConfig = async (): Promise<GPUConfig | null> => {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice({
        requiredFeatures: ["timestamp-query"]
    });

    if (!device) return null;

    const format = navigator.gpu.getPreferredCanvasFormat();

    return {
        device,
        format
    };
}

export const worldToClipVertex = `
fn worldToClip(worldPos: vec2f, cameraPos: vec2f, viewport: vec2f) -> vec4f {
    let pixelPos = worldPos - cameraPos;
    let clipPos = vec2f(pixelPos.x / viewport.x, 1.0 - pixelPos.y / viewport.y) * 2.0 - 1.0;
    return vec4f(clipPos, 0.0, 1.0);
}
`;

export const textureChannels = (n: number, group: number) => {
    return `@group(${group}) @binding(0)
var defaultSampler: sampler;
${[...new Array(n)].map((_, i) => `@group(${group}) @binding(${i + 1})
var channel${i}: texture_2d<f32>;`).join("\n")}
    
fn texture(ch: i32, uv: vec2f) -> vec4f {
    switch (ch) {
${[...new Array(n - 1)].map((_, i) => `        case ${i + 1}:  { return textureSample(channel${i + 1}, defaultSampler, uv); }`).join("\n")}
        default: { return textureSample(channel0, defaultSampler, uv); }
    }
}`;
}