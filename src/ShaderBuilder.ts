import { Renderer } from "./Renderer";

export enum ShaderOp {
    DECLARE,
    SET,
    ADD,
    SUB,
    MUL,
    DIV
}

export type VariableType = "float" | "vec2" | "vec3" | "vec4";

export type DeclareOp = [ShaderOp.DECLARE, name: string, type: VariableType, mutable?: boolean];
export type MathOp = [ShaderOp.ADD | ShaderOp.SUB | ShaderOp.MUL | ShaderOp.DIV | ShaderOp.SET, name: string, expr: string];

export type ShaderOperation = DeclareOp | MathOp;

export class ShaderBuilder {
    private ops: ShaderOperation[];

    constructor() {
        this.ops = [];
    }

    public declare(name: string, type: VariableType, mutable = true) {
        this.ops.push([ShaderOp.DECLARE, name, type, mutable]);
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

    public build(renderer: Renderer): string {
        const lines: string[] = [];

        for (const op of this.ops) {
            const [type, name, arg] = op;

            switch (type) {
                case ShaderOp.DECLARE: {
                    const [_, varName, varType, mutable] = op as DeclareOp;
                    const decl = renderer.getBuilderOptions().declareVar(varName, varType, mutable);
                    lines.push(decl);
                    break;
                }

                case ShaderOp.SET:
                case ShaderOp.ADD:
                case ShaderOp.SUB:
                case ShaderOp.MUL:
                case ShaderOp.DIV: {
                    const target = this.replaceVariables(renderer, name);
                    const expr = this.replaceVariables(renderer, arg as string);
                    const line = `${target} ${this.getOpAssignmentSymbol(type)} ${expr};`;
                    lines.push(this.replaceComponents(renderer, line));
                    break;
                }
            }
        }

        return lines.join("\n");
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


    private replaceVariables(renderer: Renderer, expr: string): string {
        return expr.replace(/\$[A-Za-z0-9_]+/g, (match) => {
            return renderer.getBuilderOptions().uniformMap[match] || match.slice(1);
        });
    }
}