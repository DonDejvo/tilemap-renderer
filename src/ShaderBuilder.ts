import { MAX_CHANNELS, Renderer } from "./Renderer";

export enum ShaderOp {
    DECLARE,
    SET,
    ADD,
    SUB,
    MUL,
    DIV,
    UNIFORM,
    IF,
    ELSEIF,
    ELSE,
    ENDIF
}

export interface ShaderBuilderOutput {
    mainImage: string[];
    uniforms: string[];
};

export type VariableType = "float" | "vec2" | "vec3" | "vec4";

const getComponentCountByType = (type: VariableType) => {
    switch (type) {
        case "float": return 1;
        case "vec2": return 2;
        case "vec3": return 3;
        case "vec4": return 4;
    }
}

export type DeclareOp = [ShaderOp.DECLARE, name: string, type: VariableType];
export type MathOp = [ShaderOp.ADD | ShaderOp.SUB | ShaderOp.MUL | ShaderOp.DIV | ShaderOp.SET, name: string, expr: string];
export type ConditionalOp = [ShaderOp.IF | ShaderOp.ELSEIF | ShaderOp.ELSE | ShaderOp.ENDIF, condition?: string];

export type ShaderOperation = DeclareOp | MathOp | ConditionalOp;

export class ShaderBuilder {
    private ops: ShaderOperation[];
    private uniforms: { name: string; type: VariableType; offset: number; }[];
    private uniformOffset: number;

    constructor() {
        this.ops = [];
        this.uniforms = [];
        this.uniformOffset = 0;

        this.uniform("resolution", "vec2");
        this.uniform("time", "float");
    }

    public declare(name: string, type: VariableType) {
        this.ops.push([ShaderOp.DECLARE, name, type]);
        return this;
    }

    public set(name: string, expr: string) {
        this.ops.push([ShaderOp.SET, name, expr]);
        return this;
    }

    public add(name: string, expr: string) {
        this.ops.push([ShaderOp.ADD, name, expr]);
        return this;
    }

    public sub(name: string, expr: string) {
        this.ops.push([ShaderOp.SUB, name, expr]);
        return this;
    }

    public mul(name: string, expr: string) {
        this.ops.push([ShaderOp.MUL, name, expr]);
        return this;
    }

    public div(name: string, expr: string) {
        this.ops.push([ShaderOp.DIV, name, expr]);
        return this;
    }

    public if(condition: string) {
        this.ops.push([ShaderOp.IF, condition]);
        return this;
    }

    public elseif(condition: string) {
        this.ops.push([ShaderOp.ELSEIF, condition]);
        return this;
    }

    public else() {
        this.ops.push([ShaderOp.ELSE]);
        return this;
    }

    public endif() {
        this.ops.push([ShaderOp.ENDIF]);
        return this;
    }

    public uniform(name: string, type: VariableType) {
        this.uniforms.push({ name, type, offset: this.uniformOffset });
        this.uniformOffset += getComponentCountByType(type);
        return this;
    }

    public getUniforms() {
        return this.uniforms;
    }

    public build(renderer: Renderer): ShaderBuilderOutput {
        const lines: string[] = [];

        for (const op of this.ops) {
            const [type, ...args] = op;

            switch (type) {
                case ShaderOp.DECLARE: {
                    const [_, varName, varType] = op as DeclareOp;
                    const decl = renderer.getBuilderOptions().declareVar(varName, varType);
                    lines.push(decl);
                    break;
                }

                case ShaderOp.SET:
                case ShaderOp.ADD:
                case ShaderOp.SUB:
                case ShaderOp.MUL:
                case ShaderOp.DIV: {
                    const target = args[0];
                    const expr = args[1];
                    const line = `${target} ${this.getOpAssignmentSymbol(type)} ${expr};`;
                    lines.push(this.replaceExpression(renderer, line));
                    break;
                }
                case ShaderOp.IF:
                case ShaderOp.ELSEIF: {
                    const condition = args[0]!;
                    lines.push(`${type === ShaderOp.IF ? "" : "} else "}if (${this.replaceExpression(renderer, condition)}) {`);
                    break;
                }
                case ShaderOp.ELSE:
                case ShaderOp.ENDIF: {
                    lines.push("}" + (type === ShaderOp.ENDIF ? "" : " else {"));
                    break;
                }
            }
        }

        return {
            mainImage: lines,
            uniforms: this.uniforms
                .map(uniform => renderer.getBuilderOptions().declareVar(uniform.name, uniform.type, true))
        };
    }

    private getOpAssignmentSymbol(op: ShaderOp): string {
        switch (op) {
            case ShaderOp.SET: return "=";
            case ShaderOp.ADD: return "+=";
            case ShaderOp.SUB: return "-=";
            case ShaderOp.MUL: return "*=";
            case ShaderOp.DIV: return "/=";
            default: return "";
        }
    }

    private replaceExpression(renderer: Renderer, expr: string) {
        if (renderer.getType() !== "webgpu") {
            for (let i = 0; i < MAX_CHANNELS; ++i) {
                expr = expr.replace(new RegExp("texture\\s*\\(\\s*" + i + "\\s*,", "g"), "texture(uChannel" + i + ", ");
            }
        }
        return this.replaceComponents(renderer, expr);
    }

    private replaceComponents(renderer: Renderer, expr: string): string {
        const componentMap = renderer.getBuilderOptions().componentMap;

        return expr.replace(/\.[rgba]{1,4}\b/g, (match) => {
            const chars = match.substring(1);
            let out = ".";

            for (let i = 0; i < chars.length; ++i) {
                const c = chars[i];
                out += componentMap[c] ?? c;
            }

            return out;
        });
    }
}

export const defaultShaderBuilder = new ShaderBuilder()
    .declare("uv", "vec2")
    .set("uv", "fragCoord / uniforms.resolution")
    .add("fragColor", "texture(0, uv)");

export const lightShaderBuilder = new ShaderBuilder()
    .declare("uv", "vec2")
    .declare("baseColor", "vec4")
    .set("uv", "fragCoord / uniforms.resolution")
    .set("baseColor", "texture(0, uv)")
    .add("fragColor", "vec4(baseColor.rgb * texture(1, uv).rgb, baseColor.a)");

export const blurHorizontalBuilder = new ShaderBuilder()
    .declare("uv", "vec2")
    .declare("w", "float")
    .declare("sum", "vec4")
    .set("uv", "fragCoord / uniforms.resolution")
    .set("w", "1.0 / uniforms.resolution.x")
    .set("sum",
        `(
    texture(0, uv + vec2(-3.0 * w, 0.0)) * 0.05 +
    texture(0, uv + vec2(-2.0 * w, 0.0)) * 0.1 +
    texture(0, uv + vec2(-1.0 * w, 0.0)) * 0.2 +
    texture(0, uv) * 0.3 +
    texture(0, uv + vec2(1.0 * w, 0.0)) * 0.2 +
    texture(0, uv + vec2(2.0 * w, 0.0)) * 0.1 +
    texture(0, uv + vec2(3.0 * w, 0.0)) * 0.05
)`
    )
    .set("fragColor", "sum");

export const blurVerticalBuilder = new ShaderBuilder()
    .declare("uv", "vec2")
    .declare("h", "float")
    .declare("sum", "vec4")
    .set("uv", "fragCoord / uniforms.resolution")
    .set("h", "1.0 / uniforms.resolution.y")
    .set("sum",
        `(
    texture(0, uv + vec2(0.0, -3.0 * h)) * 0.05 +
    texture(0, uv + vec2(0.0, -2.0 * h)) * 0.1 +
    texture(0, uv + vec2(0.0, -1.0 * h)) * 0.2 +
    texture(0, uv) * 0.3 +
    texture(0, uv + vec2(0.0, 1.0 * h)) * 0.2 +
    texture(0, uv + vec2(0.0, 2.0 * h)) * 0.1 +
    texture(0, uv + vec2(0.0, 3.0 * h)) * 0.05
)`
    )
    .set("fragColor", "sum");