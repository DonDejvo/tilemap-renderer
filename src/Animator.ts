import { SceneNode } from "./SceneNode";
import { Sprite } from "./Sprite";
import { TileAnimation } from "./Tileset";

class Animation {
    static animationLabels = new Map<string, [number, number]>();

    label: string | [number, number];
    frames: TileAnimation;

    static createLabel(label: string, tileXY: [number, number]) {
        this.animationLabels.set(label, tileXY);
    }

    constructor(label: string | [number, number], frames: TileAnimation) {
        this.label = label;
        this.frames = frames;
    }

    equals(other: Animation) {
        const tileXY = typeof this.label === "string" ?
            Animation.animationLabels.get(this.label)! :
            this.label;

        const otherTileXY = typeof other.label === "string" ?
            Animation.animationLabels.get(other.label)! :
            other.label;

        return tileXY &&
            otherTileXY &&
            tileXY[0] === otherTileXY[0] &&
            tileXY[1] === otherTileXY[1];
    }
}

export class Animator extends SceneNode {
    private sprite: Sprite | null;
    private animation: Animation | null;
    private repeat: boolean = true;

    private currentFrameIndex: number = 0;
    private frameTimer: number = 0;

    constructor(sprite: Sprite | null) {
        super();
        this.sprite = sprite;
        this.animation = null;
    }

    public setSprite(sprite: Sprite | null) {
        this.sprite = sprite;
        this.animation = null;
    }

    public play(
        label: [number, number] | string,
        options: { repeat?: boolean; restart?: boolean } = {}
    ) {
        if(!this.sprite) return;

        let tileXY: [number, number];
        if (typeof label === "string") {
            if (!Animation.animationLabels.has(label)) throw new Error("Animation not found: " + label);
            tileXY = Animation.animationLabels.get(label)!;
        } else {
            tileXY = label;
        }
        const tile = this.sprite.tileset.getTile(...tileXY);

        if (!tile) return;

        const frames = tile.animation || [{ tileid: tile.id, duration: 100 }];
        const newAnimation = new Animation(label, frames);

        if (!options.restart && this.animation?.equals(newAnimation)) {
            return;
        }

        this.animation = newAnimation;
        this.repeat = options.repeat ?? true;
        this.currentFrameIndex = 0;
        this.frameTimer = 0;

        const first = this.animation.frames[0];
        const xy = this.sprite.tileset.getTileXY(first.tileid);
        this.sprite.setTilesetRegion(xy.x, xy.y);

        this.emitMessage("animationstart", this.animation.label);
    }

    public update(dt: number): void {
        if (!this.animation || !this.sprite) return;

        const frame = this.animation.frames[this.currentFrameIndex];
        this.frameTimer += dt * 1000;

        if (this.frameTimer < frame.duration) return;

        this.frameTimer = 0;
        this.currentFrameIndex++;

        if (this.currentFrameIndex >= this.animation.frames.length) {
            if (this.repeat) {
                this.currentFrameIndex = 0;
            } else {
                this.currentFrameIndex = this.animation.frames.length - 1;
                this.emitMessage("animationend", this.animation.label);
                this.animation = null;
                return;
            }
        }

        const newFrame = this.animation.frames[this.currentFrameIndex];
        const xy = this.sprite.tileset.getTileXY(newFrame.tileid);
        this.sprite.setTilesetRegion(xy.x, xy.y);
    }
}
