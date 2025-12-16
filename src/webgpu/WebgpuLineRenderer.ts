import { Camera } from "../Camera";
import { Color } from "../Color";
import { geometry } from "../geometry";
import { LineRenderer, MAX_LINES } from "../LineRenderer";
import { GPUConfig, worldToClipVertex } from "./common";

const linesSource = `
struct VSInput {
    @location(0) pos: vec2f,
    @location(1) color: vec4f
}

struct VSOutput {
    @builtin(position) pos: vec4f,
    @location(0) color: vec4f
}

struct Camera {
    pos: vec2f,
    viewportDimensions: vec2f
}

@group(0) @binding(0)
var<uniform> camera: Camera;

${worldToClipVertex}

@vertex
fn vs_main(input: VSInput) -> VSOutput {
    var out: VSOutput;

    out.color = input.color;
    
    out.pos = worldToClip(input.pos, camera.pos, camera.viewportDimensions);

    return out;
}

@fragment
fn fs_main(input: VSOutput) -> @location(0) vec4f {
    return input.color;
}
`;

export class WebgpuLineRendrer extends LineRenderer {
    private ctx: GPUCanvasContext;
    private cfg: GPUConfig;
    private pipeline!: GPURenderPipeline;
    private vbo!: GPUBuffer;
    private cameraBuffer!: GPUBuffer;
    private cameraBindGroup!: GPUBindGroup;

    constructor(ctx: GPUCanvasContext, cfg: GPUConfig) {
        super();
        this.ctx = ctx;
        this.cfg = cfg;
        this.strokeColor = Color.BLACK;
    }

    init() {
        this.vbo = this.cfg.device.createBuffer({
            label: "Lines VBO",
            size: MAX_LINES * geometry.lineStride * 2 * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        const module = this.cfg.device.createShaderModule({
            label: "Lines Shader",
            code: linesSource
        })

        this.pipeline = this.cfg.device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module,
                entryPoint: "vs_main",
                buffers: [{
                    arrayStride: geometry.lineStride * 4,
                    attributes: [
                        { shaderLocation: 0, format: "float32x2", offset: 0 },
                        { shaderLocation: 1, format: "float32x4", offset: 8 }
                    ]
                }]
            },
            fragment: {
                module,
                entryPoint: "fs_main",
                targets: [{
                    format: this.cfg.format
                }]
            },
            primitive: {
                topology: "line-list"
            }
        });

        this.cameraBuffer = this.cfg.device.createBuffer({
            label: "Lines Camera Buffer",
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })

        this.cameraBindGroup = this.cfg.device.createBindGroup({
            label: "Lines Camera Bind Group",
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0, resource: { buffer: this.cameraBuffer }
            }]
        });
    }

    render(encoder: GPUCommandEncoder, camera: Camera) {
        if(this.lines.length === 0) return;

        this.cfg.device.queue.writeBuffer(this.vbo, 0, geometry.createLinesGeometry(this.lines));
        this.cfg.device.queue.writeBuffer(
            this.cameraBuffer,
            0,
            new Float32Array([
                camera.position.x, camera.position.y,
                camera.vw, camera.vh
            ])
        );

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                loadOp: "load",
                storeOp: "store",
                view: this.ctx.getCurrentTexture().createView()
            }]
        });
        pass.setBindGroup(0, this.cameraBindGroup);
        pass.setPipeline(this.pipeline);
        pass.setVertexBuffer(0, this.vbo);
        pass.draw(this.lines.length * 2);
        pass.end();
    }

}