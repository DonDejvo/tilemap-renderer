import { limits } from "./limits";
import { shadowGeometryModule } from "./wasm/shadowGeometryModule";

export async function initWasm() {
    shadowGeometryModule.memoryPages = limits.shadowGeometryModulePages;

    await Promise.all([
        shadowGeometryModule.init()
    ]);
}
