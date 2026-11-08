import type { JigGL } from "./gpu4-renderer";
import type { Camera2D } from "./Camera2D";
import { VertexBuffer, type ObjectifiedVB, type Shader, VertexBufferAssembly, type WebGLAtoms, IndexBuffer, InputAtomToBytes, type GLAtomToAtom, WebGLState } from "safe-gl";
import spritesheetshader from "./spritesheet.glsl";

export type DerivedShader<T extends ObjectifiedVB<VertexBuffer<any, WebGLAtoms>[]> = {}> = Shader & {
    input: T;
    input_assembly?: VertexBufferAssembly<T>;
    setAssembly(a: VertexBufferAssembly<T>): void;
};
function getBuilderFor(t: WebGLAtoms) {
    switch (t) {
        case 'float':
        case 'double':
        case 'int':
        case 'uint':
            return () => 0;
    }
    let tidx = t.indexOf('vec');
    if (tidx != -1) {
        const s = +t.at(-1)!;
        return () => Array(s).fill(0);
    }
    throw new Error("Unhandled uniform type: " + t);
}

function getSetterFor(t: WebGLAtoms): (o: number) => (dv: DataView, v: any) => void {
    switch (t) {
        case 'float':
            return o => (dv, v) => dv.setFloat32(o, v, true);
        case 'double':
            return o => (dv, v) => dv.setFloat64(o, v, true);
        case 'int':
            return o => (dv, v) => dv.setInt32(o, v, true);
        case 'uint':
            return o => (dv, v) => dv.setUint32(o, v, true);
    }
    let tidx = t.indexOf('vec');
    if (tidx != -1) {
        const s = +t.at(-1)!;
        if (tidx == 0)
            return o => (dv, v) => {
                for (let i = 0; i < s; ++i)
                    dv.setFloat32(o + i * 4, v[i], true);
            };
        if (t[0] == 'i')
            return o => (dv, v) => {
                for (let i = 0; i < s; ++i)
                    dv.setInt32(o + i * 4, v[i], true);
            };
        if (t[0] == 'u')
            return o => (dv, v) => {
                for (let i = 0; i < s; ++i)
                    dv.setUint32(o + i * 4, v[i], true);
            };
    }
    throw new Error("Unhandled uniform attr type: " + t);
}

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export class SpriteDrawer3<T extends DerivedShader<any>,
    U extends T extends DerivedShader<infer B> ? B : never,
    V extends keyof U> {
    instnames;
    primcount;
    constructor(
        private glx: WebGLState,
        public prog: T,
        private sqname: V,
        private cap = 32,
        { vertices, indices } = {
            vertices: new Float32Array([
                0, 0,
                1, 0,
                1, 1,
                0, 1
            ].map(e => e - 0.5)), indices: new Uint16Array([0, 1, 2, 2, 3, 0])
        }
    ) {
        const gl = glx.gl;
        this.primcount = indices.length;
        const basesq = new VertexBuffer(gl, "STATIC_DRAW", [sqname.toString(), "vec2"]);
        basesq.set(vertices);
        const idx = new IndexBuffer(gl, "STATIC_DRAW", "UNSIGNED_SHORT");
        idx.set(indices);
        const ents = Object.entries(prog.input) as [string, WebGLAtoms][];
        this.instnames = ents.filter(e => e[0] != sqname);
        const instances = new VertexBuffer(gl, "STREAM_DRAW", ...this.instnames);
        instances.setInstanced();
        const inputass = new VertexBufferAssembly(gl, idx, basesq, instances);
        prog.setAssembly(inputass);
        this.data = new ArrayBuffer(0);
        this.instsize = this.instnames.reduce((a, b) => a + InputAtomToBytes[b[1]], 0);
        this.realloc(cap);
        this.instbuff = instances;
        let off = 0;
        let k: ([string, (dv: DataView, v: any) => void])[] = [];
        let l: ([string, () => number | number[]])[] = [];
        for (let attr of inputass.attrs[1].attrs) {
            const o = off;
            k.push([attr[0], getSetterFor(attr[1])(o)]);
            l.push([attr[0], getBuilderFor(attr[1])]);
            off += InputAtomToBytes[attr[1]];
        }
        this.setters = Object.fromEntries(k);
        this.builders = Object.fromEntries(l);
    }
    builders;
    setters;
    instbuff;
    data: ArrayBuffer;
    dirty = false;
    instsize;

    allocInst(): { [K in keyof Writeable<Omit<U, V>>]: U[K] extends WebGLAtoms ? GLAtomToAtom[U[K]] : never } & {
        dv: DataView;
        off: number;
        sync(): void;
    } {
        this.realloc(this.instances.length * 2 + 1);
        const self = this;
        let setters = this.setters;
        const newinst = {
            dv: new DataView(this.data, this.instances.length * this.instsize, this.instsize),
            off: this.instances.length,
            sync() {
                for (let k in setters)
                    setters[k](this.dv, (this as any)[k]);
                self.dirty = true;
            }
        } as ReturnType<SpriteDrawer3<T, U, V>['allocInst']>;
        for (let k in setters)
            (newinst as any)[k] = this.builders[k]();
        this.instances.push(newinst);

        return newinst;
    }

    realloc(n: number) {
        if (n <= this.data.byteLength / this.instsize)
            return;
        const newarr = new Uint8Array(n * this.instsize);
        newarr.set(new Uint8Array(this.data));
        this.data = newarr.buffer;
        this.instances.forEach(e => e.dv = new DataView(this.data, e.off * this.instsize, this.instsize));
    }

    instances: (ReturnType<SpriteDrawer3<T, U, V>['allocInst']>)[] = [];

    free(arg: SpriteDrawer3<T, U, V>['instances'][0]) {
        const insti = this.instances.findIndex(e => arg.off === e.off || arg === e);
        if (insti == -1)
            return;
        // swap the pointers of the first and last instances
        if (this.instances.length === 1) {
            this.instances = [];
            return;
        }
        const inst = this.instances[insti];
        const last = this.instances.at(-1)!;
        const tmp = [inst.dv, inst.off] as const;
        [inst.dv, inst.off] = [last.dv, last.off];
        [last.dv, last.off] = tmp;
        // for (let i = insti; i < this.instances.length; ++i) {
        //     this.instances[i].off--;
        //     this.instances[i].sync(); // or memcpy
        // }
        if (insti === this.instances.length - 1)
            this.instances.pop();
        else
            this.instances.splice(insti, 1, ...this.instances.splice(-1, 1));
    }

    finalizeDraw() {
        if (this.dirty) {
            this.dirty = false;
            this.instbuff.set(this.data);
        }
        const gl = this.glx.gl;
        this.glx.using(this.prog, drawer => {
            drawer.drawElementsInstanced(gl.TRIANGLES, this.primcount, this.instances.length);
        });
    }
}

type IReadonly<T> = {
    [P in keyof T]: T[P] extends (infer U)[] ? readonly U[] : T[P];
};

export type AsepriteImport<
    AnimNames extends string = string,
    FlagNames extends string = string> = IReadonly<{
        extent: [number, number];
        spritesheet: string;
        animdata: string;
        flags: Record<FlagNames, number>;
        layers_props: number[];
        frame_count: number;
        frame_durations: number[];
        anims: Record<AnimNames, readonly [
            from: number,
            to: number,
            repeat: number,
            loop_type: number
        ]>;
    }>;

export const buildAseRenderer = async (jgl: JigGL,
    ase: AsepriteImport,
    camera: Camera2D,
    scale: number) => {
    const { glx } = jgl;
    const [animdatabuff, spritesheetimg] = await Promise.all([fetch(ase.animdata).then(e => e.arrayBuffer()),
    new Promise<HTMLImageElement>(_ => {
        const img = new Image;
        img.onload = () => _(img);
        img.src = ase.spritesheet;
    })]);

    // contains ase.frame_count * ase.layers_props.length * 6 short ints (x, y, w, h, sx, sy)
    // So each texel will contain one of the pairs [x, y], [w, h] and [sx, sy]
    // And for a given frame/layer, [x, y] = texelFetch(ivec(frame * 3 + X, layer))
    const celpos = glx.createTexture(["RGBA8UI", "RGBA_INTEGER", "UNSIGNED_BYTE"], [ase.frame_count * 3, ase.layers_props.length], new Uint8Array(animdatabuff));
    const spritesheettex = glx.createTexture(["RGBA", "RGBA", "UNSIGNED_BYTE"], spritesheetimg);
    const prog = new spritesheetshader(glx);
    prog.bindings.sprite.texture = spritesheettex;
    prog.bindings.framedata.texture = celpos;
    prog.uniforms.scale.data = scale;
    prog.uniforms.camera.data = camera.projectionMatrix;
    prog.uniforms.frame_size.data = ase.extent as number[];
    return new SpriteDrawer3(glx, prog, "spos");
};