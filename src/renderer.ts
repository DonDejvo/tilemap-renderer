import { Camera } from "./camera";
import { Scene } from "./scene";
import { SpriteAtlas } from "./sprite-atlas";

export interface TextureInfo {
    atlas?: SpriteAtlas;
    name: string;
    imageUrl: string;
}

export interface Renderer {
    init(texturesInfo: TextureInfo[]): Promise<void>;
    render: (scene: Scene, camera: Camera) => void;
    createAtlasTexture: (atlas: SpriteAtlas, name: string, imageUrl: string) => Promise<void>;
}