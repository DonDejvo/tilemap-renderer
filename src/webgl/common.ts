import { RendererType } from "../Renderer";

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

export const getRendererReport = (type: RendererType, gl: WebGLRenderingContext | WebGL2RenderingContext) => {
    const texture: any = {
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxCubeMapTextureSize: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
        maxCombinedTextureImageUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    };

    const vertexShader: any = {
        maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
        maxVertexAttributes: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
        maxVertexTextureImageUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
        maxVertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)
    };

    const fragmentShader: any = {
        maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
        maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)
    };

    const framebuffer: any = {
        maxRenderBufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        maxViewportDimensions: [...gl.getParameter(gl.MAX_VIEWPORT_DIMS)]
    };

    const uniformBuffer: any = {};

    const transformFeedback: any = {};

    if (type === "webgl2") {
        const gl2 = gl as WebGL2RenderingContext;

        texture.max3dTextureSize = gl2.getParameter(gl2.MAX_3D_TEXTURE_SIZE);
        texture.maxArrayTextureLayers = gl2.getParameter(gl2.MAX_ARRAY_TEXTURE_LAYERS);
        texture.maxTextureLodBias = gl2.getParameter(gl2.MAX_TEXTURE_LOD_BIAS);

        vertexShader.maxVertexUniformComponents = gl2.getParameter(gl2.MAX_VERTEX_UNIFORM_COMPONENTS);
        vertexShader.maxVertexUniformBlocks = gl2.getParameter(gl2.MAX_VERTEX_UNIFORM_BLOCKS);
        vertexShader.maxVertexOutputComponents = gl2.getParameter(gl2.MAX_VERTEX_OUTPUT_COMPONENTS);
        vertexShader.maxVaryingComponents = gl2.getParameter(gl2.MAX_VARYING_COMPONENTS);

        fragmentShader.maxFragmentUniformComponents = gl2.getParameter(gl2.MAX_FRAGMENT_UNIFORM_COMPONENTS);
        fragmentShader.maxFragmentUniformBlocks = gl2.getParameter(gl2.MAX_FRAGMENT_UNIFORM_BLOCKS);
        fragmentShader.maxFragmentInputComponents = gl2.getParameter(gl2.MAX_FRAGMENT_INPUT_COMPONENTS);
        fragmentShader.minProgramTexelOffset = gl2.getParameter(gl2.MIN_PROGRAM_TEXEL_OFFSET);
        fragmentShader.maxProgramTexelOffset = gl2.getParameter(gl2.MAX_PROGRAM_TEXEL_OFFSET);

        framebuffer.maxDrawBuffers = gl2.getParameter(gl2.MAX_DRAW_BUFFERS);
        framebuffer.maxColorAttachments = gl2.getParameter(gl2.MAX_COLOR_ATTACHMENTS);
        framebuffer.maxSamples = gl2.getParameter(gl2.MAX_SAMPLES);

        uniformBuffer.maxUniformBufferBindings = gl2.getParameter(gl2.MAX_UNIFORM_BUFFER_BINDINGS);
        uniformBuffer.maxUniformBlockSize = gl2.getParameter(gl2.MAX_UNIFORM_BLOCK_SIZE);
        uniformBuffer.uniformBufferOffsetAlignment = gl2.getParameter(gl2.UNIFORM_BUFFER_OFFSET_ALIGNMENT);
        uniformBuffer.maxCombinedUniformBlocks = gl2.getParameter(gl2.MAX_COMBINED_UNIFORM_BLOCKS);
        uniformBuffer.maxCombinedVertexUniformComponents = gl2.getParameter(gl2.MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS);
        uniformBuffer.maxCombinedFragmentUniformComponents = gl2.getParameter(gl2.MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS);

        transformFeedback.maxTransformFeedbackInterleavedComponents = gl2.getParameter(gl2.MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS);
        transformFeedback.maxTransformFeedbackSeparateAttribs = gl2.getParameter(gl2.MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS);
        transformFeedback.maxTransformFeedbackSeparateComponents = gl2.getParameter(gl2.MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS);
    }

    const info: any = {
        glVersion: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER)
    };

    const dbgRenderInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (dbgRenderInfo != null) {
        info.unMaskedRenderer = gl.getParameter(dbgRenderInfo.UNMASKED_RENDERER_WEBGL);
        info.unMaskedVendor = gl.getParameter(dbgRenderInfo.UNMASKED_VENDOR_WEBGL);
    }

    return {
        context: type,
        info,
        limits: {
            ...texture,
            ...vertexShader,
            ...fragmentShader,
            ...framebuffer,
            ...uniformBuffer,
            ...transformFeedback
        }
    };
}