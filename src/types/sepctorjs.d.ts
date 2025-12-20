declare module 'spectorjs' {
    export class Spector {
        displayUI(): void;
        captureContext(
            gl: WebGLRenderingContext | WebGL2RenderingContext,
            commandCount?: number
        ): void;
        captureNextFrame(
            gl: WebGLRenderingContext | WebGL2RenderingContext
        ): void;
        spyCanvases(): void;
    }
}
