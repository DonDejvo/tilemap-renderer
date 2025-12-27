import { shadowGeometryModule } from "./wasm/shadowGeometryModule";

export async function initWasm() {
    await Promise.all([
        shadowGeometryModule.init()
    ]);
}
