export class WasmModule<T> {
    private wasmUrl: string;
    private instance!: WebAssembly.Instance;
    protected memory!: WebAssembly.Memory;
    public memoryPages: number;

    constructor(wasmUrl: string) {
        this.wasmUrl = wasmUrl;
        this.memoryPages = 2;
    }

    public async init(): Promise<void> {
        const res = await fetch(this.wasmUrl);

        this.memory = new WebAssembly.Memory({ initial: this.memoryPages, maximum: this.memoryPages });

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
