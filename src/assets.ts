export const assets = (() => {
    const loadImage = (url: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = url;
            img.onload = () => {
                resolve(img);
            };
            img.onerror = () => {
                reject("Failed to load image: " + url);
            };
        });
    };

    const loadJson = async <T>(url: string): Promise<T> => {
        try {
            const res = await fetch(url);
            const data = await res.json();

            return data;
        } catch {
            throw new Error(`Failed to load json: ${url}`);
        }
    };

    return {
        loadImage,
        loadJson
    }
})();