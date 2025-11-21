import { MAX_CHANNELS, Renderer } from "./Renderer";

export enum ShaderOp {
    DECLARE,
    SET,
    ADD,
    SUB,
    MUL,
    DIV,
    UNIFORM
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

export type ShaderOperation = DeclareOp | MathOp;

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
            const [type, name, arg] = op;

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
                    const target = name;
                    const expr = this.replaceExpression(renderer, arg);
                    const line = `${target} ${this.getOpAssignmentSymbol(type)} ${expr};`;
                    lines.push(this.replaceComponents(renderer, line));
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
        return expr;
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