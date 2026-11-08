import { addLineNumbers } from "./utils";

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
