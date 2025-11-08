export const getImageData = (
    source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap | OffscreenCanvas | Uint8Array
) => {
    if (source instanceof Uint8Array) {
        return source;
    }

    let width: number;
    let height: number;
    let tmpCanvas: HTMLCanvasElement | OffscreenCanvas;

    if (source instanceof HTMLCanvasElement || source instanceof OffscreenCanvas) {
        tmpCanvas = source;
        width = tmpCanvas.width;
        height = tmpCanvas.height;
    } else {
        width = source.width;
        height = source.height;
        tmpCanvas = document.createElement("canvas");
        tmpCanvas.width = width;
        tmpCanvas.height = height;
    }

    const ctx = tmpCanvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");

    if (!(source instanceof HTMLCanvasElement || source instanceof OffscreenCanvas)) {
        ctx.drawImage(source, 0, 0);
    }

    return new Uint8Array(ctx.getImageData(0, 0, width, height).data);
}
