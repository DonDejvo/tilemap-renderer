export class WasmModule<T> {
    private wasmUrl: string;
    private memoryPages: number;
    protected memory: WebAssembly.Memory;
    private instance?: WebAssembly.Instance;

    constructor(wasmUrl: string, memoryPages: number) {
        this.wasmUrl = wasmUrl;
        this.memoryPages = memoryPages;
        this.memory = new WebAssembly.Memory({ initial: this.memoryPages, maximum: this.memoryPages });
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
        if (!this.instance) throw new Error("Module not initialized. Call initWasm() first.");
        return this.instance.exports as unknown as T;
    }
}
