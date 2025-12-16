import { MessageHandler, MessageHandlerOptions } from "./Message";
import { Scene } from "./Scene";
import { Vector } from "./Vector";

export abstract class SceneNode {
    private static nextId = 1;

    public readonly id: number;
    public position: Vector;
    public scene!: Scene;
    public _destroyed: boolean;
    private messageHandlers: Map<string, { handler: MessageHandler, options: MessageHandlerOptions }[]>;

    constructor() {
        this.id = SceneNode.nextId++;
        this.position = new Vector();
        this._destroyed = false;
        this.messageHandlers = new Map();
    }

    public addMessageHandler(type: string, handler: MessageHandler, options: MessageHandlerOptions = {}) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type)!.push({ handler, options });
    }

    public removeMessageHandler(type: string, handler: MessageHandler) {
        if (this.messageHandlers.has(type)) {
            const handlers = this.messageHandlers.get(type)!;
            const i = handlers.findIndex(entry => entry.handler === handler);
            if (i !== -1) handlers.splice(i, 1);
        }
    }

    public emitMessage(type: string, ...args: any) {
        if (this.messageHandlers.has(type)) {
            const handlers = this.messageHandlers.get(type)!;
            for (let i = 0; i < handlers.length; i++) {
                const entry = handlers[i];
                entry.handler(...args);
                if (entry.options.once) {
                    handlers.splice(i, 1);
                    --i;
                }
            }
        }
    }

    public start() { }

    public update(dt: number) { }

    public fixedUpdate(dt: number) { }

    public destroy() { }
}