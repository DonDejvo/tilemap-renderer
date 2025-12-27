export class WasmModule<T> {
    protected memory: WebAssembly.Memory;
    private instance?: WebAssembly.Instance;

    constructor(
        private wasmUrl: string,
        private initialMemoryPages: number
    ) {
        this.memory = new WebAssembly.Memory({ initial: this.initialMemoryPages, maximum: 256 });
    }

    public async init(): Promise<void> {
        const res = await fetch(this.wasmUrl);
        const { instance } = await WebAssembly.instantiateStreaming(res, {
            env: {
                memory: this.memory
            },
        });
        this.instance = instance;
    }

    protected get exports(): T {
        if (!this.instance) throw new Error("Module  not initialized. Call initWasm() first.");
        return this.instance.exports as unknown as T;
    }
}
