import jigshadervs from "./jigshader_vs.glsl?raw";
import jigshaderfs from "./jigshader_fs.glsl?raw";
import boardShadervs from "./boardShader_vs.glsl?raw";
import boardShaderfs from "./boardShader_fs.glsl?raw";
import shader4vs from "./shadow4_vs.glsl?raw";
import shader4fs from "./shadow4_fs.glsl?raw";
import { addLineNumbers } from "../utils";

type Shader = {
    program: WebGLProgram;
    uniforms: Record<string, WebGLUniformLocation>;
};

/**
 * Compile a shader and log the output.
 * @param gl WebGL Context
 * @param shaderType 
 * @param glsl GLSL Shader code
 */
export function compileShader<T extends WebGLRenderingContextBase>(gl: T, shaderType: T["VERTEX_SHADER" | "FRAGMENT_SHADER"], glsl: string): WebGLShader {
    if (!gl) throw new Error("GPU rendering is disabled");
    const shader = gl.createShader(shaderType);
    if (!shader) throw new Error("Failed to create shader");

    gl.shaderSource(shader, glsl);
    gl.compileShader(shader);
    const info = gl.getShaderInfoLog(shader);
    if (info) {
        console.warn(`${info}\n${shaderType == gl.VERTEX_SHADER ? "Vertex" : "Fragment"} Shader:\n${addLineNumbers(glsl)}`);
    }
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Shader compilation failed.`);
    }
    return shader;
}

/**
 * Compiles a shader program and binds select attribute locations.
 * Sampler2D uniforms are bound in alphabetical order of their identifier.
 * ```
 * // Binding-location: attribute-identifier
 * 0: position
 * 1: texcoords
 * 2: vertexColor
 * ```
 * @param gl WeblGL Context
 * @param glsl Vertex and Fragment GLSL shader code
 */
function createShaderProgram(gl: WebGL2RenderingContext | WebGLRenderingContext, glsl: { vertex: string; fragment: string; }) {
    const vertexShader = compileShader(gl, gl!.VERTEX_SHADER, glsl.vertex);
    const fragmentShader = compileShader(gl, gl!.FRAGMENT_SHADER, glsl.fragment);
    if (!gl) return;
    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create program");
    gl.attachShader(program, vertexShader!);
    gl.attachShader(program, fragmentShader!);
    gl.bindAttribLocation(program, 0, "position");
    gl.bindAttribLocation(program, 1, "texcoords");
    gl.bindAttribLocation(program, 2, "vertexColor");
    gl.linkProgram(program);

    const info = gl.getProgramInfoLog(program);
    if (info) {
        console.warn(info);
    }
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("Shader linking failed.");
    }

    gl.deleteShader(vertexShader!);
    gl.deleteShader(fragmentShader!);
    gl.useProgram(program);
    const uniforms: Record<string, WebGLUniformLocation> = {};
    const textureUnits: string[] = [];
    const uniformDeclarations = (glsl.vertex + "\n" + glsl.fragment).match(/uniform [a-z0-9_]+ [a-z_][a-z0-9_]*/gi) || [];
    for (const declaration of uniformDeclarations) {
        const [, dataType, identifier] = declaration.split(" ");
        const location = gl.getUniformLocation(program, identifier);
        if (!location) continue;
        uniforms[identifier] = location;
        if ("sampler2D" === dataType) {
            textureUnits.push(identifier);
        }
    }
    textureUnits.sort().forEach((identifier, i) => gl.uniform1i(uniforms[identifier], i));
    return {
        program: program,
        uniforms: uniforms
    };
}

// used to draw the actual pieces
export let jigshader: Shader | undefined;

// used to draw rectangles, like the board or selection rectangle
export let boardShader: Shader | undefined;

// used to draw drop shadows
export let shader4: Shader | undefined;

export const initShader = (gpucontext: WebGL2RenderingContext | WebGLRenderingContext) => {
    jigshader = createShaderProgram(gpucontext, {
        vertex: jigshadervs,
        fragment: jigshaderfs
    });

    boardShader = createShaderProgram(gpucontext, {
        vertex: boardShadervs,
        fragment: boardShaderfs
    });

    shader4 = createShaderProgram(gpucontext, {
        vertex: shader4vs,
        fragment: shader4fs
    });
};