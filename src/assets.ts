export const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = url;
        img.onload = () => {
            resolve(img);
        };
        img.onerror = () => {
            reject();
        };
    });
};

export const loadJson = async (url: string): Promise<any> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load: ${url}`);
    const data = await res.json();
    return data;
};