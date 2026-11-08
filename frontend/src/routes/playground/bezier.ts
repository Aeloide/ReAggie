import { smul, sub, type vec2 } from "$room/vec2";
import { IndexBuffer, VertexBuffer, VertexBufferAssembly, WebGLState } from "safe-gl";
import cubic from "./cubic.glsl";
import type { Curve } from "$room/game";

const determinant_3x3 = ([x0, y0]: vec2, w0: number,
    [x1, y1]: vec2, w1: number,
    [x2, y2]: vec2, w2: number) =>
    x0 * y1 * w2 +
    y0 * w1 * x2 +
    w0 * x1 * y2 -
    w0 * y1 * x2 -
    y0 * x1 * w2 -
    x0 * w1 * y2;

const is_inside_circle = (a: vec2, b: vec2, c: vec2, v: vec2) => {
    const dxsq = v[0] * v[0];
    const dysq = v[1] * v[1];

    const r = determinant_3x3(sub(a, v),
        a[0] * a[0] - dxsq + a[1] * a[1] - dysq,
        sub(b, v),
        b[0] * b[0] - dxsq + b[1] * b[1] - dysq,
        sub(c, v),
        c[0] * c[0] - dxsq + c[1] * c[1] - dysq,
    );

    if (is_clockwise(a, b, c))
        return (r > 0);
    return (r < 0);

};

const is_clockwise = (a: vec2, b: vec2, c: vec2) => {
    const e0: vec2 = sub(a, b);
    const e1: vec2 = sub(c, b);
    return (e0[0] * e1[1] - e0[1] * e1[0] < 0) // dot
}

type vec3 = [number, number, number];
let pptr = 0;
let posbuf = new Float32Array(1024);
const draw_triangle_tc = (a: vec2, b: vec2, c: vec2,
    st0: vec3, st1: vec3, st2: vec3) => {
    posbuf.set([a, b, c].flat(), pptr);
    pptr += 6;
    posbuf.set([st0, st1, st2].flat(), pptr);
    pptr += 9;
}

const draw_delauny_mesh = (a: vec2, b: vec2, c: vec2, d: vec2, st: number[]) => {
    let curvedir = is_clockwise(a, b, c) ? 1 : -1;
    const tests = [
        [0, 1, 2, 3],
        [0, 2, 3, 1],
        [1, 2, 3, 0],
        [0, 1, 3, 2]
    ]
    const points = [a, b, c, d];
    for (const t of tests) {
        if (!is_inside_circle(points[t[0]], points[t[1]], points[t[2]], points[t[3]]))
            draw_triangle_tc(points[t[0]], points[t[1]], points[t[2]],
                st.slice(t[0] * 3, (t[0] + 1) * 3) as vec3,
                st.slice(t[1] * 3, (t[1] + 1) * 3) as vec3,
                st.slice(t[2] * 3, (t[2] + 1) * 3) as vec3
            );
    }
}


enum CurveType {
    Unknown,
    Serpentine,
    Loop, CuspInfInflection, CuspInfCusp, Quadratic, Line
}

const determine_type = (a: vec3, b: vec3, c: vec3, d: vec3,
    b0: vec3, b1: vec3, b2: vec3, b3: vec3
): [CurveType, vec3[], number[]] => {
    b0 = [...a];
    b1 = vec3_add(vec3_mul(a, -3), vec3_mul(b, 3));
    b2 = vec3_add(
        vec3_mul(a, 3),
        vec3_mul(b, -6),
        vec3_mul(c, 3));
    b3 = vec3_add(
        vec3_mul(a, -1),
        vec3_mul(b, 3),
        vec3_mul(c, -3),
        d
    );


    const dv = [0, 0, 0, 0];
    dv[0] = determinant_3x3(
        [b3[0], b3[1]], b3[2],
        [b2[0], b2[1]], b2[2],
        [b1[0], b1[1]], b1[2]);
    dv[1] = -determinant_3x3(
        [b3[0], b3[1]], b3[2],
        [b2[0], b2[1]], b2[2],
        [b0[0], b0[1]], b0[2]);
    dv[2] = determinant_3x3(
        [b3[0], b3[1]], b3[2],
        [b1[0], b1[1]], b1[2],
        [b0[0], b0[1]], b0[2]);
    dv[3] = -determinant_3x3(
        [b2[0], b2[1]], b2[2],
        [b1[0], b1[1]], b1[2],
        [b0[0], b0[1]], b0[2]);
    const D = 3 * dv[2] * dv[2] - 4 * dv[1] * dv[3];
    const curve_type = (dv[1] != 0)
        ? ((D > 0) ? CurveType.Serpentine
            : (D < 0) ? CurveType.Loop
                : CurveType.CuspInfInflection)
        : ((dv[2] != 0) ? CurveType.CuspInfCusp
            : ((dv[3] != 0) ? CurveType.Quadratic
                : CurveType.Line));

    return [curve_type, [b0, b1, b2, b3], dv];
}

const vec3_mul = (a: vec3, n: number) => [
    a[0] * n,
    a[1] * n,
    a[2] * n,
] as vec3;

const vec3_add = (...a: vec3[]) => {
    let ret: vec3 = [0, 0, 0];
    for (let v of a) {
        for (let i = 0; i < 3; ++i)
            ret[i] += v[i];
    }
    return ret;
}

const draw_cubic = (a: vec2, b: vec2, c: vec2, d: vec2) => {
    const [b0, b1, b2, b3]: vec3[] = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ]
    const [cp0, cp1, cp2, cp3]: vec3[] = [
        [...a, 1],
        [...b, 1],
        [...c, 1],
        [...d, 1],
    ]
    const [type, bv, dv] = determine_type(cp0, cp1, cp2, cp3,
        b0, b1, b2, b3
    );

    let st = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let k0: vec3 = [0, 0, 0];
    let k1: vec3 = [0, 0, 0];
    let k2: vec3 = [0, 0, 0];
    let k3: vec3 = [0, 0, 0];
    switch (type) {
        case CurveType.Serpentine: {
            let tmp = 1.0 / Math.sqrt(3.0) * Math.sqrt(3.0 * dv[2] * dv[2] - 4.0 * dv[1] * dv[3]);
            let tl = dv[2] + tmp;
            let sl = 2.0 * dv[1];
            let tm = dv[2] - tmp;
            let sm = sl;

            k0 = [tl * tm, tl * tl * tl, tm * tm * tm];
            k1 = [-sm * tl - sl * tm, -3.0 * sl * tl * tl, -3.0 * sm * tm * tm];
            k2 = [sl * sm, 3.0 * sl * sl * tl, 3.0 * sm * sm * tm];
            k3 = [0.0, -sl * sl * sl, -sm * sm * sm];
            break;
        }
        case CurveType.Loop: {
            let tmp = Math.sqrt(4.0 * dv[1] * dv[3] - 3.0 * dv[2] * dv[2]);
            let td = dv[2] + tmp;
            let sd = 2.0 * dv[1];
            let te = dv[2] - tmp;
            let se = 2.0 * dv[1]

            k0 = [td * te, td * td * te, td * te * te];
            k1 = [-se * td - sd * te, -se * td * td - 2.0 * sd * te * td, -sd * te * te - 2.0 * se * td * te];
            k2 = [sd * se, te * sd * sd + 2.0 * se * td * sd, td * se * se + 2.0 * sd * te * se];
            k3 = [0.0, -sd * sd * se, -sd * se * se];

        }
        default: break;
    }

    st[0] = k0[0];
    st[1] = k0[1];
    st[2] = k0[1];

    const tmp_k = vec3_add(
        k0,
        vec3_mul(k1, 1 / 3));
    st[3] = tmp_k[0];
    st[4] = tmp_k[1];
    st[5] = tmp_k[1];

    const tmp_n = vec3_add(
        k0,
        vec3_add(
            vec3_mul(k1, 2 / 3),
            vec3_mul(k2, 1 / 3)));
    st[6] = tmp_n[0];
    st[7] = tmp_n[1];
    st[8] = tmp_n[1];

    const tmp_m = vec3_add(
        vec3_add(k0, k1),
        vec3_add(k2, k3));
    st[9] = tmp_m[0];
    st[10] = tmp_m[1];
    st[11] = tmp_m[1];

    draw_delauny_mesh(a, b, c, d, st);
}

export const doShit = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('webgl2', { stencil: true })!;
    const gls = new WebGLState(ctx);
    ctx.clearColor(0, 0, 0, 1);
    ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.STENCIL_BUFFER_BIT);
    const cubicshader = new cubic(gls);

    draw_cubic(
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
    );

    const vbufgpu = new VertexBuffer(ctx, "STATIC_DRAW", ['pos', 'vec2'], ['vuv', 'vec3']);
    vbufgpu.set(posbuf);
    const ibuf = new IndexBuffer(ctx, "STATIC_DRAW", "UNSIGNED_SHORT");
    ibuf.set(new Uint16Array([...new Array(1024)].map((e, i) => i)))
    const input = new VertexBufferAssembly(ctx, ibuf, vbufgpu);
    cubicshader.setAssembly(input);
    debugger;
    gls.using(cubicshader, drawer => {
        drawer.drawElements(ctx.TRIANGLES, pptr / 5, 0);
    })
    // ctx.enable(ctx.STENCIL_TEST);
    // ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.STENCIL_BUFFER_BIT);
    // ctx.stencilMask(1);
    // ctx.stencilFunc(ctx.ALWAYS, 0, 0);
    // ctx.stencilOp(ctx.KEEP, ctx.KEEP, ctx.INVERT);
    // ctx.stencilFunc(ctx.EQUAL, 1, 1);
    // ctx.stencilMask(0);
}