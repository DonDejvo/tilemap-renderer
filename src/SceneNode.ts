import { MessageHandler, MessageHandlerOptions } from "./Message";
import { Scene } from "./Scene";
import { Vector } from "./Vector";

export abstract class SceneNode {
    private static _nextId = 1;

    public readonly id: number;
    public name: string;
    public position: Vector;
    public angle: number;
    public scene!: Scene;
    private _messageHandlers: Map<string, { handler: MessageHandler, options: MessageHandlerOptions }[]>;
    private _parent: SceneNode | null;
    private _nodes: SceneNode[];

    constructor() {
        this.id = SceneNode._nextId++;
        this.name = "";
        this.position = new Vector();
        this.angle = 0;
        this._messageHandlers = new Map();
        this._parent = null;
        this._nodes = [];
    }

    public addMessageHandler(type: string, handler: MessageHandler, options: MessageHandlerOptions = {}) {
        if (!this._messageHandlers.has(type)) {
            this._messageHandlers.set(type, []);
        }
        this._messageHandlers.get(type)!.push({ handler, options });
    }

    public removeMessageHandler(type: string, handler: MessageHandler) {
        if (this._messageHandlers.has(type)) {
            const handlers = this._messageHandlers.get(type)!;
            const i = handlers.findIndex(entry => entry.handler === handler);
            if (i !== -1) handlers.splice(i, 1);
        }
    }

    public emitMessage(type: string, ...args: any) {
        if (this._messageHandlers.has(type)) {
            const handlers = this._messageHandlers.get(type)!;
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

    public addNode(node: SceneNode) {
        if (!this.scene) throw new Error("Cannot add node: Parent node is not started");
        node.setParent(this, false);
        return this.scene.addNode(node);
    }

    public removeNode(node: SceneNode) {
        if (!this.scene) throw new Error("Cannot remove node: Parent node is not started");
        const i = this._nodes.indexOf(node);
        if (i !== -1) {
            this._nodes.splice(i, 1);
            this.scene.removeNode(node);
        }
    }

    public getNodes(nodeClass?: Function) {
        return nodeClass ? this._nodes.filter(node => node instanceof nodeClass) : this._nodes;
    }

    public getNodesFromParent(nodeClass?: Function) {
        if (this._parent) {
            return this._parent.getNodes(nodeClass);
        }
        return [];
    }

    public get worldAngle(): number {
        if (this._parent) {
            return this._parent.worldAngle + this.angle;
        }
        return this.angle;
    }

    public set worldAngle(angle: number) {
        if (this._parent) {
            this.angle = angle - this._parent.worldAngle;
        } else {
            this.angle = angle;
        }
    }

    public get worldPosition(): Vector {
        if (this._parent) {
            return this._parent.worldPosition.clone()
                .add(this.position.clone().rot(this._parent.worldAngle));
        }
        return this.position.clone();
    }

    public set worldPosition(pos: Vector) {
        if (this._parent) {
            this.position.copy(pos.clone().sub(this._parent.worldPosition).rot(-this._parent.worldAngle));
        } else {
            this.position.copy(pos);
        }
    }

    public setParent(newParent: SceneNode | null, worldPositionStays: boolean = true) {
        const curParent = this._parent;
        const curWorldPos = this.worldPosition;
        const curWorldAngle = this.worldAngle;

        this._parent = newParent;

        if (newParent) {
            if (worldPositionStays) {
                this.position.copy(curWorldPos.sub(newParent.worldPosition));
                this.angle = curWorldAngle - newParent.worldAngle;
            }

            newParent._nodes.push(this);
        } else if (curParent) {
            if (worldPositionStays) {
                this.position.copy(curWorldPos);
                this.angle = curWorldAngle;
            }

            const i = curParent._nodes.indexOf(this);
            if (i !== -1) curParent._nodes.splice(i);
        }
    }

    public start() { }

    public update(dt: number) { }

    public fixedUpdate(dt: number) { }

    public destroy() { }
}