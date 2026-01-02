export interface GPUConfig {
    adapter: GPUAdapter;
    device: GPUDevice;
    format: GPUTextureFormat;
}

export const requestConfig = async (): Promise<GPUConfig | null> => {
    if (!navigator.gpu) return null;

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;

    let device: GPUDevice;

    try {
        const requiredFeatures: GPUFeatureName[] = [];
        if (adapter.features.has("timestamp-query")) {
            requiredFeatures.push("timestamp-query");
        }
        device = await adapter.requestDevice({ requiredFeatures });
    } catch {
        device = await adapter.requestDevice();
    }

    const format = navigator.gpu.getPreferredCanvasFormat();

    return {
        adapter,
        device,
        format
    };
};


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