import type { DeclaratorListNode, Program } from "@shaderfrog/glsl-parser/ast";
import prepr from "prepr";
import { parser } from "@shaderfrog/glsl-parser";
import esbuild from "esbuild";

const vvv = () => ({
    name: "glsl-transform",

    transform(code: any, id: any, preservets?: { ssr?: boolean | undefined; ts?: true; }) {
        if (!id.endsWith(".glsl")) return;
        console.log(id);

        const vertexshadercode = prepr(code, { VERTEX: "1", varying: 'out' });
        const fragmentshadercode = prepr(code, { FRAGMENT: "1", varying: 'in' });

        type UniformDecl = { name: string, type: string; };
        const extractDecl = (d: string) => (ast: Program) => {
            return (ast.program.flatMap(e => e.type == "declaration_statement" &&
                e.declaration.type == "declarator_list" &&
                (e.declaration.specified_type.qualifiers?.filter(q => (q.type == "keyword" && q.token == d))?.length || 0) > 0 &&
                e.declaration).filter(e => e) as DeclaratorListNode[])
                .map(d => ({
                    name: d.declarations.map(e => e.identifier)[0].identifier,
                    type: d.specified_type.specifier.specifier.type == "keyword" && d.specified_type.specifier.specifier.token || ''
                }));
        };

        const extractUniforms = extractDecl("uniform");
        const extractInputs = extractDecl("in");

        function mergeUniforms(a: UniformDecl[], b: UniformDecl[]) {
            let ret = [...a];
            b.forEach(d => (!a.some(c => c.name == d.name)) && ret.push(d));
            return ret;
        }

        let vast: Program;
        let fast: Program;
        try {
            vast = parser.parse(vertexshadercode, {});
        } catch (e) {
            console.log('FAILED TO PARSE VSHADER', e);
            return '';
        }
        try {
            fast = parser.parse(fragmentshadercode, {});
        } catch (e) {
            console.log('FAILED TO PARSE FSHADER', e);
            return '';
        }
        //const uniformsv = extractUniforms(ast);
        const vuniforms = (extractUniforms(vast));
        const funiforms = (extractUniforms(fast));
        const uniforms = mergeUniforms(vuniforms, funiforms);
        const bindings: { name: string, type: string; }[] = [];
        for (let i = 0; i < uniforms.length;) {
            if (uniforms[i].type.includes('sampler'))
                bindings.push(...uniforms.splice(i, 1));
            else
                ++i;
        }
        const getSamplerTag = (s: string) => {
            if (s.startsWith("isampler"))
                return 'IntegerInternalFormats'
            return 'OtherInternalFormats';
        };

        const getSamplerDims = (s: string) => {
            if (s.includes("Array") || s.includes('3D')) // TODO: split those
                return "[number, number, number]";
            return "[number, number]";
        };

        const typeToUniform = (t: string): keyof WebGL2RenderingContext | undefined => {
            // not atomic
            switch (t) {
                case 'float':
                    return 'uniform1f';
                case 'int':
                case 'bool':
                    return 'uniform1i';
                case 'uint':
                    return 'uniform1ui';
            }
            // maybe a sampler
            if (t.includes('sampler'))
                return 'uniform1i';

            // maybe a vector
            let vidx = t.indexOf('vec');
            if (vidx >= 0) {
                const n = t.at(-1) as '2' | '3' | '4';
                switch (t[0]) {
                    case 'v':
                        return `uniform${n}fv`;
                    case 'b':
                    case 'i':
                        return `uniform${n}iv`;
                    case 'u':
                        return `uniform${n}uiv`;
                }
            }
            if (t.includes('mat')) {
                if (t.length == 4) {
                    const n = t.at(-1) as '2' | '3' | '4';
                    return `uniformMatrix${n}fv`;
                } else {
                    const n = t.at(-1) as '2' | '3' | '4';
                    const m = t.at(-3) as '2' | '3' | '4';
                    if (n === m)
                        return `uniformMatrix${n}fv`;
                    return `uniformMatrix${n}x${m}fv` as any; // typescript...
                }
            }
        };

        const inputs = (extractInputs(vast));
        const inputstr = JSON.stringify(Object.fromEntries(inputs.map(i => [i.name, i.type])));
        const VBA = `VertexBufferAssembly<${inputstr}>`;
        //  console.log(JSON.stringify(ast, null, 2));


        const buildUniformCall = (t: string) => {
            const ut = typeToUniform(t);
            if (!ut)
                throw new Error("Unexpected uniform type :" + t);
            if (ut.includes('Matrix'))
                return `gl.${ut}(loc, false, v)`
            return `gl.${ut}(loc, v)`
        }
        const tcode = `import { TextureSetter, UniformSetter, VertexBufferAssembly, IntegerInternalFormats, OtherInternalFormats, WebGLState, CompleteDesc, Shader } from "safe-gl";

export default class implements Shader {
    readonly input = ${inputstr} as const;

    uniforms!: {
        ${uniforms.map(u => `${u.name}: UniformSetter<${['int', 'float', 'bool'].includes(u.type) ? 'number' : 'number[]'}>`).join(';\n')}
    };

    bindings!: {
    ${bindings.map(b => `${b.name}: TextureSetter<${getSamplerTag(b.type)}>`).join(';\n')}
    };

    input_assembly?: ${VBA};

    setAssembly(t: ${VBA}) {
        this.input_assembly = t;
        t.preparePipelineInput(this.#shader);
        this.#completeProgram();
    }

    #shader;
    #vs; #fs;
    #gl;
    #locs;
    constructor(gls: WebGLState) {
        const gl = this.#gl = gls.gl;
        [this.#shader, this.#vs, this.#fs] = gls.buildProgram("#version 300 es\\n"+${JSON.stringify(vertexshadercode)}, "#version 300 es\\n" + ${JSON.stringify(fragmentshadercode)});
        const program = this.#shader;
        this.uniforms = {
            ${uniforms.map(b => `${b.name}: new UniformSetter(v => {})`).join(',')}
        };

        this.bindings = {
            ${bindings.map(b => `${b.name}: new TextureSetter(v => {})`).join(',')}
        };
    }

    #completeProgram() {
        const program = this.#shader;
        const gl = this.#gl;
        gl.linkProgram(program);

        ${uniforms.map(b => 
            `{ const loc = gl.getUniformLocation(program, "${b.name}")
               this.uniforms['${b.name}'].setter = v => ${buildUniformCall(b.type)};
               this.uniforms['${b.name}'].dirty = true; }`).join('\n')}

        ${bindings.map(b => 
            `{ const loc = gl.getUniformLocation(program, "${b.name}")
               this.bindings['${b.name}'].us.setter = v => gl.uniform1i(loc, v);
               this.bindings['${b.name}'].us.dirty = true; }`).join('\n')}

        const info = gl.getProgramInfoLog(program);
        if (info) {
            console.warn(info);
        }
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error("Shader linking failed.");
        }
        // dont delete/detach vs/fs because we might "complete" multiple times
    }

    #doUniformSync() {
    ${uniforms.map(u => `this.uniforms.${u.name}.sync();`).join('\n')}
    }

    #doBindingSync() {
    ${bindings.map(u => `this.bindings.${u.name}.sync();`).join('\n')}
    }

    #doBindingDetach() {
    ${bindings.map(u => `this.bindings.${u.name}.texture?.disable();`).join('\n')}
    }

    execDraw(cb: (gl: WebGL2RenderingContext) => void) {
        const gl = this.#gl;
        const oldshader = gl.getParameter(gl.CURRENT_PROGRAM);
        gl.useProgram(this.#shader);

        this.#doBindingSync();
        this.#doUniformSync();

        this.input_assembly?.using(cb);

        this.#doBindingDetach();
        gl.useProgram(oldshader);
    }
 };
`;
        console.log(tcode);
        if (!preservets?.ts) {
            console.log(JSON.stringify(preservets));
            return esbuild.transformSync(tcode, { loader: 'ts' }).code;
        }
        return tcode;

    }
});

export default vvv;
