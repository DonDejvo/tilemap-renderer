export class WasmModule<T> {
    private _memory?: WebAssembly.Memory;
    private _instance?: WebAssembly.Instance;

    constructor(
        private wasmUrl: string,
        private initialMemoryPages: number
    ) { }

    async init(): Promise<void> {
        this._memory = new WebAssembly.Memory({ initial: this.initialMemoryPages, maximum: 256 });
        const res = await fetch(this.wasmUrl);
        const { instance } = await WebAssembly.instantiateStreaming(res, {
            env: {
                memory: this._memory
            },
        });
        this._instance = instance;
    }

    get memory(): WebAssembly.Memory {
        if (!this._memory) throw new Error("Module is not initialized");
        return this._memory;
    }

    get exports(): T {
        if (!this._instance) throw new Error("Module is not initialized");
        return this._instance.exports as unknown as T;
    }
}
