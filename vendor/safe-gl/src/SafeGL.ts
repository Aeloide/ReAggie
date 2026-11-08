import { compileShader } from "./shaders";

function is<T>(a: any): asserts a is T { }

type TSequenceWithOptionalU<T, U> = []
    | [U]
    | [T, ...T[]]
    | [T, ...T[], U];

type WebGLVectorTypes<P extends string = '', S extends number = 2 | 3 | 4> = `${P}vec${S}`;
export type WebGLAtoms = 'float' | WebGLVectorTypes
    | 'char' | WebGLVectorTypes<'c'>
    | 'short' | WebGLVectorTypes<'s'>
    | 'int' | WebGLVectorTypes<'i'>
    | 'byte' | WebGLVectorTypes<'x'>
    | 'ushort' | WebGLVectorTypes<'w'>
    | 'uint' | WebGLVectorTypes<'u'>
    | 'bool' | WebGLVectorTypes<'b'>
    | 'double' | WebGLVectorTypes<'d'>
    | `mat${2 | 3 | 4}`
    | `mat${2 | 3 | 4}x${2 | 3 | 4}`;

type CreateArrayWithLengthX<
    L extends number,
    ACC extends unknown[] = []> =
    ACC['length'] extends L
    ? ACC
    : CreateArrayWithLengthX<L, [...ACC, 1]>

type ParseInt<T> = T extends `${infer N extends number}` ? N : never

type Mul<X extends number, Y extends number, Z extends number[] = [], V extends unknown[] = []> =
    [...CreateArrayWithLengthX<Y>]['length'] extends Z['length']
    ? V['length']
    : Mul<X, Y, [1, ...Z], [...CreateArrayWithLengthX<X>, ...V]>

type testA = 'mat3x2'

type ExtractVSize<L extends `mat${string}x${string}`> = L extends `mat${infer V extends '2' | '3' | '4'}x${infer U extends '2' | '3' | '4'}` ? Mul<ParseInt<V>, ParseInt<U>> : never;
type ddd = ExtractVSize<testA>;

export type GLAtomToAtom = {
    [K in WebGLAtoms]: K extends 'float' | 'int' | 'uint' | 'bool' ? (K extends 'bool' ? boolean : number) : number[]
}

export const InputAtomToBytes: Record<WebGLAtoms, number> = {
    bool: 1,
    bvec2: 2,
    bvec3: 3,
    bvec4: 4,

    char: 1,
    cvec2: 2,
    cvec3: 3,
    cvec4: 4,
    byte: 1,
    xvec2: 2,
    xvec3: 3,
    xvec4: 4,
    double: 8,
    dvec2: 8 * 2,
    dvec3: 8 * 3,
    dvec4: 8 * 4,
    float: 4,
    vec2: 4 * 2,
    vec3: 4 * 3,
    vec4: 4 * 4,

    int: 4,
    ivec2: 4 * 2,
    ivec3: 4 * 3,
    ivec4: 4 * 4,

    uint: 4,
    uvec2: 4 * 2,
    uvec3: 4 * 3,
    uvec4: 4 * 4,

    ushort: 2,
    wvec2: 2 * 2,
    wvec3: 2 * 3,
    wvec4: 2 * 4,

    short: 2,
    svec2: 2 * 2,
    svec3: 2 * 3,
    svec4: 2 * 4,

    mat2: 4 * 2 * 2,
    mat3: 4 * 3 * 3,
    mat4: 4 * 4 * 4,

    mat2x2: 4 * 2 * 2,
    mat3x2: 4 * 3 * 2,
    mat4x2: 4 * 4 * 2,

    mat2x3: 4 * 2 * 3,
    mat3x3: 4 * 3 * 3,
    mat4x3: 4 * 4 * 3,

    mat2x4: 4 * 2 * 4,
    mat3x4: 4 * 3 * 4,
    mat4x4: 4 * 4 * 4
};


const InputAtomToCount: Record<WebGLAtoms, number> = {
    bool: 1,
    bvec2: 2,
    bvec3: 3,
    bvec4: 4,
    char: 1,
    byte: 1,
    double: 1,
    cvec2: 2,
    cvec3: 3,
    cvec4: 4,
    xvec2: 2,
    xvec3: 3,
    xvec4: 4,

    dvec2: 2,
    dvec3: 3,
    dvec4: 4,
    float: 1,
    vec2: 2,
    vec3: 3,
    vec4: 4,

    int: 1,
    ivec2: 2,
    ivec3: 3,
    ivec4: 4,

    uint: 1,
    uvec2: 2,
    uvec3: 3,
    uvec4: 4,

    ushort: 1,
    wvec2: 2,
    wvec3: 3,
    wvec4: 4,

    short: 1,
    svec2: 2,
    svec3: 3,
    svec4: 4,

    mat2: 2 * 2,
    mat3: 3 * 3,
    mat4: 4 * 4,

    mat2x2: 2 * 2,
    mat3x2: 3 * 2,
    mat4x2: 4 * 2,
    mat2x3: 2 * 3,
    mat3x3: 3 * 3,
    mat4x3: 4 * 3,
    mat2x4: 2 * 4,
    mat3x4: 3 * 4,
    mat4x4: 4 * 4
};


const InputAtomToBaseType: (gl: WebGL2RenderingContext) => Record<Exclude<WebGLAtoms, 'bool' | WebGLVectorTypes<'b'>>, number> = (gl: WebGL2RenderingContext) => ({
    char: gl.BYTE,
    byte: gl.UNSIGNED_BYTE,
    double: 0, //
    dvec2: 0,//
    dvec3: 0,//
    dvec4: 0,//
    cvec2: gl.BYTE,
    cvec3: gl.BYTE,
    cvec4: gl.BYTE,
    xvec2: gl.UNSIGNED_BYTE,
    xvec3: gl.UNSIGNED_BYTE,
    xvec4: gl.UNSIGNED_BYTE,

    float: gl.FLOAT,
    vec2: gl.FLOAT,
    vec3: gl.FLOAT,
    vec4: gl.FLOAT,

    int: gl.INT,
    ivec2: gl.INT,
    ivec3: gl.INT,
    ivec4: gl.INT,

    uint: gl.UNSIGNED_INT,
    uvec2: gl.UNSIGNED_INT,
    uvec3: gl.UNSIGNED_INT,
    uvec4: gl.UNSIGNED_INT,

    ushort: gl.UNSIGNED_SHORT,
    wvec2: gl.UNSIGNED_SHORT,
    wvec3: gl.UNSIGNED_SHORT,
    wvec4: gl.UNSIGNED_SHORT,

    short: gl.SHORT,
    svec2: gl.SHORT,
    svec3: gl.SHORT,
    svec4: gl.SHORT,

    mat2: gl.FLOAT,
    mat3: gl.FLOAT,
    mat4: gl.FLOAT,
    mat2x2: gl.FLOAT,
    mat3x2: gl.FLOAT,
    mat4x2: gl.FLOAT,
    mat2x3: gl.FLOAT,
    mat3x3: gl.FLOAT,
    mat4x3: gl.FLOAT,
    mat2x4: gl.FLOAT,
    mat3x4: gl.FLOAT,
    mat4x4: gl.FLOAT,
});

type AttributeTuple<K extends string | number | symbol = string> = [K, WebGLAtoms];

type TupleToObject<T extends AttributeTuple<U>[], U extends string | number | symbol = string | number | symbol> = {
    [P in T[number]as P[0]]: P[1] extends WebGLAtoms ? P[1] : never;
};

type GLInputAttrTypes = WebGLRenderingContext[`${'UNSIGNED_' | ''}${'BYTE' | 'SHORT' | 'INT'}` | 'FLOAT'];

type FilterUnion<T, U> = T extends U ? T : never;
type UsageHints = Pick<WebGL2RenderingContext, FilterUnion<keyof WebGL2RenderingContext, `${'STATIC' | 'DYNAMIC' | 'STREAM'}_${'READ' | 'COPY' | 'DRAW'}`>>;
type IndexTypes = Pick<WebGL2RenderingContext, FilterUnion<keyof WebGL2RenderingContext, `UNSIGNED_${'BYTE' | 'SHORT' | 'INT'}`>>;

export class VertexBuffer<T extends AttributeTuple<U>[], U extends string = string> {
    __tag!: TupleToObject<T>;
    attrs: T;
    buff: WebGLBuffer;
    constructor(private ctx: WebGL2RenderingContext,
        public usage: keyof UsageHints,
        ...attributes: T) {
        this.attrs = attributes;
        this.buff = ctx.createBuffer()!;
    }

    using(cb: () => void) {
        const oldbind = this.ctx.getParameter(this.ctx.ARRAY_BUFFER_BINDING);
        this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, this.buff);
        cb();
        this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, oldbind);
    }

    set(data: ArrayBufferView | ArrayBuffer) {
        this.using(() => {
            this.ctx.bufferData(this.ctx.ARRAY_BUFFER, data, this.ctx[this.usage]);
        });
        return this;
    }

    update(data: ArrayBufferView | ArrayBuffer, start = 0) {
        this.using(() => {
            this.ctx.bufferSubData(this.ctx.ARRAY_BUFFER, start, data);
        });
        return this;
    }

    instanced = false;
    setInstanced() {
        this.instanced = true;
        return this;
    }
}


export class IndexBuffer {
    buff: WebGLBuffer;
    constructor(private ctx: WebGL2RenderingContext,
        public usage: keyof UsageHints,
        public type: keyof IndexTypes) {
        this.buff = ctx.createBuffer()!;
    }

    using(cb: () => void) {
        const oldbind = this.ctx.getParameter(this.ctx.ELEMENT_ARRAY_BUFFER_BINDING);
        this.ctx.bindBuffer(this.ctx.ELEMENT_ARRAY_BUFFER, this.buff);
        cb();
        this.ctx.bindBuffer(this.ctx.ELEMENT_ARRAY_BUFFER, oldbind);
    }

    set(data: ArrayBufferView) {
        this.using(() => {
            this.ctx.bufferData(this.ctx.ELEMENT_ARRAY_BUFFER, data, this.ctx[this.usage]);
        });
    }

    update(data: ArrayBufferView, start = 0) {
        this.using(() => {
            this.ctx.bufferSubData(this.ctx.ELEMENT_ARRAY_BUFFER, start, data);
        });
    }
}

export type ObjectifiedVB<T extends VertexBuffer<any>[]> = TupleToObject<ConcatVBKeys2<T>>;

type NonEmptyTuple<T> = [T, ...T[]];

export type ConcatVBKeys2<T extends VertexBuffer<any>[]> = T extends [infer First, ...infer Rest extends VertexBuffer<any>[]]
    ? Rest extends NonEmptyTuple<VertexBuffer<infer U extends AttributeTuple<any>[]>>
    ? First extends VertexBuffer<infer V extends AttributeTuple<any>[]>
    ? [...V, ...U] : [U]
    : First extends VertexBuffer<infer V extends AttributeTuple<any>[]> ? V : never
    : never;

export interface BaseVertexBufferAssembly {
    indexType: number;
}

export class VertexBufferAssembly<
    T extends ObjectifiedVB<W>,
    W extends VertexBuffer<any[]>[] = VertexBuffer<any[]>[],
> implements BaseVertexBufferAssembly {
    __t!: T;
    __w!: W;
    __ow!: ObjectifiedVB<W>;

    #vao;

    using(cb: (gl: WebGL2RenderingContext) => void) {
        const gl = this.gl;
        const oldvao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
        gl.bindVertexArray(this.#vao);
        cb(gl);
        gl.bindVertexArray(oldvao);
    }

    attrs;
    get indexType() {
        return this.gl[this.indexBuffer.type];
    };

    constructor(
        private gl: WebGL2RenderingContext,
        public indexBuffer: IndexBuffer,
        ...attrs: W
    ) {
        this.attrs = attrs;
        const inputToBT = InputAtomToBaseType(gl);
        this.#vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.#vao);
        indexBuffer.using(() => {
            let loc = 0;
            for (let attr of attrs) { // attributes provided by every buffer
                let ptr = 0;
                attr.using(() => {
                    let stride = attr.attrs.reduce((a, b) => a + InputAtomToBytes[b[1] as WebGLAtoms], 0);
                    for (let a of attr.attrs) { // attributes provided by a single buffer
                        gl.enableVertexAttribArray(loc);
                        const k = a[1] as keyof typeof InputAtomToBytes;
                        switch (k) {
                            case "int":
                            case "ivec2":
                            case "ivec3":
                            case "ivec4":
                            case "uint":
                            case "uvec2":
                            case "uvec3":
                            case "uvec4":
                                gl.vertexAttribIPointer(loc, InputAtomToCount[k], inputToBT[k], stride, ptr);
                                break;
                            case "float":
                            case "vec2":
                            case "vec3":
                            case "vec4":
                                gl.vertexAttribPointer(loc, InputAtomToCount[k], inputToBT[k], false, stride, ptr);
                                break;
                        }
                        if (attr.instanced)
                            gl.vertexAttribDivisor(loc, 1);
                        loc += Math.ceil(InputAtomToCount[a[1] as keyof typeof InputAtomToCount] / 4);
                        ptr += InputAtomToBytes[a[1] as WebGLAtoms];
                    }
                });

            }
            gl.bindVertexArray(null);
        });
    }

    preparePipelineInput(s: WebGLShader) {
        const gl = this.gl;
        let loc = 0;
        for (let attr of this.attrs) {
            for (let a of attr.attrs) {
                gl.bindAttribLocation(s, loc, a[0]);
                loc += Math.ceil(InputAtomToCount[a[1] as keyof typeof InputAtomToBytes] / 4);
            }
        }
    }
};



// The idea is to track textures by type, but also
// which unit they're bound to.
// this allows some optimizations where instead of doing texture binding/unbinds,
// to instead simply update the associated uniform if the texture is already bound to a unit
type Merge<M> = {
    [K in keyof M]: M[K];
};

type Overwrite<T, U> = Merge<Omit<T, keyof U> & U>;

type TextureDesc<T extends { __tag: TextureTags | ''; } = { __tag: TextureTags; }> = T & {
    __tag: T['__tag'];

    toTyped<S extends keyof CompatibleFormats>(t: S, ...args: CompatibleFormats[S])
        : TextureDesc<Overwrite<T, {
            __tag: `${S extends keyof IntegerFormats ? 'I' : 'F'}${T['__tag']}`;
            __typed: true;
            __type: [S, ...CompatibleFormats[S]];
        }>>;

    toSized<S extends [number, number] | [number, number, number]>(...size: S)
        : TextureDesc<Overwrite<T, {
            __tag: `${T['__tag']}${S extends [number, number, number] ? 'A' : ''}`,
            sized: true,
            width: S[0],
            height: S[1],
            depth: S extends [number, number, number] ? S[2] : never;
        }>>;
};

export type CTexture = {
    unit: number | null;
    active: boolean;
    bind(n: number | null): void;
};

type TextureTags = `${'F' | 'I'}${'A' | ''}`;
export type CompleteDesc<T extends TextureTags = TextureTags> = {
    __tag: T,
} & ({
    __sized: true,
    width: number, height: number, depth?: number;
} | {}) & ({
    __typed: true,
    __type: [keyof CompatibleFormats, ...CompatibleFormats[keyof CompatibleFormats]];
} | {});

type TagForSize<T extends [number, number] | [number, number, number] | TexImageSource> = T extends [number, number, number] ? 'A' : '';
type TagForFormat<S extends keyof CompatibleFormats> = S extends `${string}I` ? 'I' : 'F';
type WrapMode = 'CLAMP_TO_EDGE' | 'REPEAT' | 'MIRRORED_REPEAT';
type MagFilterMode = 'LINEAR' | 'NEAREST';
type MinFilterMode = MagFilterMode | `${MagFilterMode}_MIPMAP_${MagFilterMode}`;

const assertIs = <T>(e: any): e is T => true;

type CompareFunctionNames = `${'NOT' | '' | 'L' | 'G'}EQUAL` | 'GREATER' | 'LESS' | 'NEVER' | 'ALWAYS';

type SamplerParameter = {
    TEXTURE_BASE_LEVEL: number;
    TEXTURE_MAX_LEVEL: number;
    TEXTURE_MAX_LOD: number;
    TEXTURE_MIN_LOD: number;
    TEXTURE_COMPARE_FUNC: CompareFunctionNames;
    TEXTURE_COMPARE_MODE: 'NONE' | 'COMPARE_REF_TO_TEXTURE';
    TEXTURE_MAG_FILTER: MagFilterMode;
    TEXTURE_MIN_FILTER: MinFilterMode;
    TEXTURE_WRAP_R: WrapMode;
    TEXTURE_WRAP_S: WrapMode;
    TEXTURE_WRAP_T: WrapMode;
};

export type PartialDesc<T extends TextureTags> =
    | { __tag: T; __typed: true; __type: [keyof CompatibleFormats, ...CompatibleFormats[keyof CompatibleFormats]]; }
    | { __tag: T; __sized: true; width: number; height: number; depth?: number; };

type SourceTypes = CompatibleSourceType[keyof CompatibleSourceType];
export type ArrayViewForType = {
    FLOAT: Float32Array,
    UNSIGNED_BYTE: Uint8Array,
    UNSIGNED_INT_10F_11F_11F_REV: Uint32Array,
    UNSIGNED_INT: Uint32Array,
    UNSIGNED_INT_2_10_10_10_REV: Uint32Array,
    UNSIGNED_SHORT_4_4_4_4: Uint16Array,
    UNSIGNED_SHORT_5_5_5_1: Uint16Array,
    UNSIGNED_SHORT_5_6_5: Uint16Array,
    HALF_FLOAT: Uint16Array
}

export class TTexture<S extends InternalFormats = InternalFormats,
    DimensionSpec extends [number, number] | [number, number, number] = [number, number] | [number, number, number],
    T extends CompleteDesc<`${TagForFormat<S>}${TagForSize<DimensionSpec>}`> = CompleteDesc<`${TagForFormat<S>}${TagForSize<DimensionSpec>}`>,
> implements CTexture {
    __tag!: T['__tag'];
    __tag2!: T;
    unit: number | null = null;
    active = false;
    eager: boolean;

    /*
        The idea is to minimize rebinding textures, chosing to update their uniforms instead which should be faster
    */
    enable() {
        if (this.unit !== null) { // already bound to a unit
            this.active = true;
            return;
        }
        // look for unallocated unit
        let n = this.glx.textureUnits._internal_textures.indexOf(null);
        if (n == -1) {
            // couldn't find unallocated unit, we'll kick a disabled texture from its slot
            n = this.glx.textureUnits._internal_textures.findIndex(e => !e!.active);
            if (n == -1)
                throw new Error("All texture units are full!");
            const other = this.glx.textureUnits._internal_textures[n]!;
            other.bind(null);
        }
        this.bind(n);
    }

    disable() {
        // mark as inactive, but still bound to a unit
        this.active = false;
        if (this.eager) {
            if (this.unit !== null) {
                this.bind(null);
            }
        }
    }

    bind(n: number | null) {
        if (this.unit === n) {
            this.active = !!this.unit;
            return;
        }
        const prevunit = this.glx.gl.getParameter(this.glx.gl.ACTIVE_TEXTURE);
        if (this.unit !== null) {
            this.glx.gl.activeTexture(this.glx.gl.TEXTURE0 + this.unit);
            this.glx.gl.bindTexture(this.target, null);
            this.glx.textureUnits._internal_textures[this.unit!] = null;
            this.active = false;
            this.unit = null;
        }
        if (n !== null) {
            this.glx.gl.activeTexture(this.glx.gl.TEXTURE0 + n);
            this.glx.gl.bindTexture(this.target, this.tex);
            this.unit = n;
            this.glx.textureUnits._internal_textures[n] = this;
            this.active = true;
        }
        this.glx.gl.activeTexture(prevunit)
    }

    tex;
    target: number;
    binder: 'texImage2D' | 'texImage3D' = 'texImage2D';
    arg: {} & ({
        __typed: true;
        __iformat: S,
        __type: CompatibleSourceFormats[S];
        __srct: CompatibleSourceType[S];
    } | {}) & ({
        __sized: true;
        width: number;
        height: number;
        depth?: number;
    } | {});
    realloc(data: ArrayViewForType[CompatibleSourceType[S]] | TexImageSource | null, samplerState: Partial<SamplerParameter> = {
        TEXTURE_WRAP_S: 'REPEAT',
        TEXTURE_WRAP_T: 'REPEAT',
        TEXTURE_MAG_FILTER: 'NEAREST',
        TEXTURE_MIN_FILTER: 'NEAREST'
    }) {
        const { arg, target, glx } = this;
        const binding_target = ({
            [glx.gl.TEXTURE_2D]: glx.gl.TEXTURE_BINDING_2D,
            [glx.gl.TEXTURE_3D]: glx.gl.TEXTURE_BINDING_3D,
            [glx.gl.TEXTURE_2D_ARRAY]: glx.gl.TEXTURE_BINDING_2D_ARRAY,
        })[target];
        const prev = glx.gl.getParameter(binding_target!);

        if (!('__typed' in arg))
            throw new Error("Cannot update texture without internal type");

        glx.gl.bindTexture(target, this.tex);

        if (samplerState) {
            for (const k in samplerState) {
                const lek = k as keyof typeof samplerState;
                const v = samplerState[lek];
                if (k.includes('_LOD')) {
                    glx.gl.texParameterf(target, glx.gl[lek], v as number);
                } else {
                    type ddd = Exclude<typeof samplerState[typeof lek], number | undefined>;
                    glx.gl.texParameteri(target, glx.gl[lek], glx.gl[v as ddd]);
                }
            }
        }

        switch (target) {
            case glx.gl.TEXTURE_2D:
                if (!data || ArrayBuffer.isView(data)) {
                    if (!('__sized' in arg))
                        throw new Error("Texture dimensions not specified");

                    glx.gl.texImage2D(target, 0, glx.gl[arg.__iformat],
                        arg.width, arg.height, 0,
                        glx.gl[arg.__type], glx.gl[arg.__srct],
                        data);
                }
                else
                    glx.gl.texImage2D(target, 0, glx.gl[arg.__iformat],
                        glx.gl[arg.__type], glx.gl[arg.__srct], data);
                this.binder = 'texImage2D';
                break;
            case glx.gl.TEXTURE_2D_ARRAY:
                if (!('__sized' in arg))
                    throw new Error("Texture dimensions not specified");
                if (!data || ArrayBuffer.isView(data))
                    glx.gl.texImage3D(target, 0, glx.gl[arg.__iformat],
                        arg.width, arg.height, arg.depth!,
                        0, glx.gl[arg.__type], glx.gl[arg.__srct],
                        data);
                this.binder = 'texImage3D';
                break;
        }

        if (samplerState.TEXTURE_MIN_FILTER?.includes("MIPMAP"))
            glx.gl.generateMipmap(target);

        glx.gl.bindTexture(target, prev);
    }

    updateRegion(data: ArrayBuffer | TexImageSource,
        pos: Exclude<DimensionSpec, TexImageSource>,
        size: Exclude<DimensionSpec, TexImageSource>) {
        const { arg, target, glx } = this;

        const binding_target = ({
            [glx.gl.TEXTURE_2D]: glx.gl.TEXTURE_BINDING_2D,
            [glx.gl.TEXTURE_3D]: glx.gl.TEXTURE_BINDING_3D,
            [glx.gl.TEXTURE_2D_ARRAY]: glx.gl.TEXTURE_BINDING_2D_ARRAY,
        })[target];
        const prev = glx.gl.getParameter(binding_target!);

        glx.gl.bindTexture(target, this.tex);

        if (!('__typed' in arg))
            throw new Error("Cannot update texture without internal type");

        const viewer = ({
            FLOAT: Float32Array,
            UNSIGNED_BYTE: Uint8Array,
            UNSIGNED_INT_10F_11F_11F_REV: Uint32Array,
            UNSIGNED_INT: Uint32Array,
            UNSIGNED_INT_2_10_10_10_REV: Uint32Array,
            UNSIGNED_SHORT_4_4_4_4: Uint16Array,
            UNSIGNED_SHORT_5_5_5_1: Uint16Array,
            UNSIGNED_SHORT_5_6_5: Uint16Array,
            HALF_FLOAT: Uint16Array
        })[arg.__srct];

        if ('depth' in arg && arg['depth'] &&
            assertIs<[number, number, number]>(pos) &&
            assertIs<[number, number, number]>(size)) {
            if (data instanceof ArrayBuffer) {
                glx.gl.texSubImage3D(target, 0,
                    pos[0], pos[1], pos[2],
                    size[0], size[1], size[2]!,
                    glx.gl[arg.__type], glx.gl[arg.__srct], data ? new viewer(data) : null);
            } else {
                glx.gl.texSubImage3D(target, 0,
                    pos[0], pos[1], pos[2],
                    size[0], size[1], size[2]!,
                    glx.gl[arg.__type], glx.gl[arg.__srct], data);
            }
        } else {
            if (data instanceof ArrayBuffer) {
                glx.gl.texSubImage2D(target, 0,
                    pos[0], pos[1],
                    size[0], size[1],
                    glx.gl[arg.__type], glx.gl[arg.__srct], data ? new viewer(data) : null);
            } else {
                glx.gl.texSubImage2D(target, 0,
                    pos[0], pos[1],
                    size[0], size[1],
                    glx.gl[arg.__type], glx.gl[arg.__srct], data);
            }
        }

        glx.gl.bindTexture(target, prev);
    }

    constructor(private glx: WebGLState,
        arg: [[S,
            CompatibleSourceFormats[S],
            CompatibleSourceType[S]],
            DimensionSpec?],
        data?: ArrayViewForType[CompatibleSourceType[S]] | TexImageSource,
        samplerState: Partial<SamplerParameter> = {
            TEXTURE_WRAP_S: 'REPEAT',
            TEXTURE_WRAP_T: 'REPEAT',
            TEXTURE_MAG_FILTER: 'NEAREST',
            TEXTURE_MIN_FILTER: 'NEAREST'
        }, eager = false) {
        this.tex = glx.gl.createTexture()!;
        this.eager = eager;
        samplerState = {
            TEXTURE_WRAP_S: 'REPEAT',
            TEXTURE_WRAP_T: 'REPEAT',
            TEXTURE_MAG_FILTER: 'NEAREST',
            TEXTURE_MIN_FILTER: 'NEAREST',
            ...samplerState
        }

        if (arg[1]) {
            this.arg = {
                __sized: true,
                __typed: true,
                __iformat: arg[0][0],
                __type: arg[0][1],
                __srct: arg[0][2],
                width: arg[1][0],
                height: arg[1][1],
                depth: arg[1][2]
            };
        } else {
            this.arg = {
                __typed: true,
                __iformat: arg[0][0],
                __type: arg[0][1],
                __srct: arg[0][2],
            };
        }
        const target = 'depth' in this.arg && this.arg['depth'] ? glx.gl.TEXTURE_2D_ARRAY : glx.gl.TEXTURE_2D;
        this.target = target;

        this.realloc(data || null, samplerState);
    }
};

export class TextureSetter<T extends InternalFormats, S extends (v: number) => void = (v: number) => void> {
    us: UniformSetter<number>;
    texture?: TTexture<T>;
    constructor(setter: S) {
        this.us = new UniformSetter(setter, 0);
    }

    sync() {
        this.texture!.enable();
        this.us.data = this.texture!.unit!
        this.us.sync();
    }
};

type PickByPrefix<T, Prefix extends string = '', Suffix extends string = ''> = {
    [K in keyof T as K extends `${Prefix}${string}${Suffix}` ? K : never]: T[K];
};

type UnionByPrefix<T, Prefix extends string = '', Suffix extends string = ''> = T extends `${Prefix}${string}${Suffix}` ? T : never;

type UniformFunctionNames = keyof PickByPrefix<WebGL2RenderingContext, 'uniform', 'v'>;
type UniformOverloads = PickByPrefix<WebGL2RenderingContext, 'uniform', 'v'>[UniformFunctionNames];

export class UniformSetter<T extends number | number[], S extends (v: T) => void = (v: T) => void> {
    dirty = true;
    get data() {
        return this._data;
    }

    set data(v: T) {
        if (!Array.isArray(v) && v == this._data) return;
        if (Array.isArray(v) && this._data) {
            let exit = true;
            for (let i = 0; i < v.length; ++i)
                if (v[i] != (this._data as number[])[i]) {
                    exit = false;
                    break;
                }
            if (exit)
                return;
        }
        this.dirty = true;
        this._data = structuredClone(v);

    }

    sync() {
        if (!this.dirty)
            return;
        this.setter(this._data);
        this.dirty = false;
    }

    constructor(
        public setter: S,
        private _data: T) {
    }
};

type InternalFormats = keyof CompatibleFormats;
type CompatibleFormats = {
    RGB: ['RGB', 'UNSIGNED_BYTE' | 'UNSIGNED_SHORT_5_6_5'],
    RGBA: ['RGBA', 'UNSIGNED_BYTE' | 'UNSIGNED_SHORT_4_4_4_4' | 'UNSIGNED_SHORT_5_5_5_1'],
    LUMINANCE_ALPHA: ['LUMINANCE_ALPHA', 'UNSIGNED_BYTE'],
    LUMINANCE: ['LUMINANCE', 'UNSIGNED_BYTE'],
    ALPHA: ['ALPHA', 'UNSIGNED_BYTE'],
    R8: ['RED', 'UNSIGNED_BYTE'],
    R16F: ['RED', 'HALF_FLOAT' | 'FLOAT'],
    R32F: ['RED', 'FLOAT'],
    R8UI: ['RED_INTEGER', 'UNSIGNED_BYTE'],
    RG8: ['RG', 'UNSIGNED_BYTE'],
    RG16F: ['RG', 'HALF_FLOAT' | 'FLOAT'],
    RG32F: ['RG', 'FLOAT'],
    RG8UI: ['RG_INTEGER', 'UNSIGNED_BYTE'],
    RGB8: ['RGB', 'UNSIGNED_BYTE'],
    SRGB8: ['RGB', 'UNSIGNED_BYTE'],
    RGB565: ['RGB', 'UNSIGNED_BYTE' | 'UNSIGNED_SHORT_5_6_5'],
    R11F_G11F_B10F: ['RGB', 'UNSIGNED_INT_10F_11F_11F_REV' | 'HALF_FLOAT' | 'FLOAT'],
    RGB9_E5: ['RGB', 'HALF_FLOAT' | 'FLOAT'],
    RGB16F: ['RGB', 'HALF_FLOAT' | 'FLOAT'],
    RGB32F: ['RGB', 'FLOAT'],
    RGB8UI: ['RGB_INTEGER', 'UNSIGNED_BYTE'],
    RGBA8: ['RGBA', 'UNSIGNED_BYTE'],
    SRGB8_ALPHA8: ['RGBA', 'UNSIGNED_BYTE'],
    RGB5_A1: ['RGBA', 'UNSIGNED_BYTE' | 'UNSIGNED_SHORT_5_5_5_1'],
    RGB10_A2: ['RGBA', 'UNSIGNED_INT_2_10_10_10_REV'],
    RGBA4: ['RGBA', 'UNSIGNED_BYTE' | 'UNSIGNED_SHORT_4_4_4_4'],
    RGBA16F: ['RGBA', 'HALF_FLOAT' | 'FLOAT'],
    RGBA32F: ['RGBA', 'FLOAT'],
    RGBA8UI: ['RGBA_INTEGER', 'UNSIGNED_BYTE'];
};

type CompatibleSourceFormats = {
    RGB: 'RGB',
    RGBA: 'RGBA',
    LUMINANCE_ALPHA: 'LUMINANCE_ALPHA',
    LUMINANCE: 'LUMINANCE',
    ALPHA: 'ALPHA',
    R8: 'RED',
    R16F: 'RED',
    R32F: 'RED',
    R8UI: 'RED',
    RG8: 'RG',
    RG16F: 'RG',
    RG32F: 'RG',
    RG8UI: 'RG_INTEGER',
    RGB8: 'RGB',
    SRGB8: 'RGB',
    RGB565: 'RGB',
    R11F_G11F_B10F: 'RGB',
    RGB9_E5: 'RGB',
    RGB16F: 'RGB',
    RGB32F: 'RGB',
    RGBA8: 'RGBA',
    SRGB8_ALPHA8: 'RGBA',
    RGB5_A1: 'RGBA',
    RGB10_A2: 'RGBA',
    RGBA4: 'RGBA',
    RGBA16F: 'RGBA',
    RGBA32F: 'RGBA',
    RGB8UI: 'RGB_INTEGER',
    RGBA8UI: 'RGBA_INTEGER';
};

type CompatibleSourceType = {
    RGB: 'UNSIGNED_BYTE' | 'UNSIGNED_SHORT_5_6_5',
    RGBA: 'UNSIGNED_BYTE' | 'UNSIGNED_SHORT_4_4_4_4' | 'UNSIGNED_SHORT_5_5_5_1',
    LUMINANCE_ALPHA: 'UNSIGNED_BYTE',
    LUMINANCE: 'UNSIGNED_BYTE',
    ALPHA: 'UNSIGNED_BYTE',
    R8: 'UNSIGNED_BYTE',
    R16F: 'HALF_FLOAT' | 'FLOAT',
    R32F: 'FLOAT',
    R8UI: 'UNSIGNED_BYTE',
    RG8: 'UNSIGNED_BYTE',
    RG16F: 'HALF_FLOAT' | 'FLOAT',
    RG32F: 'FLOAT',
    RG8UI: 'UNSIGNED_BYTE',
    RGB8: 'UNSIGNED_BYTE',
    SRGB8: 'UNSIGNED_BYTE',
    RGB565: 'UNSIGNED_BYTE' | 'UNSIGNED_SHORT_5_6_5',
    R11F_G11F_B10F: 'UNSIGNED_INT_10F_11F_11F_REV' | 'HALF_FLOAT' | 'FLOAT',
    RGB9_E5: 'HALF_FLOAT' | 'FLOAT',
    RGB16F: 'HALF_FLOAT' | 'FLOAT',
    RGB32F: 'FLOAT',
    RGB8UI: 'UNSIGNED_BYTE',
    RGBA8: 'UNSIGNED_BYTE',
    SRGB8_ALPHA8: 'UNSIGNED_BYTE',
    RGB5_A1: 'UNSIGNED_BYTE' | 'UNSIGNED_SHORT_5_5_5_1',
    RGB10_A2: 'UNSIGNED_INT_2_10_10_10_REV',
    RGBA4: 'UNSIGNED_BYTE' | 'UNSIGNED_SHORT_4_4_4_4',
    RGBA16F: 'HALF_FLOAT' | 'FLOAT',
    RGBA32F: 'FLOAT',
    RGBA8UI: 'UNSIGNED_BYTE';
};

type IntegerFormats = PickByPrefix<CompatibleFormats, '', 'UI' | 'I'>;
export type IntegerInternalFormats = UnionByPrefix<InternalFormats, '', 'UI' | 'I'>;
export type OtherInternalFormats = Exclude<InternalFormats, IntegerInternalFormats>;

export interface Shader {
    input_assembly?: BaseVertexBufferAssembly;
    execDraw(cb: (gl: WebGL2RenderingContext) => void): void;
}

export class WebGLState {
    textureUnits;
    // TODO: blending state, depth state...

    buildProgram(vert: string, frag: string): [WebGLProgram, WebGLShader, WebGLShader] {
        const gl = this.gl;
        const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vert);
        const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, frag);
        const program = gl.createProgram()!;
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        return [program, vertexShader, fragmentShader];
    }

    constructor(public gl: WebGL2RenderingContext) {
        const unitcount = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
        this.textureUnits = new Proxy({
            _internal_textures: [...new Array(unitcount)].map(e => null) as (CTexture | null)[],
            dirty: new Set<number>(),
            sync() {
                const oldActive = gl.getParameter(gl.ACTIVE_TEXTURE);
                for (const e of this.dirty) {
                    this._internal_textures[e]?.bind(e);
                }
                this.dirty.clear();
                gl.activeTexture(oldActive);
            }
        }, {
            set(target, prop, nv, recv) {
                if (Number.isInteger(Number(prop))) {
                    const n = Number(prop);
                    target.dirty.add(n);
                    if (target._internal_textures[n] != nv)
                        target._internal_textures[n]?.bind(null);
                    target._internal_textures[n] = nv;
                    return true;
                }
                return Reflect.set(target, prop, nv, recv);
            },
            get(target, prop, recv) {
                if (Number.isInteger(Number(prop)))
                    return target._internal_textures[Number(prop)];
                return Reflect.get(target, prop, recv);
            }
        });
    }

    createTexture<S extends keyof CompatibleFormats,
        K extends [number, number] | [number, number, number] | TexImageSource>(
            format: [S, CompatibleSourceFormats[S], CompatibleSourceType[S]],
            size_or_media: K,
            data?: ArrayViewForType[CompatibleSourceType[S]],
            samplerState: Partial<SamplerParameter> = {
                TEXTURE_WRAP_S: 'REPEAT',
                TEXTURE_WRAP_T: 'REPEAT',
                TEXTURE_MAG_FILTER: 'NEAREST',
                TEXTURE_MIN_FILTER: 'NEAREST'
            }, eager: boolean = false)
        : K extends TexImageSource
        ? TTexture<S, [number, number]>
        : TTexture<S, Exclude<K, TexImageSource>> {
        samplerState = {
            TEXTURE_WRAP_S: 'REPEAT',
            TEXTURE_WRAP_T: 'REPEAT',
            TEXTURE_MAG_FILTER: 'NEAREST',
            TEXTURE_MIN_FILTER: 'NEAREST',
            ...samplerState
        }
        if (Array.isArray(size_or_media))
            return new TTexture(this, [format, size_or_media], data, samplerState, eager) as any;
        // size_or_media is a media, data is to be ignored
        return new TTexture<S, [number, number]>(this, [format], size_or_media as TexImageSource, samplerState, eager) as any;
    }

    using(s: Shader, cb: (gl: {
        drawElements(primitive: number, count: number, byteoffset?: number): void;
        drawElementsInstanced(primitive: number, count: number, n: number, byteoffset?: number): void;
    }) => void) {
        s.execDraw((gl: WebGL2RenderingContext) => {
            cb({
                drawElements(primitive, count, byteoffset = 0) {
                    gl.drawElements(primitive, count, s.input_assembly!.indexType, byteoffset);
                },
                drawElementsInstanced(primitive, count, n, byteoffset = 0) {
                    gl.drawElementsInstanced(primitive, count, s.input_assembly!.indexType, byteoffset, n);
                },
            });
        });
    }
}

console.log('fsdaf')