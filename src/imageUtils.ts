export const getImageData = (image: HTMLImageElement) => {
    const { width, height } = image;

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = width;
    tmpCanvas.height = height;

    const ctx = tmpCanvas.getContext("2d");
    if(!ctx) throw new Error("Could not get 2D context");

    ctx.drawImage(image, 0, 0);

    return ctx.getImageData(0, 0, width, height).data;
}