import { Sprite } from "./Sprite";
import { TileAnimation } from "./Tileset";

export class Animator {
    private sprite: Sprite;
    private animation: TileAnimation | null;
    private repeat: boolean = true;

    private currentFrameIndex: number = 0;
    private frameTimer: number = 0;

    constructor(sprite: Sprite) {
        this.sprite = sprite;
        this.animation = null;
    }

    public play(
        tileXY: { x: number; y: number },
        options: { repeat?: boolean; restart?: boolean } = {}
    ) {
        const tile = this.sprite.tileset.getTile(tileXY.x, tileXY.y);

        if (!tile) return;

        const newAnimation = tile.animation || [{ tileid: tile.id, duration: 100 }];

        // Prevent restarting if already playing same animation
        if (!options.restart && this.animation === newAnimation) {
            return;
        }

        // Start / restart animation
        this.animation = newAnimation;
        this.repeat = options.repeat ?? true;
        this.currentFrameIndex = 0;
        this.frameTimer = 0;

        const first = this.animation[0];
        const xy = this.sprite.tileset.getTileXY(first.tileid);
        this.sprite.setTilesetRegion(xy.x, xy.y);
    }

    public update(dt: number) {
        if (!this.animation) return;

        const frame = this.animation[this.currentFrameIndex];
        this.frameTimer += dt * 1000;

        if (this.frameTimer < frame.duration) return;

        this.frameTimer -= frame.duration;
        this.currentFrameIndex++;

        if (this.currentFrameIndex >= this.animation.length) {
            if (this.repeat) {
                this.currentFrameIndex = 0;
            } else {
                this.currentFrameIndex = this.animation.length - 1;
                this.animation = null;
                return;
            }
        }

        const newFrame = this.animation[this.currentFrameIndex];
        const xy = this.sprite.tileset.getTileXY(newFrame.tileid);
        this.sprite.setTilesetRegion(xy.x, xy.y);
    }
}
