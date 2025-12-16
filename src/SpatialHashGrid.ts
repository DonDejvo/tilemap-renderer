import { Bounds } from "./common";
import { LineRenderer } from "./LineRenderer";
import { LinkedList, LinkedListNode } from "./LinkedList";
import { math } from "./math";
import { Vector } from "./Vector";

export class SpatialHashGridClient<T> {
    hashGrid!: SpatialHashGrid<T>;
    bounds: Bounds;
    cells!: {
        min: [number, number];
        max: [number, number];
        nodes: LinkedListNode<SpatialHashGridClient<T>>[][];
    };
    parent: T;
    queryId: number;

    constructor(parent: T, bounds: Bounds) {
        this.bounds = bounds;
        this.parent = parent;
        this.queryId = 0;
    }

    update() {
        this.hashGrid.updateClient(this);
    }
}

export interface SpatialHashGridParams {
    bounds: Bounds;
    dimensions: [number, number];
}

export class SpatialHashGrid<T> {
    private static queryIds = 0;

    private bounds: Bounds;
    private dimensions: [number, number];
    private cells: LinkedList<SpatialHashGridClient<T>>[][];

    constructor(params: SpatialHashGridParams) {
        this.bounds = params.bounds;
        this.dimensions = params.dimensions;
        this.cells = this.cells = Array.from(
            { length: params.dimensions[1] },
            () => Array.from(
                { length: params.dimensions[0] },
                () => new LinkedList<SpatialHashGridClient<T>>()
            )
        );
    }

    public findNearby(bounds: Bounds): SpatialHashGridClient<T>[] {
        const queryId = ++SpatialHashGrid.queryIds;

        const min = this.getCellIndices(bounds.min);
        const max = this.getCellIndices(bounds.max);

        const clients: SpatialHashGridClient<T>[] = [];
        for (let i = min[1]; i <= max[1]; ++i) {
            for (let j = min[0]; j <= max[0]; ++j) {
                for (let client of this.cells[i][j]) {
                    if (client.queryId !== queryId) {
                        client.queryId = queryId;
                        clients.push(client);
                    }
                }
            }
        }
        return clients;
    }

    public createClient(parent: T, bounds: Bounds): SpatialHashGridClient<T> {
        const client = new SpatialHashGridClient<T>(parent, bounds);
        client.hashGrid = this;
        this.insert(client);
        return client;
    }

    public updateClient(client: SpatialHashGridClient<T>): void {
        const min = this.getCellIndices(client.bounds.min);
        const max = this.getCellIndices(client.bounds.max);

        if (min[0] === client.cells.min[0] &&
            min[1] === client.cells.min[1] &&
            max[0] === client.cells.max[0] &&
            max[1] === client.cells.max[1]
        ) {
            return;
        }

        this.removeClient(client);
        this.insert(client);
    }

    public removeClient(client: SpatialHashGridClient<T>) {
        for (let i = client.cells.min[1]; i <= client.cells.max[1]; ++i) {
            for (let j = client.cells.min[0]; j <= client.cells.max[0]; ++j) {
                this.cells[i][j].remove(client.cells.nodes[i - client.cells.min[1]][j - client.cells.min[0]]);
            }
        }
    }

    public getInfo() {
        const numRows = this.dimensions[1];
        const numCols = this.dimensions[0];
        const totalCells = numRows * numCols;
        if (totalCells === 0) {
            return { totalClients: 0, min: 0, max: 0, average: 0 };
        }
        let totalNodes = 0;
        let minNodes = Number.MAX_VALUE;
        let maxNodes = 0;
        for (let i = 0; i < numRows; ++i) {
            for (let j = 0; j < numCols; ++j) {
                const size = this.cells[i][j].size;
                totalNodes += size;
                minNodes = Math.min(minNodes, size);
                maxNodes = Math.max(maxNodes, size);
            }
        }
        const avgNodes = totalNodes / totalCells;
        return { totalCells, totalNodes, minNodes, maxNodes, avgNodes };
    }

    public draw(ctx: LineRenderer) {
        const { bounds, dimensions } = this;

        const min = bounds.min;
        const max = bounds.max;

        const cols = dimensions[0];
        const rows = dimensions[1];

        const cellW = (max.x - min.x) / cols;
        const cellH = (max.y - min.y) / rows;

        ctx.beginPath();

        for (let i = 0; i <= cols; i++) {
            const x = min.x + i * cellW;
            ctx.moveTo(x, min.y);
            ctx.lineTo(x, max.y);
        }

        for (let j = 0; j <= rows; j++) {
            const y = min.y + j * cellH;
            ctx.moveTo(min.x, y);
            ctx.lineTo(max.x, y);
        }
    }

    private insert(client: SpatialHashGridClient<T>): void {
        const min = this.getCellIndices(client.bounds.min);
        const max = this.getCellIndices(client.bounds.max);
        const nodes: LinkedListNode<SpatialHashGridClient<T>>[][] = [];

        for (let i = min[1]; i <= max[1]; ++i) {
            nodes.push([]);
            for (let j = min[0]; j <= max[0]; ++j) {
                const node = this.cells[i][j].insert(client);
                nodes[i - min[1]].push(node);
            }
        }

        client.cells = {
            min,
            max,
            nodes
        };
    }

    private getCellIndices(v: Vector): [number, number] {
        const j = math.clamp(Math.floor((v.x - this.bounds.min.x) / (this.bounds.max.x - this.bounds.min.x) * this.dimensions[0]), 0, this.dimensions[0] - 1);
        const i = math.clamp(Math.floor((v.y - this.bounds.min.y) / (this.bounds.max.y - this.bounds.min.y) * this.dimensions[1]), 0, this.dimensions[1] - 1);
        return [j, i];
    }
}