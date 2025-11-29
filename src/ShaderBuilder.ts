import { MAX_CHANNELS, Renderer } from "./Renderer";

export enum ShaderOp {
    DECLARE_VAR,
    DECLARE_FN,
    RETURN,
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
    functions: string[];
    uniforms: string[];
};

export type VariableType = "float" | "vec2" | "vec3" | "vec4";
export type FunctionArg = [name: string, type: VariableType];

const getComponentCountByType = (type: VariableType) => {
    switch (type) {
        case "float": return 1;
        case "vec2": return 2;
        case "vec3": return 3;
        case "vec4": return 4;
    }
}

export type DeclareVarOp = [ShaderOp.DECLARE_VAR, name: string, type: VariableType];
export type DeclareFnOp = [ShaderOp.DECLARE_FN, name: string, returnType: VariableType | null, ...args: FunctionArg[]];
export type MathOp = [ShaderOp.ADD | ShaderOp.SUB | ShaderOp.MUL | ShaderOp.DIV | ShaderOp.SET, name: string, expr: string];
export type ConditionalOp = [ShaderOp.IF | ShaderOp.ELSEIF, condition: string];
export type ReturnOp = [ShaderOp.RETURN, expr: string];

export type ShaderOperation = DeclareVarOp | MathOp | ConditionalOp | ReturnOp | [ShaderOp.ELSE | ShaderOp.ENDIF];

export class ShaderBuilder {
    public static DEBUG = false;

    private uniforms: { name: string; type: VariableType; offset: number; }[];
    private uniformOffset: number;
    private functions: { declaration: DeclareFnOp, ops: ShaderOperation[] }[];

    constructor() {
        this.functions = [];
        this.uniforms = [];
        this.uniformOffset = 0;

        this.uniform("resolution", "vec2");
        this.uniform("time", "float");
    }

    private pushOp(op: ShaderOperation) {
        if (!this.functions.length) {
            throw new Error("No function declaration");
        }
        this.functions[this.functions.length - 1].ops.push(op);
    }

    public declareFn(name: string, returnType: VariableType | null, ...args: FunctionArg[]) {
        this.functions.push({ declaration: [ShaderOp.DECLARE_FN, name, returnType, ...args], ops: [] });
        return this;
    }

    public mainImage() {
        return this.declareFn("mainImage", "vec4", ["fragCoord", "vec2"])
            .declareVar("fragColor", "vec4");
    }

    public return(expr: string) {
        this.pushOp([ShaderOp.RETURN, expr]);
        return this;
    }

    public declareVar(name: string, type: VariableType) {
        this.pushOp([ShaderOp.DECLARE_VAR, name, type]);
        return this;
    }

    public set(name: string, expr: string) {
        this.pushOp([ShaderOp.SET, name, expr]);
        return this;
    }

    public add(name: string, expr: string) {
        this.pushOp([ShaderOp.ADD, name, expr]);
        return this;
    }

    public sub(name: string, expr: string) {
        this.pushOp([ShaderOp.SUB, name, expr]);
        return this;
    }

    public mul(name: string, expr: string) {
        this.pushOp([ShaderOp.MUL, name, expr]);
        return this;
    }

    public div(name: string, expr: string) {
        this.pushOp([ShaderOp.DIV, name, expr]);
        return this;
    }

    public if(condition: string) {
        this.pushOp([ShaderOp.IF, condition]);
        return this;
    }

    public elseif(condition: string) {
        this.pushOp([ShaderOp.ELSEIF, condition]);
        return this;
    }

    public else() {
        this.pushOp([ShaderOp.ELSE]);
        return this;
    }

    public endif() {
        this.pushOp([ShaderOp.ENDIF]);
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
        const functions: string[] = [];

        for (let i = 0; i < this.functions.length; ++i) {
            const lines: string[] = [];

            const [_, fnName, returnType, ...args] = this.functions[i].declaration;
            lines.push(`${renderer.getBuilderOptions().declareFn(fnName, returnType, ...args)} {`);

            const ops = [...this.functions[i].ops];
            if (fnName === "mainImage") {
                ops.push([ShaderOp.RETURN, "fragColor"]);
            }

            let nesting = 0;
            for (const op of ops) {
                const type = op[0];

                let fnLine;

                switch (type) {
                    case ShaderOp.DECLARE_VAR: {
                        const [_, varName, varType] = op as DeclareVarOp;
                        fnLine = renderer.getBuilderOptions().declareVar(varName, varType);
                        break;
                    }

                    case ShaderOp.SET:
                    case ShaderOp.ADD:
                    case ShaderOp.SUB:
                    case ShaderOp.MUL:
                    case ShaderOp.DIV: {
                        const [_, target, expr] = op as MathOp;
                        fnLine = this.replaceExpression(renderer, `${target} ${this.getOpAssignmentSymbol(type)} ${expr};`);
                        break;
                    }
                    case ShaderOp.IF:
                    case ShaderOp.ELSEIF: {
                        const condition = (op as ConditionalOp)[1];
                        fnLine = `${type === ShaderOp.IF ? "" : "} else "}if (${this.replaceExpression(renderer, condition)}) {`;
                        break;
                    }
                    case ShaderOp.ELSE:
                    case ShaderOp.ENDIF: {
                        fnLine = "}" + (type === ShaderOp.ENDIF ? "" : " else {");
                        break;
                    }
                    case ShaderOp.RETURN: {
                        const expr = (op as ReturnOp)[1];
                        fnLine = `return ${this.replaceExpression(renderer, expr)};`;
                        break;
                    }
                }

                fnLine = fnLine.split("\n")
                    .map(str => {
                        for (let i = 0; i < nesting + 1; ++i) {
                            str = "    " + str;
                        }
                        return str;
                    })
                    .join("\n");


                if (type === ShaderOp.IF) nesting += 1;
                else if (type === ShaderOp.ENDIF) nesting -= 1;

                lines.push(fnLine);
            }

            lines.push("}");

            functions.push(lines.join("\n"));
        }

        if (ShaderBuilder.DEBUG) {
            console.log(functions.join("\n\n"));
        }

        return {
            functions,
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
                expr = expr
                    .replace(new RegExp("texture\\s*\\(\\s*" + i + "\\s*,", "g"), "texture(uChannel" + i + ", ")
                    .replaceAll("float", renderer.getBuilderOptions().replaceType("float"))
                    .replaceAll("vec2", renderer.getBuilderOptions().replaceType("vec2"))
                    .replaceAll("vec3", renderer.getBuilderOptions().replaceType("vec3"))
                    .replaceAll("vec4", renderer.getBuilderOptions().replaceType("vec4"))
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
    .mainImage()
    .declareVar("uv", "vec2")
    .set("uv", "fragCoord / uniforms.resolution")
    .add("fragColor", "texture(0, uv)")

export const lightShaderBuilder = new ShaderBuilder()
    .mainImage()
    .declareVar("uv", "vec2")
    .declareVar("baseColor", "vec4")
    .set("uv", "fragCoord / uniforms.resolution")
    .set("baseColor", "texture(0, uv)")
    .add("fragColor", "vec4(baseColor.rgb * texture(1, uv).rgb, baseColor.a)");

export const blurHorizontalBuilder = new ShaderBuilder()
    .mainImage()
    .declareVar("uv", "vec2")
    .declareVar("w", "float")
    .declareVar("sum", "vec4")
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
    .mainImage()
    .declareVar("uv", "vec2")
    .declareVar("h", "float")
    .declareVar("sum", "vec4")
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