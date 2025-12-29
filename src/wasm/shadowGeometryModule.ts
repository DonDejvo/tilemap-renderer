import { Collider } from '../Collider';
import { Light } from '../Light';
import { WasmModule } from '../WasmModule';
import shadowWasmUrl from './shadowGeometry.wasm?url';

interface IShadowGeometryModule {
    createShadowsGeometry(
        lightIdx: number,
        colliders: number,
        colliderIndices: number,
        numColliderIndices: number,
        out: number
    ): number;
}

class ShadowGeometryModule extends WasmModule<IShadowGeometryModule> {
    public initShadowBuffer(lights: Light[], colliders: Collider[], lightColliderIndices: number[][]) {

        const shadowsBufferView = new DataView(this.memory.buffer);
        let shadowsBufferOffset = 0;

        for (const light of lights) {

            const lightWorldPos = light.worldPosition;

            shadowsBufferView.setFloat32(shadowsBufferOffset, lightWorldPos.x, true);
            shadowsBufferView.setFloat32(shadowsBufferOffset + 4, lightWorldPos.y, true);
            shadowsBufferView.setFloat32(shadowsBufferOffset + 8, light.radius, true);

            shadowsBufferOffset += 16;
        }

        const shadowsCollidersPtr = shadowsBufferOffset;

        for (const collider of colliders) {
            const worldPoints = collider.getWorldPoints();

            shadowsBufferView.setUint32(shadowsBufferOffset, worldPoints.length, true);

            for (let i = 0; i < worldPoints.length; ++i) {
                const p = worldPoints[i];

                shadowsBufferView.setFloat32(shadowsBufferOffset + 4 + i * 8, p.x, true);
                shadowsBufferView.setFloat32(shadowsBufferOffset + 4 + i * 8 + 4, p.y, true);
            }

            shadowsBufferOffset += 68;
        }

        const shadowsColliderIndicesPtr = shadowsBufferOffset;
        const outPtr = shadowsBufferOffset + 4 * colliders.length;

        const drawCalls: { offset: number; count: number; }[] = [];
        let shadowsOffset = 0;

        for (let i = 0; i < lights.length; ++i) {

            for (let j = 0; j < lightColliderIndices[i].length; ++j) {
                shadowsBufferView.setUint32(shadowsBufferOffset + j * 4, lightColliderIndices[i][j], true);
            }

            const numVertices = this.exports.createShadowsGeometry(
                i,
                shadowsCollidersPtr,
                shadowsColliderIndicesPtr,
                lightColliderIndices[i].length,
                outPtr + shadowsOffset * 8
            );

            drawCalls.push({ count: numVertices, offset: shadowsOffset });
            shadowsOffset += numVertices;
        }

        const vertices = new Float32Array(this.memory.buffer, outPtr, shadowsOffset * 2);

        return {
            vertices,
            drawCalls
        };
    }
}

export const shadowGeometryModule = new ShadowGeometryModule(shadowWasmUrl);