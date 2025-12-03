export interface GPUConfig {
    device: GPUDevice;
    format: GPUTextureFormat;
}

export const requestConfig = async (): Promise<GPUConfig | null> => {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();

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