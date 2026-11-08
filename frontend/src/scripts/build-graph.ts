
import { build } from "bun";
import { join, dirname, resolve } from "path";

console.log("Building graph generator...");

const result = await build({
    entrypoints: ["src/scripts/generate-replay-graph.ts"],
    outdir: "./dist",
    naming: "replay-graph.js",
    target: "bun",
    plugins: [
        {
            name: "app-resolve",
            setup(build) {
                build.onResolve({ filter: /^\$app\/navigation$/ }, args => {
                    return { path: join(process.cwd(), "src/scripts/mocks/app-navigation.ts") }
                });
            },
        },
        {
            name: "raw-loader",
            setup(build) {
                build.onResolve({ filter: /\?raw$/ }, async args => {
                    const cleanPath = args.path.replace(/\?raw$/, "");
                    const absolutePath = resolve(dirname(args.importer), cleanPath);
                    return {
                        path: absolutePath,
                        namespace: "raw-file"
                    }
                });
                build.onLoad({ filter: /.*/, namespace: "raw-file" }, async (args) => {
                    const file = Bun.file(args.path);
                    return {
                        contents: await file.text(),
                        loader: "text"
                    };
                });
            }
        },
        {
            name: "asset-mocks",
            setup(build) {
                // Aseprite mock
                build.onLoad({ filter: /\.aseprite$/ }, args => {
                    return {
                        contents: `
                    export default {
                        flags: {
                            sailor: 0, sailor2: 1, normal: 2, normal2: 3,
                            bowl: 4, messy: 5, mushroom: 6, ribbon: 7, twintails: 8,
                            rimo: 9, long: 10, braided: 11, puffy: 12,
                            jear: 13, gear: 14
                        },
                        anims: {},
                        width: 100,
                        height: 100
                    };`,
                        loader: "js"
                    };
                });
                // GLSL class mock (for non-raw imports)
                build.onLoad({ filter: /\.glsl$/ }, args => {
                    return {
                        contents: `
                    export default class Shader {
                        constructor() {
                            this.uniforms = { camera: { data: [] }, dims: { data: [] } };
                            this.bindings = { fbuffer: {} };
                        }
                        setAssembly() {}
                    }`,
                        loader: "js"
                    };
                });
                // PNG mock
                build.onLoad({ filter: /\.png$/ }, args => {
                    return {
                        contents: `export default "data:image/png;base64,FAKE";`,
                        loader: "js"
                    };
                });
            }
        }
    ],
});

if (!result.success) {
    console.error("Build failed");
    for (const message of result.logs) {
        console.error(message);
    }
    process.exit(1);
} else {
    console.log("Build successful! Output: dist/replay-graph.js");
}
