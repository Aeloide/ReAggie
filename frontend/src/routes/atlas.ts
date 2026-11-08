import { Camera2D } from "$room/Camera2D";
import { SpriteDrawer3 } from "$room/SpriteDrawer";
import { WebGLState } from "safe-gl";
import sadshader from "./sad.glsl";
import { shuffleArray } from "../utils";

export const buildAtlasRenderer = (glx: WebGLState, camera: Camera2D, atlas: HTMLImageElement): SpriteDrawer3<sadshader, {
    readonly spos: "vec2";
    readonly angle: "float";
    readonly scale: "float";
    readonly source: "vec4";
    readonly pos: "vec2";
}, "spos"> => {
    const atlastex = glx.createTexture(["RGBA", "RGBA", "UNSIGNED_BYTE"], atlas, undefined, {
        TEXTURE_MIN_FILTER: 'LINEAR_MIPMAP_LINEAR',
        TEXTURE_MAG_FILTER: 'LINEAR'
    });
    const sad = new sadshader(glx);
    sad.uniforms.camera.data = camera.projectionMatrix;
    sad.bindings.spritesheet.texture = atlastex;
    return new SpriteDrawer3(glx, sad, "spos");
};

export const updateBackground = async () => {
    // apparently chrome never cleans that up until the tab is closed, so refreshing 16 times in a row causes a crash :/
    const canvas = new OffscreenCanvas(1024, 1024);
    const ctx = canvas.getContext("webgl2")!;
    ctx.clearColor(0, 0, 0, 0);
    ctx.clear(ctx.COLOR_BUFFER_BIT);

    const glx = new WebGLState(ctx);
    const cam = new Camera2D(
        canvas,
        ctx,
        -1024,
        1024,
        () => 1,
        () => true,
        () => true,
    );
    cam.update(1, 0, 0);

    const meta = [
        462, 0, 213, 358, 0, 373, 253, 341, 0, 0, 245, 373, 675, 0, 246, 343, 758, 373, 253, 329, 253, 373, 238, 338, 491, 373, 267, 331, 0, 714, 215,
        327, 215, 714, 282, 298, 497, 714, 243, 262, 740, 714, 283, 246, 921, 0, 205, 288, 245, 0, 217, 370,
    ];

    const imgurl = "7db467488a849e24cde47ea4176989cc.png";

    const img = new Image();
    await new Promise((_) => {
        img.onload = _;
        img.src = imgurl;
    });

    const hints = [0, 1, 2, 3, 4, 5, 6, 7, 12];
    const nohint = [8, 9, 10, 11, 12]; //huh
    shuffleArray(hints);
    shuffleArray(nohint);
    const bepis = shuffleArray([...hints.slice(0, 3), ...nohint.slice(0, 5)]);
    // pick 3 hints and 5 non-hints

    const renderer = buildAtlasRenderer(glx, cam, img);
    // coordinates are the pic center

    const inst = renderer.allocInst();
    function drawAt(idx: number, px: number, py: number, s = 1, a = ((Math.random() - 0.5) * Math.PI) / 4, o = 1) {
        const [x, y, w, h] = meta.slice(idx * 4, (idx + 1) * 4);
        inst.angle = a;
        inst.scale = s;
        inst.pos = [px, py];
        inst.source = [x, y, w, h];
        inst.sync();
        renderer.prog.uniforms.tint.data = [145 / 255, 145 / 255, 161 / 255, o];
        renderer.finalizeDraw();
    }

    const lerp = (a: number, b: number, t: number) => a + t * (b - a);
    const width = ctx.drawingBufferWidth;
    const height = ctx.drawingBufferHeight;
    let halfw = width / 2;
    let halfh = height / 2;
    let fifthw = width / 5;
    let fourth = height / 4;
    let xy = [0, 0];
    let flip = 0;
    for (let drawing of bepis) {
        const scale = lerp(0.7, 0.9, Math.random());
        const angle = lerp(-Math.PI / 6, Math.PI / 6, Math.random());

        let off = flip & 1 ? fifthw : 0;

        drawAt(drawing, off + xy[0] + 0, xy[1] + 0, scale, angle);
        drawAt(drawing, off + xy[0] + width, xy[1] + 0, scale, angle);
        drawAt(drawing, off + xy[0] + 0, xy[1] + height, scale, angle);
        drawAt(drawing, off + xy[0] + width, xy[1] + height, scale, angle);
        // console.log(xy);
        xy[0] += halfw;
        if (xy[0] + off >= width) {
            xy[0] = 0;
            flip++;
            xy[1] += fourth;
        }
    }
    const blob = await canvas.convertToBlob();

    if (blob) {
        const url = URL.createObjectURL(blob);
        const bg = document.querySelector(".procbg")! as HTMLDivElement;
        bg.style.backgroundImage = `url(${url})`;
    }
};