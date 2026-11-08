
import { Buffer } from 'buffer';

// --- Type Definitions ---

export type Primitive = 'u8' | 'i8' | 'u16' | 'i16' | 'u32' | 'i32' | 'f32' | 'f64';

type Tuple<T, N extends number, R extends T[] = []> =
    R['length'] extends N ? R :
    R['length'] extends 64 ? T[] :
    Tuple<T, N, [T, ...R]>;

export interface FieldDef<T> {
    type: 'primitive' | 'struct' | 'array';
    primitive?: Primitive;
    structSchema?: Record<string, FieldDef<any>>;
    arrayDef?: {
        element: FieldDef<any>;
        length: number | string; // number: fixed, string: ref (key in scope), -1: eof
    };
    // Helper to get definition metadata
    _getDef(): FieldDef<T>;
}

export type ParsedType<T extends FieldDef<any>> =
    T extends FieldDef<infer U> ? U : never;

export type StructType<S extends Record<string, FieldDef<any>>> = {
    [K in keyof S as K extends `${infer P}?` ? P : K]:
    K extends `${string}?` ? ParsedType<S[K]> | undefined : ParsedType<S[K]>
};

export interface StructParser<T> extends FieldDef<T> {
    // Calling the parser as a function creates an array field definition
    <L extends number>(length: L): FieldDef<L extends -1 ? T[] : Tuple<T, L>>;
    (length: string): FieldDef<T[]>;

    parse(buffer: Buffer, offset?: number): T;
    pack(data: T, target?: Buffer, offset?: number): Buffer;
    compile(): void;

    // Internal fields
    _schema: Record<string, FieldDef<any>>;
}

interface PrimitiveParser {
    (): FieldDef<number>;
    <L extends number>(len: L): FieldDef<L extends -1 ? number[] : Tuple<number, L>>;
    (len: string): FieldDef<number[]>;
}

// --- Primitive Factories ---

function createPrimitive(type: Primitive) {
    return function (length?: number | string): any {
        const primDef: FieldDef<number> = {
            type: 'primitive',
            primitive: type,
            _getDef: () => primDef
        };

        if (length !== undefined) {
            const arrDef: FieldDef<number[]> = {
                type: 'array',
                arrayDef: {
                    element: primDef,
                    length: length
                },
                _getDef: () => arrDef
            };
            return arrDef;
        }
        return primDef;
    };
}

export const u8 = createPrimitive('u8') as PrimitiveParser;
export const i8 = createPrimitive('i8') as PrimitiveParser;
export const u16 = createPrimitive('u16') as PrimitiveParser;
export const i16 = createPrimitive('i16') as PrimitiveParser;
export const u32 = createPrimitive('u32') as PrimitiveParser;
export const i32 = createPrimitive('i32') as PrimitiveParser;
export const f32 = createPrimitive('f32') as PrimitiveParser;
export const f64 = createPrimitive('f64') as PrimitiveParser;

// --- Struct Factory ---

export function struct<S extends Record<string, FieldDef<any>>>(schema: S): StructParser<StructType<S>> {
    let parseFn: ((buf: Buffer, offset?: number) => any) | null = null;
    let packFn: ((data: any, target?: Buffer, offset?: number) => Buffer) | null = null;
    // The StructParser object
    const parser = function (length: number | string) {
        // Return array definition of this struct
        const def: FieldDef<any[]> = {
            type: 'array',
            arrayDef: {
                element: parser,
                length: length
            },
            _getDef: () => def
        };
        return def;
    } as any as StructParser<StructType<S>>;

    // Set properties
    parser.type = 'struct';
    parser._schema = schema; // Store normalized schema
    parser.structSchema = schema; // For field definition
    parser._getDef = () => parser;

    parser.compile = function () {
        if (!parseFn) parseFn = compileParse(schema);
        if (!packFn) packFn = compilePack(schema);

        // Optimize hot path by replacing methods
        parser.parse = parseFn;
        parser.pack = packFn;
    };

    parser.parse = function (buffer: Buffer, offset?: number) {
        parser.compile();
        return parseFn!(buffer, offset);
    };

    parser.pack = function (data: any, target?: Buffer, offset?: number) {
        parser.compile();
        return packFn!(data);
    };

    return parser;
}


// --- Compilation Logic ---

const PRIMITIVE_SIZES: Record<Primitive, number> = {
    u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4, f32: 4, f64: 8
};

const READ_METHODS: Record<Primitive, string> = {
    u8: 'readUInt8', i8: 'readInt8',
    u16: 'readUInt16LE', i16: 'readInt16LE',
    u32: 'readUInt32LE', i32: 'readInt32LE',
    f32: 'readFloatLE', f64: 'readDoubleLE'
};

const WRITE_METHODS: Record<Primitive, string> = {
    u8: 'writeUInt8', i8: 'writeInt8',
    u16: 'writeUInt16LE', i16: 'writeInt16LE',
    u32: 'writeUInt32LE', i32: 'writeInt32LE',
    f32: 'writeFloatLE', f64: 'writeDoubleLE'
};

// --- Parse Compiler ---

function compileParse(schema: Record<string, FieldDef<any>>): (buf: Buffer) => any {
    const lines: string[] = [];
    lines.push('var off = offset | 0;');
    lines.push('var res = {};');

    // Generate code for each field
    for (const key in schema) {
        lines.push(`// parsing ${key}`);
        const field = schema[key]._getDef();

        let useKey = key;
        let isOptional = false;
        if (key.endsWith('?')) {
            useKey = key.slice(0, -1);
            isOptional = true;
        }

        if (isOptional) {
            // Check if we have enough space
            // Best effort static size check
            let size = 0;
            if (field.type === 'primitive' && field.primitive) {
                size = PRIMITIVE_SIZES[field.primitive];
            } else {
                // For structs/arrays without known size, we might just check strict bound > off?
                // Minimal check: we need at least 1 byte generally?
                // Let's stick to strict primitive check for now as requested for the Heartbeat case (f64).
                // Or recursively calculate min size?
                // For now, size=0 means just check we are not at EOF if typically needed, but let's trust the user 
                // implicitly wants strict check for primitives.
            }
            lines.push(`if (off + ${size} <= buf.length) {`);
            lines.push(genCodeForField(field, 'res', useKey, 'off'));
            lines.push(`}`);
        } else {
            lines.push(genCodeForField(field, 'res', useKey, 'off'));
        }
    }

    lines.push('return res;');

    const body = lines.join('\n');
    // console.log('Generated Parse:', body);
    try {
        return new Function('buf', 'offset', body) as (buf: Buffer, offset?: number) => any;
    } catch (e) {
        console.error("Failed to compile parser:", body);
        throw e;
    }
}

function genCodeForField(field: FieldDef<any>, objVar: string, key: string, offVar: string, depth: number = 0): string {
    const valVar = `${objVar}['${key}']`;
    const lines: string[] = [];

    if (field.type === 'primitive' && field.primitive) {
        const method = READ_METHODS[field.primitive];
        const size = PRIMITIVE_SIZES[field.primitive];
        lines.push(`${valVar} = buf.${method}(${offVar});`);
        lines.push(`${offVar} += ${size};`);
    } else if (field.type === 'struct' && field.structSchema) {
        lines.push(`${valVar} = {};`);
        const subObjVar = valVar;
        const schema = field.structSchema;
        for (const subKey in schema) {
            let useSubKey = subKey;
            let isOptional = false;
            if (subKey.endsWith('?')) {
                useSubKey = subKey.slice(0, -1);
                isOptional = true;
            }
            if (isOptional) {
                // nested optional
                const subField = schema[subKey]._getDef();
                let size = 0;
                if (subField.type === 'primitive' && subField.primitive) {
                    size = PRIMITIVE_SIZES[subField.primitive];
                }
                lines.push(`if (${offVar} + ${size} <= buf.length) {`);
                lines.push(genCodeForField(subField, subObjVar, useSubKey, offVar, depth + 1));
                lines.push(`}`);
            } else {
                lines.push(genCodeForField(schema[subKey]._getDef(), subObjVar, useSubKey, offVar, depth + 1));
            }
        }
    } else if (field.type === 'array' && field.arrayDef) {
        const { element, length } = field.arrayDef;
        const iVar = `i${depth}`;
        const arrVar = `arr${depth}`;

        lines.push(`var ${arrVar} = [];`);

        let condition = '';
        if (typeof length === 'number') {
            condition = `${iVar} < ${length}`;
        } else if (typeof length === 'string') {
            condition = `${iVar} < ${objVar}['${length}']`;
        } else if (length === -1) {
            condition = `${offVar} < buf.length`;
        }

        if (length === -1) {
            lines.push(`while (${offVar} < buf.length) {`);
        } else {
            lines.push(`for (var ${iVar} = 0; ${condition}; ${iVar}++) {`);
        }

        const elDef = element._getDef();
        if (elDef.type === 'primitive' && elDef.primitive) {
            const method = READ_METHODS[elDef.primitive];
            const size = PRIMITIVE_SIZES[elDef.primitive];
            lines.push(`${arrVar}.push(buf.${method}(${offVar}));`);
            lines.push(`${offVar} += ${size};`);
        } else if (elDef.type === 'struct' && elDef.structSchema) {
            const tempVar = `temp${depth}`;
            lines.push(`var ${tempVar} = {};`);
            // Assuming structs within arrays follow standard non-optional logic or explicit fields
            // If explicit optional fields are needed inside array structs, reusing the loop logic above for structs would be better.
            // But we can recursively call genCodeForField for the struct type? 
            // Currently genCodeForField recurses for structs inline.
            // The logic above for struct inlines calls genCodeForField for fields.
            // Let's refactor slightly to just recurse properly.
            // But current logic for struct fields iterates keys.
            // We need to apply the optional check here too?
            // Yes, strict correctness requires it.
            // For brevity, using the same loop structure:
            for (const subKey in elDef.structSchema) {
                let useSubKey = subKey;
                let isOptional = false;
                if (subKey.endsWith('?')) {
                    useSubKey = subKey.slice(0, -1);
                    isOptional = true;
                }
                if (isOptional) {
                    const subField = elDef.structSchema[subKey]._getDef();
                    let size = 0;
                    if (subField.type === 'primitive' && subField.primitive)
                        size = PRIMITIVE_SIZES[subField.primitive];
                    lines.push(`if (${offVar} + ${size} <= buf.length) {`);
                    lines.push(genCodeForField(subField, tempVar, useSubKey, offVar, depth + 1));
                    lines.push(`}`);
                } else {
                    lines.push(genCodeForField(elDef.structSchema[subKey]._getDef(), tempVar, useSubKey, offVar, depth + 1));
                }
            }
            lines.push(`${arrVar}.push(${tempVar});`);
        }

        lines.push(`}`); // end loop

        lines.push(`${valVar} = ${arrVar};`);
    }

    return lines.join('\n');
}

// --- Pack Compiler ---

function compilePack(schema: Record<string, FieldDef<any>>): (data: any) => Buffer {
    const sizeBody = genSizeCode(schema, 'data');
    const sizeFn = new Function('data', sizeBody) as (data: any) => number;

    const lines: string[] = [];
    lines.push('var size = sizeFn(data);');
    lines.push('var off = offset | 0;');
    lines.push('if (!buf) {');
    lines.push('  buf = Buffer.allocUnsafe(size);');
    lines.push('}');

    for (const key in schema) {
        const field = schema[key]._getDef();
        let useKey = key;
        let isOptional = false;
        if (key.endsWith('?')) {
            useKey = key.slice(0, -1);
            isOptional = true;
        }

        if (isOptional) {
            const valVar = `data['${useKey}']`;
            lines.push(`if (${valVar} !== undefined) {`);
            lines.push(genPackCode(field, 'data', useKey, 'off'));
            lines.push(`}`);
        } else {
            lines.push(genPackCode(field, 'data', useKey, 'off'));
        }
    }

    lines.push('return buf;');

    const body = lines.join('\n');

    try {
        const fn = new Function('data', 'buf', 'offset', 'Buffer', 'sizeFn', body);
        return (data: any, target?: Buffer, offset?: number) => fn(data, target, offset, Buffer, sizeFn);
    } catch (e) {
        console.error("Failed to compile packer:", body);
        throw e;
    }
}

function genSizeCode(schema: Record<string, FieldDef<any>>, objVar: string, depth: number = 0): string {
    const lines: string[] = ['var size = 0;'];

    for (const key in schema) {
        const field = schema[key]._getDef();

        let useKey = key;
        let isOptional = false;
        if (key.endsWith('?')) {
            useKey = key.slice(0, -1);
            isOptional = true;
        }

        const valVar = `${objVar}['${useKey}']`;

        if (isOptional) {
            lines.push(`if (${valVar} !== undefined) {`);
        }

        if (field.type === 'primitive' && field.primitive) {
            lines.push(`size += ${PRIMITIVE_SIZES[field.primitive]};`);
        } else if (field.type === 'struct' && field.structSchema) {
            lines.push(genSizeBlock(field, valVar, depth));
        } else if (field.type === 'array' && field.arrayDef) {
            const { element } = field.arrayDef;
            const iVar = `i${depth}`;

            const elDef = element._getDef();
            if (elDef.type === 'primitive' && elDef.primitive) {
                const sz = PRIMITIVE_SIZES[elDef.primitive];
                lines.push(`size += ${valVar}.length * ${sz};`);
            } else {
                lines.push(`for (var ${iVar} = 0; ${iVar} < ${valVar}.length; ${iVar}++) {`);
                // For nested structs in arrays, genSizeBlock expects field.
                // But genSizeBlock iterates properties.
                if (elDef.type === 'struct') {
                    lines.push(genSizeBlock(elDef, `${valVar}[${iVar}]`, depth + 1));
                }
                lines.push(`}`);
            }
        }

        if (isOptional) {
            lines.push(`}`);
        }
    }

    lines.push('return size;');
    return lines.join('\n');
}

function genSizeBlock(field: FieldDef<any>, valVar: string, depth: number): string {
    const lines: string[] = [];
    if (field.type === 'primitive' && field.primitive) {
        lines.push(`size += ${PRIMITIVE_SIZES[field.primitive]};`);
    } else if (field.type === 'struct' && field.structSchema) {
        for (const key in field.structSchema) {
            let useKey = key;
            let isOptional = false;
            if (key.endsWith('?')) {
                useKey = key.slice(0, -1);
                isOptional = true;
            }
            const childValVar = `${valVar}['${useKey}']`;
            if (isOptional) lines.push(`if (${childValVar} !== undefined) {`);
            lines.push(genSizeBlock(field.structSchema[key]._getDef(), childValVar, depth + 1));
            if (isOptional) lines.push(`}`);
        }
    } else if (field.type === 'array' && field.arrayDef) {
        const { element } = field.arrayDef;
        const iVar = `i_sz_${depth}`;
        const elDef = element._getDef();
        if (elDef.type === 'primitive' && elDef.primitive) {
            const sz = PRIMITIVE_SIZES[elDef.primitive];
            lines.push(`size += ${valVar}.length * ${sz};`);
        } else {
            lines.push(`for (var ${iVar} = 0; ${iVar} < ${valVar}.length; ${iVar}++) {`);
            lines.push(genSizeBlock(element._getDef(), `${valVar}[${iVar}]`, depth + 1));
            lines.push(`}`);
        }
    }
    return lines.join('\n');
}

function genPackCode(field: FieldDef<any>, objVar: string, key: string, offVar: string, depth: number = 0): string {
    const valVar = `${objVar}['${key}']`;
    const lines: string[] = [];

    if (field.type === 'primitive' && field.primitive) {
        const method = WRITE_METHODS[field.primitive];
        const size = PRIMITIVE_SIZES[field.primitive];
        lines.push(`buf.${method}(${valVar}, ${offVar});`);
        lines.push(`${offVar} += ${size};`);
    } else if (field.type === 'struct' && field.structSchema) {
        const schema = field.structSchema;
        for (const subKey in schema) {
            let useSubKey = subKey;
            let isOptional = false;
            if (subKey.endsWith('?')) {
                useSubKey = subKey.slice(0, -1);
                isOptional = true;
            }
            if (isOptional) {
                // valVar is the parent object here.
                // We need to access subKey on valVar.
                const childValVar = `${valVar}['${useSubKey}']`;
                lines.push(`if (${childValVar} !== undefined) {`);
                lines.push(genPackCode(schema[subKey]._getDef(), valVar, useSubKey, offVar, depth + 1));
                lines.push(`}`);
            } else {
                lines.push(genPackCode(schema[subKey]._getDef(), valVar, useSubKey, offVar, depth + 1));
            }
        }
    } else if (field.type === 'array' && field.arrayDef) {
        const { element } = field.arrayDef;
        const iVar = `i${depth}`;

        lines.push(`for (var ${iVar} = 0; ${iVar} < ${valVar}.length; ${iVar}++) {`);
        const itemVar = `${valVar}[${iVar}]`;

        const elDef = element._getDef();
        if (elDef.type === 'primitive' && elDef.primitive) {
            const method = WRITE_METHODS[elDef.primitive];
            const size = PRIMITIVE_SIZES[elDef.primitive];
            lines.push(`buf.${method}(${itemVar}, ${offVar});`);
            lines.push(`${offVar} += ${size};`);
        } else if (elDef.type === 'struct' && elDef.structSchema) {
            for (const subKey in elDef.structSchema) {
                let useSubKey = subKey;
                let isOptional = false;
                if (subKey.endsWith('?')) {
                    useSubKey = subKey.slice(0, -1);
                    isOptional = true;
                }
                const childValVar = `${itemVar}['${useSubKey}']`;

                if (isOptional) {
                    lines.push(`if (${childValVar} !== undefined) {`);
                    lines.push(genPackCode(elDef.structSchema[subKey]._getDef(), itemVar, useSubKey, offVar, depth + 1));
                    lines.push(`}`);
                } else {
                    lines.push(genPackCode(elDef.structSchema[subKey]._getDef(), itemVar, useSubKey, offVar, depth + 1));
                }
            }
        }

        lines.push(`}`);
    }

    return lines.join('\n');
}
