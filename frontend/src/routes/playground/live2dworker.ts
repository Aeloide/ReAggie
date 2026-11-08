/// <reference lib="webworker" /> 

import * as live2d from "../../CubismSdk/Framework/src/live2dcubismframework";
import { CubismModel } from "../../CubismSdk/Framework/src/model/cubismmodel";
import { CubismMatrix44 } from "@framework/math/cubismmatrix44";
import * as safegl from "safe-gl";
import { CubismUserModel } from "@framework/model/cubismusermodel";
import { CubismMotionManager } from "@framework/motion/cubismmotionmanager";
import { csmVector } from "@framework/type/csmvector";
import { CubismShaderManager_WebGL } from "@framework/rendering/cubismshader_webgl";

export const construct = async (modelName: string, canv: OffscreenCanvas) => {

    live2d.CubismFramework.startUp();
    live2d.CubismFramework.initialize(16 * 1024 * 1024);




    const ctx = canv.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: true,
    });

    if (!ctx) {
        throw new Error("Live2D: WebGL2 context is unavailable");
    }

    CubismShaderManager_WebGL.getInstance().setGlContext(ctx);

    const loadResource = async (url: string): Promise<Response> => {
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`Live2D: Failed to load ${url}: HTTP ${res.status}`);
        }

        return res;
    };

    const modelUrl = `/${modelName}.model3.json`;

    const modelJson = await (await loadResource(modelUrl)).json();
    const texturePath = modelJson.FileReferences?.Textures?.[0];

    if (typeof texturePath !== "string" || !texturePath) {
        throw new Error(`Live2D: Texture path missing in ${modelUrl}`);
    }

    const basePath = modelName.substring(0, modelName.lastIndexOf("/") + 1);
    const textureUrl = `/${basePath}${texturePath}`;

    const [, modeldata, motiondata, img] = await Promise.all([
        CubismShaderManager_WebGL.getInstance().getShader(ctx).generateShaders(),
        (await loadResource(`/${modelName}.moc3`)).arrayBuffer(),
        (await loadResource(`/${modelName}.motion3.json`)).arrayBuffer(),
        (async () => {
            const res = await loadResource(textureUrl);
            const blob = await res.blob();

            if (!blob.type.startsWith("image/")) {
                throw new Error(
                    `Live2D: Expected an image at ${textureUrl}, received ${blob.type || "unknown content type"}`
                );
            }

            return createImageBitmap(blob, {
                premultiplyAlpha: "premultiply",
                colorSpaceConversion: "none",
            });
        })(),
    ]);







    const motionManager = new CubismMotionManager();
    const moc = Live2DCubismCore.Moc.fromArrayBuffer(modeldata);
    const mocmodel = Live2DCubismCore.Model.fromMoc(moc);
    mocmodel.update();
    const model = new CubismModel(mocmodel);
    model.loadParameters();
    model.update();
    ctx.clearColor(0, 0, 0, 0);
    ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
    ctx.enable(ctx.BLEND);
    const gl = ctx;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);

    const glx = new safegl.WebGLState(ctx);
    const txt = glx.createTexture(["RGBA8", "RGBA", "UNSIGNED_BYTE"], img, undefined, {
        TEXTURE_MIN_FILTER: "LINEAR_MIPMAP_LINEAR",
        TEXTURE_MAG_FILTER: "LINEAR",
    });
    gl.bindTexture(gl.TEXTURE_2D, txt.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);

    const usermodel = new CubismUserModel();
    usermodel.loadModel(modeldata);
    usermodel.createRenderer(1, 1);

    const renderer = usermodel.getRenderer();
    // debugger;
    renderer.setIsPremultipliedAlpha(true);
    renderer.startUp(ctx);
    const matrix = new CubismMatrix44();
    matrix.scale(1.5, 1.5);
    renderer.setMvpMatrix(matrix);
    renderer.bindTexture(0, txt.tex);

    const motion = usermodel.loadMotion(motiondata, motiondata.byteLength, "Scene1");
    img.close();
    motionManager.startMotion(motion, false);
    motionManager._eventCallBack = (caller, value) => {
        console.log(value.s);
    };
    motion.setEffectIds(new csmVector(), new csmVector());
    motion.setLoop(true);
    usermodel.setUpdating(true);
    self.addEventListener("message", (ev) => {
        const dt = ev.data;
        ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
        motionManager.updateMotion(usermodel.getModel(), dt);
        usermodel.getModel().update();
        renderer.drawModel();
    });
    self.postMessage("inited");
};

// self.addEventListener("message", async (ev) => {
//     const { modelName, ofc } = ev.data;
//     construct(modelName, ofc);

// })
