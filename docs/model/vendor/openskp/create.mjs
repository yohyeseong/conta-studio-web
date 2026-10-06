import { loadScaffold, MATERIAL_INSERT_POS, BASE, LAYER_COUNT_POS, ORIG_LAYER_COUNT, LAYER_INSERT_POS, DEF_COUNT_POS, ORIG_DEF_COUNT, ROOT_COUNT_POS, ORIG_ROOT_COUNT, TAIL_POS, SCAFFOLD_NEXT_SLOT, LAYER_WRITER_BASE, SCAFFOLD_CLASS_SLOT } from './scaffold.mjs';
export class SkpWriteError extends Error {
    constructor(message){
        super(message);
        this.name = 'SkpWriteError';
        Object.setPrototypeOf(this, SkpWriteError.prototype);
    }
}
function hexToBytes(hex) {
    const out = [];
    for(let i = 0; i < hex.length; i += 2)out.push(parseInt(hex.slice(i, i + 2), 16));
    return out;
}
const TAIL_REF_POSITIONS = [
    409,
    468,
    477,
    479,
    1383,
    1385
];
const ISO_CAMERA_PREFIX_OFFSET = 2993;
const ISO_CAMERA_PREFIX_PATCH = hexToBytes('594000000000000059c000000000000059400000000000000000000000000000' + '000000000000000000003f2c0c70bd20dabf3f2c0c70bd20da3f3f2c0c70bd20' + 'ea3f000000000000f03f0000000000408f40000000000000003e402adf272c80' + '3457');
const ISO_CAMERA_TAIL_PATCHES = [
    [
        509,
        hexToBytes('d0a869613c442d4799a4667d1adfa836')
    ],
    [
        1390,
        hexToBytes('4e53c84477029246bba95827bba7e2')
    ]
];
const ACTIVE_LAYER_ANCHOR_REL = 0;
const PID_COUNTER_POS = 1987;
const MATERIAL_SCHEMA = 12;
const DIB_SCHEMA = 3;
const _TEXTURE_H_SENTINEL = hexToBytes('f0ffffffffffff0f');
const DEFINITION_SCHEMA = 11;
const INSTANCE_SCHEMA = 6;
const GROUP_SCHEMA = 1;
const IMAGE_SCHEMA = 6;
const THUMBNAIL_SCHEMA = 1;
const LAYER_SCHEMA = 3;
const FTC_SCHEMA = 4;
const ARCCURVE_SCHEMA = 3;
const CCURVE_SCHEMA = 4;
const SECTIONPLANE_SCHEMA = 3;
const DIMENSIONLINEAR_SCHEMA = 6;
const SKFONT_SCHEMA = 1;
const TEXT_SCHEMA = 9;
const CONSTRUCTIONLINE_SCHEMA = 1;
const CONSTRUCTIONPOINT_SCHEMA = 0;
const DIM_FONT_PAYLOAD = hexToBytes('000000' + 'fffeff065400610068006f006d006100' + '0000' + '08000000' + '00' + 'ecf57abd5eaf2340');
const TEXT_DELIM = hexToBytes('0100000001000300000001');
const CLINE_INFINITE = 1e30;
const CCAMERA_SLOT = 7;
const ATTR_CONTAINER_SLOT = 3;
const ATTRIBUTE_NAMED_SLOT = 5;
const ATTR_TYPE_INT32 = 0x04;
const ATTR_TYPE_DOUBLE = 0x06;
const ATTR_TYPE_STRING = 0x0a;
const CAMERA_TEMPLATE = hexToBytes('00000000000000000000000000000000000000000000f03f0000000000000000' + '00000000000000000000000000000000004000000000000000000000000000f0' + '3f0000000000000000000000000000000000000000000000000100000000003e' + '40000000000000f03f0000000000000000000000000000000000000000000000' + '0000000000000000000100fffeff00000000000000000000000000000000f03f' + '00000000000000000000000000000000');
const DEFINITION_BASE_BLOCK = [
    0,
    0,
    0,
    1,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
];
const IDENTITY_UV_MATRIX = [
    1,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    1
];
function det3(m) {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}
function solve3x3(a, b) {
    const d = det3(a);
    if (Math.abs(d) < 1e-9) {
        throw new SkpWriteError('the 3 texture-positioning points map to collinear (u, v) coordinates - ' + 'cannot determine a texture mapping from them');
    }
    const cols = [];
    for(let col = 0; col < 3; col++){
        const ai = a.map((row)=>row.slice());
        for(let r = 0; r < 3; r++)ai[r][col] = b[r];
        cols.push(det3(ai) / d);
    }
    return [
        cols[0],
        cols[1],
        cols[2]
    ];
}
function cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}
function normalize3(v) {
    const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (length < 1e-9) {
        throw new SkpWriteError("cannot determine a texture-positioning basis: the face's first edge is degenerate");
    }
    return [
        v[0] / length,
        v[1] / length,
        v[2] / length
    ];
}
function rotationMatrix3x3(axis, angleRadians) {
    const length = Math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2);
    if (length < 1e-9) throw new SkpWriteError('rotation axis must not be the zero vector');
    const x = axis[0] / length;
    const y = axis[1] / length;
    const z = axis[2] / length;
    const c = Math.cos(angleRadians);
    const s = Math.sin(angleRadians);
    const t = 1.0 - c;
    return [
        t * x * x + c,
        t * x * y - s * z,
        t * x * z + s * y,
        t * x * y + s * z,
        t * y * y + c,
        t * y * z - s * x,
        t * x * z - s * y,
        t * y * z + s * x,
        t * z * z + c
    ];
}
function resolveMatrix3x3(matrix3x3, rotation) {
    if (matrix3x3 !== undefined && rotation !== undefined) {
        throw new SkpWriteError('pass at most one of matrix3x3/rotation - rotation is just a convenience for matrix3x3');
    }
    if (rotation !== undefined) return rotationMatrix3x3(rotation.axis, rotation.angleRadians);
    return matrix3x3;
}
function faceUvBasis(points, normal) {
    const u = normalize3([
        points[1][0] - points[0][0],
        points[1][1] - points[0][1],
        points[1][2] - points[0][2]
    ]);
    const w = normalize3(cross(normal, u));
    return [
        u,
        w
    ];
}
function circleBasis(normal) {
    const seed = Math.abs(normal[2]) < 0.9 ? [
        0,
        0,
        1
    ] : [
        1,
        0,
        0
    ];
    const dot = seed[0] * normal[0] + seed[1] * normal[1] + seed[2] * normal[2];
    const uRaw = [
        seed[0] - dot * normal[0],
        seed[1] - dot * normal[1],
        seed[2] - dot * normal[2]
    ];
    const u = normalize3(uRaw);
    const w = normalize3(cross(normal, u));
    return [
        u,
        w
    ];
}
function circlePoints(center, radius, numSegments, u, w) {
    const pts = [];
    for(let i = 0; i < numSegments; i++){
        const angle = 2.0 * Math.PI * i / numSegments;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        pts.push([
            center[0] + radius * (c * u[0] + s * w[0]),
            center[1] + radius * (c * u[1] + s * w[1]),
            center[2] + radius * (c * u[2] + s * w[2])
        ]);
    }
    return pts;
}
function arcPoints(center, radius, numSegments, u, w, startAngle, endAngle) {
    const pts = [];
    for(let i = 0; i <= numSegments; i++){
        const angle = startAngle + (endAngle - startAngle) * i / numSegments;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        pts.push([
            center[0] + radius * (c * u[0] + s * w[0]),
            center[1] + radius * (c * u[1] + s * w[1]),
            center[2] + radius * (c * u[2] + s * w[2])
        ]);
    }
    return pts;
}
function solveUvMatrix(pairs, basis) {
    if (pairs.length !== 3) throw new SkpWriteError('texture positioning needs exactly 3 (point, uv) pairs');
    const [uAxis, wAxis] = basis;
    const a = pairs.map(([, uv])=>[
            uv[0],
            uv[1],
            1.0
        ]);
    const bx = pairs.map(([pt])=>pt[0] * uAxis[0] + pt[1] * uAxis[1] + pt[2] * uAxis[2]);
    const by = pairs.map(([pt])=>pt[0] * wAxis[0] + pt[1] * wAxis[1] + pt[2] * wAxis[2]);
    const [a0, c0, e0] = solve3x3(a, bx);
    const [b0, d0, f0] = solve3x3(a, by);
    return [
        a0,
        b0,
        0.0,
        c0,
        d0,
        0.0,
        e0,
        f0,
        1.0
    ];
}
function uvMatrixForFace(points, pairs, normal) {
    return solveUvMatrix(pairs, faceUvBasis(points, normal));
}
class GrowableBytes {
    buf;
    length = 0;
    constructor(capacity = 1 << 16){
        this.buf = new Uint8Array(capacity);
    }
    reserve(extra) {
        const needed = this.length + extra;
        if (needed <= this.buf.length) return;
        let capacity = this.buf.length * 2;
        while(capacity < needed)capacity *= 2;
        const next = new Uint8Array(capacity);
        next.set(this.buf.subarray(0, this.length));
        this.buf = next;
    }
    push(...values) {
        this.reserve(values.length);
        const buf = this.buf;
        let n = this.length;
        for(let i = 0; i < values.length; i++)buf[n++] = values[i];
        this.length = n;
    }
    append(src) {
        this.reserve(src.length);
        this.buf.set(src instanceof Uint8Array ? src : Uint8Array.from(src), this.length);
        this.length += src.length;
    }
    view() {
        return this.buf.subarray(0, this.length);
    }
}
function f64Bytes(v) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, true);
    return Array.from(b);
}
function u32Bytes(v) {
    return [
        v & 0xff,
        v >>> 8 & 0xff,
        v >>> 16 & 0xff,
        v >>> 24 & 0xff
    ];
}
function readU16(buf, pos) {
    return (buf[pos] | buf[pos + 1] << 8) & 0xffff;
}
function writeU16At(buf, pos, v) {
    buf[pos] = v & 0xff;
    buf[pos + 1] = v >> 8 & 0xff;
}
function writeU32At(buf, pos, v) {
    const b = u32Bytes(v);
    buf[pos] = b[0];
    buf[pos + 1] = b[1];
    buf[pos + 2] = b[2];
    buf[pos + 3] = b[3];
}
function shiftRef(buf, pos, shift) {
    const u16 = readU16(buf, pos);
    const tagBit = u16 & 0x8000;
    const slot = u16 & 0x7fff;
    const newSlot = slot + shift;
    if (newSlot < 0x7fff) {
        writeU16At(buf, pos, tagBit | newSlot);
        return 0;
    }
    const val = tagBit ? (0x80000000 | newSlot) >>> 0 : newSlot;
    buf.splice(pos, 2, 0xff, 0x7f, ...u32Bytes(val));
    return 4;
}
function randomGuidBytes() {
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
    } else {
        for(let i = 0; i < 16; i++)bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = bytes[6] & 0x0f | 0x40;
    bytes[8] = bytes[8] & 0x3f | 0x80;
    return Array.from(bytes);
}
function detectImageSubtype(imageBytes) {
    if (imageBytes.length >= 8 && imageBytes[0] === 0x89 && imageBytes[1] === 0x50 && imageBytes[2] === 0x4e && imageBytes[3] === 0x47 && imageBytes[4] === 0x0d && imageBytes[5] === 0x0a && imageBytes[6] === 0x1a && imageBytes[7] === 0x0a) {
        return 4;
    }
    if (imageBytes.length >= 3 && imageBytes[0] === 0xff && imageBytes[1] === 0xd8 && imageBytes[2] === 0xff) {
        return 1;
    }
    throw new SkpWriteError('unrecognized image format - only PNG and JPEG textures are supported for now ' + "(detected from the file's own magic bytes, not its extension)");
}
function vertexKey(p) {
    return `${p[0]}|${p[1]}|${p[2]}`;
}
function edgeKey(a, b) {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
}
class ArchiveWriter {
    nextSlot;
    classSlot;
    nextPid;
    bytes = new GrowableBytes();
    dimFontSlot = null;
    constructor(nextSlot, classSlot, nextPid = 1){
        this.nextSlot = nextSlot;
        this.classSlot = {
            ...classSlot
        };
        this.nextPid = nextPid;
    }
    get length() {
        return this.bytes.length;
    }
    alloc() {
        const s = this.nextSlot;
        this.nextSlot += 1;
        return s;
    }
    allocPid() {
        const p = this.nextPid;
        this.nextPid += 1;
        return p;
    }
    pushU8(v) {
        this.bytes.push(v & 0xff);
    }
    pushU16(v) {
        this.bytes.push(v & 0xff, v >> 8 & 0xff);
    }
    pushU32(v) {
        this.bytes.push(...u32Bytes(v));
    }
    pushI32(v) {
        this.pushU32(v);
    }
    pushF64(v) {
        this.bytes.push(...f64Bytes(v));
    }
    pushBytes(arr) {
        for(let i = 0; i < arr.length; i++)this.bytes.push(arr[i]);
    }
    pushZeros(n) {
        for(let i = 0; i < n; i++)this.bytes.push(0);
    }
    patchU32(pos, v) {
        writeU32At(this.bytes.buf, pos, v);
    }
    newOfKnownClass(className, schema) {
        if (!(className in this.classSlot)) {
            if (schema === undefined) throw new SkpWriteError(`${className} not yet declared and no schema given`);
            this.pushU16(0xffff);
            this.pushU16(schema);
            this.pushU16(className.length);
            for(let i = 0; i < className.length; i++)this.bytes.push(className.charCodeAt(i) & 0xff);
            this.classSlot[className] = this.alloc();
            return this.alloc();
        }
        const slot = this.classSlot[className];
        if (slot < 0x7fff) {
            this.pushU16(0x8000 | slot);
        } else {
            this.pushU16(0x7fff);
            this.pushU32(0x80000000 | slot);
        }
        return this.alloc();
    }
    writeNull() {
        this.pushU16(0);
    }
    writeBackref(slot) {
        if (slot < 0x7fff) {
            this.pushU16(slot);
        } else {
            this.pushU16(0x7fff);
            this.pushU32(slot);
        }
    }
    encodePid(pid) {
        let mask = 0;
        const pidBytes = [];
        let p = pid;
        for(let bit = 0; bit < 8; bit++){
            const byteVal = p % 256;
            p = Math.floor(p / 256);
            if (byteVal) {
                mask |= 1 << bit;
                pidBytes.push(byteVal);
            }
        }
        return [
            mask,
            ...pidBytes
        ];
    }
    preamble(pid, realAttrs = false) {
        if (realAttrs) {
            this.pushU16(0x8000 | ATTR_CONTAINER_SLOT);
            this.alloc();
            this.pushZeros(3);
            this.pushU16(0);
        } else {
            this.writeNull();
        }
        const realPid = pid === undefined ? this.allocPid() : pid;
        this.pushBytes(this.encodePid(realPid));
    }
    preambleWithRealAttrs(frontMatrix, backMatrix, attributeDicts = [], pid) {
        this.pushU16(0x8000 | ATTR_CONTAINER_SLOT);
        this.alloc();
        this.pushZeros(3);
        if (frontMatrix !== undefined || backMatrix !== undefined) {
            this.writeFaceTextureCoords(frontMatrix, backMatrix);
        }
        for (const [dictName, entries] of attributeDicts){
            this.writeAttributeDict(dictName, entries);
        }
        this.writeNull();
        const realPid = pid === undefined ? this.allocPid() : pid;
        this.pushBytes(this.encodePid(realPid));
    }
    validateAttributeEntries(entries) {
        for (const [key, value] of Object.entries(entries)){
            if (typeof value === 'boolean') {
                throw new SkpWriteError(`attribute ${JSON.stringify(key)}: bool is not a supported value type - use 0/1 instead`);
            }
            if (typeof value !== 'string' && typeof value !== 'number') {
                throw new SkpWriteError(`attribute ${JSON.stringify(key)}: unsupported value type (only str and number are supported)`);
            }
        }
    }
    writeAttributeDict(dictName, entries) {
        this.pushU16(0x8000 | ATTRIBUTE_NAMED_SLOT);
        this.alloc();
        this.pushZeros(3);
        this.pushU32(0);
        this.validateAttributeEntries(entries);
        this.writeStr(dictName);
        for (const [key, value] of Object.entries(entries)){
            this.writeStr(key);
            if (typeof value === 'string') {
                this.pushU8(ATTR_TYPE_STRING);
                this.writeStr(value);
            } else if (Number.isInteger(value) && value >= -(2 ** 31) && value < 2 ** 31) {
                this.pushU8(ATTR_TYPE_INT32);
                this.pushI32(value);
            } else {
                this.pushU8(ATTR_TYPE_DOUBLE);
                this.pushF64(value);
            }
        }
        this.writeStr('');
        this.pushU32(0);
    }
    writeFaceTextureCoords(frontMatrix, backMatrix) {
        this.newOfKnownClass('CFaceTextureCoords', FTC_SCHEMA);
        this.preamble(0);
        this.pushU32(0);
        const ks = new Array(24).fill(0);
        const front = frontMatrix ?? IDENTITY_UV_MATRIX;
        const back = backMatrix ?? IDENTITY_UV_MATRIX;
        for(let i = 0; i < 9; i++)ks[i] = front[i];
        for(let i = 0; i < 9; i++)ks[12 + i] = back[i];
        for (const v of ks)this.pushF64(v);
        this.pushU32(0);
        this.pushU32(0);
        this.pushU32(frontMatrix !== undefined ? 1 : 0);
        this.pushU32(backMatrix !== undefined ? 1 : 0);
    }
    drawbase(mat = 0, layer = 0, hidden = false, soft = false, smooth = false) {
        const b = new Array(10).fill(0);
        b[0] = mat & 0xff;
        b[1] = mat >> 8 & 0xff;
        b[2] = hidden ? 1 : 0;
        b[3] = 1;
        b[4] = 1;
        b[5] = soft ? 1 : 0;
        b[6] = smooth ? 1 : 0;
        b[8] = layer & 0xff;
        b[9] = layer >> 8 & 0xff;
        this.pushBytes(b);
    }
    writeVertex(point) {
        const slot = this.newOfKnownClass('CVertex', 0);
        this.preamble();
        this.pushF64(point[0]);
        this.pushF64(point[1]);
        this.pushF64(point[2]);
        return slot;
    }
    writeArcCurve(p) {
        if (!(p.numSegments >= 0 && p.numSegments <= 0xff)) {
            throw new SkpWriteError(`num_segments must be between 0 and 255, got ${p.numSegments}`);
        }
        const slot = this.newOfKnownClass('CArcCurve', ARCCURVE_SCHEMA);
        this.preamble();
        this.pushBytes([
            0,
            p.numSegments,
            0,
            0,
            0
        ]);
        const values = [
            ...p.center,
            ...p.normal,
            ...p.xaxis,
            p.startAngle,
            p.endAngle,
            0.0,
            p.radius,
            0.0
        ];
        for (const v of values)this.pushF64(v);
        return slot;
    }
    writeCurve(numEdges) {
        const slot = this.newOfKnownClass('CCurve', CCURVE_SCHEMA);
        this.preamble();
        this.pushU8(1);
        this.pushU32(numEdges);
        return slot;
    }
    writeStr(s) {
        if (s.length >= 0xff) throw new SkpWriteError('string too long to encode (255 char limit)');
        this.bytes.push(0xff, 0xfe, 0xff, s.length);
        for(let i = 0; i < s.length; i++){
            const c = s.charCodeAt(i);
            this.bytes.push(c & 0xff, c >> 8 & 0xff);
        }
    }
    writeDimFontRef() {
        if (this.dimFontSlot === null) {
            this.dimFontSlot = this.newOfKnownClass('CSkFont', SKFONT_SCHEMA);
            this.pushBytes(DIM_FONT_PAYLOAD);
        } else {
            this.writeBackref(this.dimFontSlot);
        }
    }
    writeDimension(p1, p2, offset = 10.0) {
        if (p1[0] === p2[0] && p1[1] === p2[1] && p1[2] === p2[2]) {
            throw new SkpWriteError('addDimension endpoints coincide');
        }
        this.newOfKnownClass('CDimensionLinear', DIMENSIONLINEAR_SCHEMA);
        this.preamble();
        this.drawbase();
        this.writeStr('');
        this.writeDimFontRef();
        this.pushZeros(5);
        this.pushU32(1);
        this.pushU32(4);
        this.pushF64(p1[0]);
        this.pushF64(p1[1]);
        this.pushF64(p1[2]);
        this.pushU16(0);
        this.pushZeros(10);
        this.pushU32(1);
        this.pushU32(4);
        this.pushF64(p2[0]);
        this.pushF64(p2[1]);
        this.pushF64(p2[2]);
        this.pushU16(0);
        this.pushZeros(2);
        for (const v of [
            0.0,
            0.0,
            0.0,
            1.0,
            1.0,
            0.0,
            0.0
        ])this.pushF64(v);
        this.pushU32(0);
        this.pushF64(offset);
        this.pushF64(0.0);
        this.pushU32(1);
    }
    writeText(text, point, leader = [
        15.0,
        15.0,
        15.0
    ]) {
        const lb = [
            point[0] + leader[0],
            point[1] + leader[1],
            point[2] + leader[2]
        ];
        this.newOfKnownClass('CText', TEXT_SCHEMA);
        this.preamble();
        this.drawbase();
        this.writeDimFontRef();
        this.pushF64(0.0);
        this.pushF64(0.0);
        this.pushU32(1);
        this.pushU32(4);
        this.pushF64(point[0]);
        this.pushF64(point[1]);
        this.pushF64(point[2]);
        this.pushZeros(12);
        this.pushF64(lb[0]);
        this.pushF64(lb[1]);
        this.pushF64(lb[2]);
        this.pushZeros(16);
        this.pushF64(1.0);
        this.pushU32(2);
        this.pushBytes(TEXT_DELIM);
        this.writeStr(text);
        this.pushZeros(5);
    }
    writeConstructionLine(point, point2, direction) {
        if (point2 === undefined === (direction === undefined)) {
            throw new SkpWriteError('addConstructionLine: pass exactly one of point2 or direction');
        }
        let dir;
        let startParam;
        let endParam;
        if (point2 !== undefined) {
            const dx = point2[0] - point[0];
            const dy = point2[1] - point[1];
            const dz = point2[2] - point[2];
            const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (length === 0.0) throw new SkpWriteError('addConstructionLine: point and point2 coincide');
            dir = [
                dx / length,
                dy / length,
                dz / length
            ];
            startParam = 0.0;
            endParam = length;
        } else {
            const d = direction;
            const dlen = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
            if (dlen === 0.0) throw new SkpWriteError('addConstructionLine: direction must be nonzero');
            dir = [
                d[0] / dlen,
                d[1] / dlen,
                d[2] / dlen
            ];
            startParam = -CLINE_INFINITE;
            endParam = CLINE_INFINITE;
        }
        this.newOfKnownClass('CConstructionLine', CONSTRUCTIONLINE_SCHEMA);
        this.preamble();
        this.drawbase();
        for (const v of [
            point[0],
            point[1],
            point[2],
            dir[0],
            dir[1],
            dir[2],
            startParam,
            endParam
        ])this.pushF64(v);
        this.pushZeros(4);
    }
    writeConstructionPoint(position) {
        this.newOfKnownClass('CConstructionPoint', CONSTRUCTIONPOINT_SCHEMA);
        this.preamble();
        this.drawbase();
        for (const v of [
            position[0],
            position[1],
            position[2],
            0.0,
            0.0,
            0.0
        ])this.pushF64(v);
        this.pushZeros(1);
    }
    writeSectionPlane(point, normal) {
        const nlen = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
        if (nlen === 0.0) throw new SkpWriteError('addSectionPlane: normal must be nonzero');
        const a = normal[0] / nlen;
        const b = normal[1] / nlen;
        const c = normal[2] / nlen;
        const d = -(a * point[0] + b * point[1] + c * point[2]);
        this.newOfKnownClass('CSectionPlane', SECTIONPLANE_SCHEMA);
        this.preamble();
        this.drawbase();
        this.pushF64(a);
        this.pushF64(b);
        this.pushF64(c);
        this.pushF64(d);
    }
    writeMaterial(name, rgba, opacity) {
        const slot = this.newOfKnownClass('CMaterial', MATERIAL_SCHEMA);
        this.preamble();
        this.writeStr(name);
        this.pushU16(0);
        this.pushBytes(rgba);
        this.writeStr('');
        this.pushZeros(8);
        this.pushF64(opacity === undefined ? 1.0 : 1.0 - opacity);
        this.pushU8(opacity === undefined ? 0 : 1);
        return slot;
    }
    writeTexturedMaterial(name, imageBytes, texturePath, subtype, appliedHeight, appliedWidth, opacity) {
        const slot = this.newOfKnownClass('CMaterial', MATERIAL_SCHEMA);
        this.preamble();
        this.writeStr(name);
        this.pushU16(1);
        this.pushZeros(2);
        this.newOfKnownClass('CDib', DIB_SCHEMA);
        this.pushU32(subtype);
        this.pushU32(imageBytes.length);
        this.pushBytes(imageBytes);
        if (subtype === 1) {
            this.pushU32(90);
        }
        this.pushF64(appliedWidth !== undefined ? appliedWidth : 1.0);
        this.pushF64(appliedHeight !== undefined ? appliedHeight : 1.0);
        this.writeStr(texturePath);
        this.pushBytes([
            255,
            255,
            255,
            254,
            0,
            255,
            255,
            255,
            254
        ]);
        this.writeStr('');
        this.pushU32(1);
        this.pushU32(0);
        this.pushF64(opacity === undefined ? 1.0 : 1.0 - opacity);
        this.pushU8(opacity === undefined ? 0 : 1);
        return slot;
    }
    writeLayer(name, withPids = true, hidden = false, rgba) {
        const slot = this.newOfKnownClass('CLayer', LAYER_SCHEMA);
        this.preamble(withPids ? undefined : 0);
        this.writeStr(name);
        const pid2 = withPids ? this.allocPid() : 0;
        this.pushBytes([
            hidden ? 1 : 0,
            0,
            0
        ]);
        this.pushBytes(this.encodePid(pid2));
        this.writeStr(`Layer_${name}`);
        this.pushU16(256);
        this.pushBytes(rgba ?? [
            0,
            0,
            0,
            0
        ]);
        this.writeStr('');
        this.pushZeros(8);
        this.pushF64(0.5);
        this.pushZeros(5);
        return slot;
    }
    writeThumbnail() {
        this.newOfKnownClass('CThumbnail', THUMBNAIL_SCHEMA);
        this.preamble(0);
        this.pushU16(0x8000 | CCAMERA_SLOT);
        this.alloc();
        this.pushBytes(CAMERA_TEMPLATE);
        this.writeNull();
    }
    writeDefinitionHeader(attributeDicts = []) {
        const slot = this.newOfKnownClass('CComponentDefinition', DEFINITION_SCHEMA);
        if (attributeDicts.length > 0) {
            this.preambleWithRealAttrs(undefined, undefined, attributeDicts);
        } else {
            this.preamble(undefined, true);
        }
        this.pushBytes(DEFINITION_BASE_BLOCK);
        this.pushU32(1);
        const embeddedLayerSlot = this.writeLayer('Layer0', false);
        this.writeBackref(embeddedLayerSlot);
        this.pushU32(0);
        const countPatchPos = this.length;
        this.pushU32(0);
        return [
            slot,
            countPatchPos
        ];
    }
    writeDefinitionTail(name) {
        this.pushU32(0);
        this.pushU16(0);
        this.pushBytes(randomGuidBytes());
        this.writeStr(name);
        this.writeStr('');
        this.writeStr('');
        this.pushU32(Math.floor(Date.now() / 1000));
        this.pushZeros(43);
        this.writeThumbnail();
    }
    writeInstanceLike(className, schema, realAttrs, definitionSlot, name, translation, matrix3x3, mat, layer, attributeDicts = [], hidden = false) {
        this.newOfKnownClass(className, schema);
        if (realAttrs && attributeDicts.length > 0) {
            this.preambleWithRealAttrs(undefined, undefined, attributeDicts);
        } else {
            this.preamble(undefined, realAttrs);
        }
        this.drawbase(mat, layer, hidden);
        this.writeBackref(definitionSlot);
        const m = matrix3x3 ?? [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1
        ];
        for (const v of [
            ...m,
            ...translation,
            1.0
        ])this.pushF64(v);
        this.writeStr(name);
        this.pushBytes(randomGuidBytes());
    }
    writeInstance(definitionSlot, name, translation = [
        0,
        0,
        0
    ], matrix3x3, instanceMaterial = 0, instanceLayer = 0, attributeDicts = [], hidden = false) {
        this.writeInstanceLike('CComponentInstance', INSTANCE_SCHEMA, true, definitionSlot, name, translation, matrix3x3, instanceMaterial, instanceLayer, attributeDicts, hidden);
        return 1;
    }
    writeGroup(definitionSlot, name, translation = [
        0,
        0,
        0
    ], matrix3x3, groupMaterial = 0, groupLayer = 0, attributeDicts = [], hidden = false) {
        this.writeInstanceLike('CGroup', GROUP_SCHEMA, attributeDicts.length > 0, definitionSlot, name, translation, matrix3x3, groupMaterial, groupLayer, attributeDicts, hidden);
        return 1;
    }
    writeImage(definitionSlot, translation = [
        0,
        0,
        0
    ], matrix3x3, imageLayer = 0, hidden = false) {
        this.writeInstanceLike('CImage', IMAGE_SCHEMA, false, definitionSlot, '', translation, matrix3x3, 0, imageLayer, [], hidden);
        return 1;
    }
    writeEdgeChain(points, vertexSlots, edgeRegistry, closed, hiddenEdges = false, softEdges = false, smoothEdges = false, curveParams, polylineNumEdges) {
        const n = points.length;
        const pairCount = closed ? n : n - 1;
        const pointSlots = points.map((p)=>vertexSlots.get(vertexKey(p)));
        const edgeSlots = [];
        const edgeSenses = [];
        let newEntities = 0;
        let curveSlot;
        for(let i = 0; i < pairCount; i++){
            const v1Idx = i;
            const v2Idx = (i + 1) % n;
            const v1Known = pointSlots[v1Idx];
            const v2Known = pointSlots[v2Idx];
            const key = v1Known !== undefined && v2Known !== undefined ? edgeKey(v1Known, v2Known) : undefined;
            if (key !== undefined && edgeRegistry.has(key)) {
                const [edgeSlot, fwdV1] = edgeRegistry.get(key);
                edgeSlots.push(edgeSlot);
                edgeSenses.push(fwdV1 === v1Known ? 0 : 1);
                continue;
            }
            const edgeSlot = this.newOfKnownClass('CEdge', 2);
            this.preamble();
            this.drawbase(0, 0, hiddenEdges, softEdges, smoothEdges);
            for (const idx of [
                v1Idx,
                v2Idx
            ]){
                if (pointSlots[idx] === undefined) {
                    const s = this.writeVertex(points[idx]);
                    pointSlots[idx] = s;
                    vertexSlots.set(vertexKey(points[idx]), s);
                } else {
                    this.writeBackref(pointSlots[idx]);
                }
            }
            if (curveSlot !== undefined) {
                this.writeBackref(curveSlot);
            } else if (curveParams !== undefined) {
                curveSlot = this.writeArcCurve(curveParams);
            } else if (polylineNumEdges !== undefined) {
                curveSlot = this.writeCurve(polylineNumEdges);
            } else {
                this.writeNull();
            }
            edgeSlots.push(edgeSlot);
            edgeSenses.push(0);
            newEntities += 1;
            edgeRegistry.set(edgeKey(pointSlots[v1Idx], pointSlots[v2Idx]), [
                edgeSlot,
                pointSlots[v1Idx]
            ]);
        }
        return [
            edgeSlots,
            edgeSenses,
            newEntities
        ];
    }
    writeArc(points, vertexSlots, edgeRegistry, curveParams, hiddenEdges = false, softEdges = false, smoothEdges = false) {
        const [, , newEntities] = this.writeEdgeChain(points, vertexSlots, edgeRegistry, false, hiddenEdges, softEdges, smoothEdges, curveParams);
        return newEntities;
    }
    writePolyline(points, vertexSlots, edgeRegistry, closed = false, hiddenEdges = false, softEdges = false, smoothEdges = false) {
        const n = points.length;
        const pairCount = closed ? n : n - 1;
        const [, , newEntities] = this.writeEdgeChain(points, vertexSlots, edgeRegistry, closed, hiddenEdges, softEdges, smoothEdges, undefined, pairCount);
        return newEntities;
    }
    writeFace(points, vertexSlots, edgeRegistry, faceMaterial = 0, faceLayer = 0, backMaterial = 0, hidden = false, softEdges = false, smoothEdges = false, hiddenEdges = false, frontUv, backUv, attributeDicts = [], curveParams, holes = []) {
        const [nx, ny, nz, d] = planeFromPolygon(points);
        const frontMatrix = frontUv !== undefined ? uvMatrixForFace(points, frontUv, [
            nx,
            ny,
            nz
        ]) : undefined;
        const backMatrix = backUv !== undefined ? uvMatrixForFace(points, backUv, [
            nx,
            ny,
            nz
        ]) : undefined;
        for (const [, entries] of attributeDicts)this.validateAttributeEntries(entries);
        const span = Math.max(...[
            0,
            1,
            2
        ].map((i)=>Math.max(...points.map((p)=>p[i])) - Math.min(...points.map((p)=>p[i]))));
        const tol = Math.max(span, 1.0) * 1e-6;
        for (const hole of holes){
            if (hole.length < 3) throw new SkpWriteError('a hole needs at least 3 points');
            for (const p of hole){
                const dist = nx * p[0] + ny * p[1] + nz * p[2] - d;
                if (Math.abs(dist) > tol) {
                    throw new SkpWriteError(`hole point ${JSON.stringify(p)} is ${Math.abs(dist)} units off the face's own plane - ` + 'a hole must lie on the same plane as the outer boundary');
                }
            }
        }
        const [edgeSlots, edgeSenses, edgeNewEntities] = this.writeEdgeChain(points, vertexSlots, edgeRegistry, true, hiddenEdges, softEdges, smoothEdges, curveParams);
        let newEntities = edgeNewEntities;
        const holeLoops = [];
        for (const hole of holes){
            const [hEdgeSlots, hEdgeSenses, hNew] = this.writeEdgeChain(hole, vertexSlots, edgeRegistry, true, hiddenEdges, softEdges, smoothEdges, undefined);
            holeLoops.push([
                hEdgeSlots,
                hEdgeSenses
            ]);
            newEntities += hNew;
        }
        this.newOfKnownClass('CFace', 3);
        if (frontUv !== undefined || backUv !== undefined || attributeDicts.length > 0) {
            this.preambleWithRealAttrs(frontMatrix, backMatrix, attributeDicts);
        } else {
            this.preamble();
        }
        this.drawbase(faceMaterial, faceLayer, hidden);
        this.pushF64(nx);
        this.pushF64(ny);
        this.pushF64(nz);
        this.pushF64(d);
        this.pushU32(1 + holes.length);
        const loopSlot = this.newOfKnownClass('CLoop', 1);
        this.preamble(0);
        this.pushBytes([
            1,
            1
        ]);
        for(let i = 0; i < edgeSlots.length; i++){
            this.newOfKnownClass('CEdgeUse', 1);
            this.preamble(0);
            this.writeBackref(edgeSlots[i]);
            this.pushU8(edgeSenses[i]);
            this.writeBackref(loopSlot);
        }
        this.writeNull();
        for (const [hEdgeSlots, hEdgeSenses] of holeLoops){
            const hLoopSlot = this.newOfKnownClass('CLoop', 1);
            this.preamble(0);
            this.pushBytes([
                0,
                1
            ]);
            for(let i = 0; i < hEdgeSlots.length; i++){
                this.newOfKnownClass('CEdgeUse', 1);
                this.preamble(0);
                this.writeBackref(hEdgeSlots[i]);
                this.pushU8(hEdgeSenses[i]);
                this.writeBackref(hLoopSlot);
            }
            this.writeNull();
        }
        this.pushU16(backMaterial);
        newEntities += 1;
        return newEntities;
    }
}
function planeFromPolygon(points) {
    const n = points.length;
    let nx = 0, ny = 0, nz = 0;
    for(let i = 0; i < n; i++){
        const [x0, y0, z0] = points[i];
        const [x1, y1, z1] = points[(i + 1) % n];
        nx += (y0 - y1) * (z0 + z1);
        ny += (z0 - z1) * (x0 + x1);
        nz += (x0 - x1) * (y0 + y1);
    }
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length < 1e-9) throw new SkpWriteError('face points are collinear or degenerate; cannot compute a plane');
    nx /= length;
    ny /= length;
    nz /= length;
    const cx = points.reduce((s, p)=>s + p[0], 0) / n;
    const cy = points.reduce((s, p)=>s + p[1], 0) / n;
    const cz = points.reduce((s, p)=>s + p[2], 0) / n;
    const d = nx * cx + ny * cy + nz * cz;
    const span = Math.max(...[
        0,
        1,
        2
    ].map((i)=>Math.max(...points.map((p)=>p[i])) - Math.min(...points.map((p)=>p[i]))));
    const tol = Math.max(span, 1.0) * 1e-6;
    for (const p of points){
        const dist = nx * p[0] + ny * p[1] + nz * p[2] - d;
        if (Math.abs(dist) > tol) {
            throw new SkpWriteError(`face points are not coplanar (point ${JSON.stringify(p)} is ${Math.abs(dist)} units ` + 'off the fitted plane) - openskp only supports planar faces');
        }
    }
    return [
        nx,
        ny,
        nz,
        d
    ];
}
function isCoplanar(points) {
    const n = points.length;
    let nx = 0, ny = 0, nz = 0;
    for(let i = 0; i < n; i++){
        const [x0, y0, z0] = points[i];
        const [x1, y1, z1] = points[(i + 1) % n];
        nx += (y0 - y1) * (z0 + z1);
        ny += (z0 - z1) * (x0 + x1);
        nz += (x0 - x1) * (y0 + y1);
    }
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length < 1e-9) throw new SkpWriteError('face points are collinear or degenerate; cannot compute a plane');
    nx /= length;
    ny /= length;
    nz /= length;
    const cx = points.reduce((s, p)=>s + p[0], 0) / n;
    const cy = points.reduce((s, p)=>s + p[1], 0) / n;
    const cz = points.reduce((s, p)=>s + p[2], 0) / n;
    const d = nx * cx + ny * cy + nz * cz;
    const span = Math.max(...[
        0,
        1,
        2
    ].map((i)=>Math.max(...points.map((p)=>p[i])) - Math.min(...points.map((p)=>p[i]))));
    const tol = Math.max(span, 1.0) * 1e-6;
    return points.every((p)=>Math.abs(nx * p[0] + ny * p[1] + nz * p[2] - d) <= tol);
}
function writeFaceOrTriangulate(args) {
    const { writer, points, vertexSlots, edgeRegistry, material, layer, backMaterial, hidden, softEdges, smoothEdges, hiddenEdges, frontUv, backUv, attributeDicts, autoTriangulate, holes } = args;
    if (holes.length > 0 || !autoTriangulate || points.length === 3 || isCoplanar(points)) {
        return writer.writeFace(points, vertexSlots, edgeRegistry, material, layer, backMaterial, hidden, softEdges, smoothEdges, hiddenEdges, frontUv, backUv, attributeDicts, undefined, holes);
    }
    if (frontUv !== undefined || backUv !== undefined) {
        throw new SkpWriteError('autoTriangulate cannot be combined with frontUv/backUv positioning');
    }
    let total = 0;
    for(let i = 1; i < points.length - 1; i++){
        total += writer.writeFace([
            points[0],
            points[i],
            points[i + 1]
        ], vertexSlots, edgeRegistry, material, layer, backMaterial, hidden, softEdges, smoothEdges, hiddenEdges, undefined, undefined, attributeDicts);
    }
    return total;
}
function toPoint3(p) {
    return [
        Number(p[0]),
        Number(p[1]),
        Number(p[2])
    ];
}
function attributeDictsFrom(attributes, name) {
    return attributes ? [
        [
            name,
            attributes
        ]
    ] : [];
}
export class ComponentDefinitionBuilder {
    slot;
    name;
    _skp;
    countPatchPos;
    vertexSlots = new Map();
    edgeRegistry = new Map();
    newEntityCount = 0;
    closed = false;
    groupPlacement;
    constructor(skp, slot, name, countPatchPos, groupPlacement){
        this._skp = skp;
        this.slot = slot;
        this.name = name;
        this.countPatchPos = countPatchPos;
        this.groupPlacement = groupPlacement;
    }
    checkWritable(action) {
        if (this.closed) {
            throw new SkpWriteError(`component definition ${JSON.stringify(this.name)} has already closed - cannot add more ${action} to it`);
        }
    }
    addFace(points, options = {}) {
        this.checkWritable('faces');
        this._skp._checkMaterialHandle(options.material, 'material');
        this._skp._checkMaterialHandle(options.backMaterial, 'backMaterial');
        this._skp._checkLayerHandle(options.layer);
        const pts = points.map(toPoint3);
        if (pts.length < 3) throw new SkpWriteError('a face needs at least 3 points');
        const holes = (options.holes ?? []).map((h)=>h.map(toPoint3));
        const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? 'attributes');
        this.newEntityCount += writeFaceOrTriangulate({
            writer: this._skp._definitionWriter(),
            points: pts,
            vertexSlots: this.vertexSlots,
            edgeRegistry: this.edgeRegistry,
            material: options.material ?? 0,
            layer: options.layer ?? 0,
            backMaterial: options.backMaterial ?? 0,
            hidden: options.hidden ?? false,
            softEdges: options.softEdges ?? false,
            smoothEdges: options.smoothEdges ?? false,
            hiddenEdges: options.hiddenEdges ?? false,
            frontUv: options.frontUv,
            backUv: options.backUv,
            attributeDicts,
            autoTriangulate: options.autoTriangulate ?? false,
            holes
        });
    }
    addCircle(center, normal, radius, options = {}) {
        this.checkWritable('faces');
        this._skp._checkMaterialHandle(options.material, 'material');
        this._skp._checkMaterialHandle(options.backMaterial, 'backMaterial');
        this._skp._checkLayerHandle(options.layer);
        const numSegments = options.numSegments ?? 24;
        if (!(numSegments >= 3 && numSegments <= 255)) {
            throw new SkpWriteError(`num_segments must be between 3 and 255, got ${numSegments}`);
        }
        const c = toPoint3(center);
        const n = normalize3(toPoint3(normal));
        const [u, w] = circleBasis(n);
        const xaxis = [
            radius * u[0],
            radius * u[1],
            radius * u[2]
        ];
        const curveParams = {
            center: c,
            normal: n,
            xaxis,
            startAngle: 0,
            endAngle: 2 * Math.PI,
            radius,
            numSegments
        };
        const points = circlePoints(c, radius, numSegments, u, w);
        const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? 'attributes');
        this.newEntityCount += this._skp._definitionWriter().writeFace(points, this.vertexSlots, this.edgeRegistry, options.material ?? 0, options.layer ?? 0, options.backMaterial ?? 0, options.hidden ?? false, false, false, false, options.frontUv, options.backUv, attributeDicts, curveParams);
    }
    addArc(center, normal, radius, startAngle, endAngle, options = {}) {
        this.checkWritable('arcs');
        const numSegments = options.numSegments ?? 24;
        if (!(numSegments >= 3 && numSegments <= 255)) {
            throw new SkpWriteError(`num_segments must be between 3 and 255, got ${numSegments}`);
        }
        if (endAngle === startAngle) {
            throw new SkpWriteError('start_angle and end_angle must differ - use addCircle for a full circle');
        }
        const c = toPoint3(center);
        const n = normalize3(toPoint3(normal));
        const [u, w] = circleBasis(n);
        const xaxis = [
            radius * u[0],
            radius * u[1],
            radius * u[2]
        ];
        const curveParams = {
            center: c,
            normal: n,
            xaxis,
            startAngle,
            endAngle,
            radius,
            numSegments
        };
        const points = arcPoints(c, radius, numSegments, u, w, startAngle, endAngle);
        this.newEntityCount += this._skp._definitionWriter().writeArc(points, this.vertexSlots, this.edgeRegistry, curveParams, options.hiddenEdges ?? false, options.softEdges ?? false, options.smoothEdges ?? false);
    }
    addPolyline(points, options = {}) {
        this.checkWritable('polylines');
        const pts = points.map(toPoint3);
        if (pts.length < 2) throw new SkpWriteError('a polyline needs at least 2 points');
        this.newEntityCount += this._skp._definitionWriter().writePolyline(pts, this.vertexSlots, this.edgeRegistry, options.closed ?? false, options.hiddenEdges ?? false, options.softEdges ?? false, options.smoothEdges ?? false);
    }
    addInstance(definition, options = {}) {
        this.checkWritable('instances');
        this._skp._checkMaterialHandle(options.material, 'material');
        this._skp._checkLayerHandle(options.layer);
        if (definition._skp !== this._skp) {
            throw new SkpWriteError(`component definition ${JSON.stringify(definition.name)} belongs to a different builder (a different create() call) - its slot number is meaningless here`);
        }
        if (definition === this) {
            throw new SkpWriteError(`component definition ${JSON.stringify(this.name)} cannot nest an instance of itself`);
        }
        const matrix3x3 = resolveMatrix3x3(options.matrix3x3, options.rotation);
        const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? 'attributes');
        this.newEntityCount += this._skp._definitionWriter().writeInstance(definition.slot, options.name ?? definition.name, options.translation ?? [
            0,
            0,
            0
        ], matrix3x3, options.material ?? 0, options.layer ?? 0, attributeDicts, options.hidden ?? false);
    }
    addGroupInstance(definition, options = {}) {
        this.checkWritable('groups');
        this._skp._checkMaterialHandle(options.material, 'material');
        this._skp._checkLayerHandle(options.layer);
        if (definition._skp !== this._skp) {
            throw new SkpWriteError(`component definition ${JSON.stringify(definition.name)} belongs to a different builder (a different create() call) - its slot number is meaningless here`);
        }
        if (definition === this) {
            throw new SkpWriteError(`component definition ${JSON.stringify(this.name)} cannot nest a group instance of itself`);
        }
        const matrix3x3 = resolveMatrix3x3(options.matrix3x3, options.rotation);
        const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? 'attributes');
        this.newEntityCount += this._skp._definitionWriter().writeGroup(definition.slot, options.name ?? definition.name, options.translation ?? [
            0,
            0,
            0
        ], matrix3x3, options.material ?? 0, options.layer ?? 0, attributeDicts, options.hidden ?? false);
    }
    _close() {
        if (this.newEntityCount === 0) {
            throw new SkpWriteError(`component definition ${JSON.stringify(this.name)} has no geometry - add at least one face`);
        }
        const writer = this._skp._definitionWriter();
        this._skp._patchDefinitionCount(this.countPatchPos, this.newEntityCount);
        writer.writeDefinitionTail(this.name);
        this.closed = true;
        this._skp._clearOpenDefinition();
        if (this.groupPlacement !== undefined) {
            this._skp._pushPendingGroup(this, this.groupPlacement);
        }
    }
}
export class SkpBuilder {
    data;
    materialInsertPos = MATERIAL_INSERT_POS;
    base = BASE;
    layerCountPos = LAYER_COUNT_POS;
    origLayerCount = ORIG_LAYER_COUNT;
    layerInsertPos = LAYER_INSERT_POS;
    defCountPos = DEF_COUNT_POS;
    origDefCount = ORIG_DEF_COUNT;
    rootCountPos = ROOT_COUNT_POS;
    origRootCount = ORIG_ROOT_COUNT;
    tailPos = TAIL_POS;
    scaffoldNextSlot = SCAFFOLD_NEXT_SLOT;
    scaffoldClassSlot = {
        ...SCAFFOLD_CLASS_SLOT
    };
    materialWriter;
    materialsByName = new Map();
    materialCount = 0;
    layerWriterBase = LAYER_WRITER_BASE;
    layerWriter = null;
    layerWriterStart = null;
    layersByName = new Map();
    layerCount = 0;
    definitionWriterInstance = null;
    definitionWriterStart = null;
    definitionCount = 0;
    openDefinition = null;
    pendingGroups = [];
    geometryWriter = null;
    vertexSlots = new Map();
    edgeRegistry = new Map();
    newEntityCount = 0;
    faceCount = 0;
    constructor(){
        this.data = loadScaffold();
        this.materialWriter = new ArchiveWriter(this.base, {});
    }
    addMaterial(name, rgba, opacity) {
        if (this.geometryWriter !== null) throw new SkpWriteError('addMaterial must be called before any addFace calls');
        if (this.layerWriter !== null) throw new SkpWriteError('addMaterial must be called before any addLayer calls');
        if (this.definitionWriterInstance !== null) {
            throw new SkpWriteError('addMaterial must be called before any addComponentDefinition calls');
        }
        if (this.materialsByName.has(name)) return this.materialsByName.get(name);
        let full = rgba;
        if (full.length === 3) full = [
            ...full,
            255
        ];
        if (full.length !== 4 || !full.every((c)=>Number.isInteger(c) && c >= 0 && c <= 255)) {
            throw new SkpWriteError('rgba must be 3 or 4 integers in 0-255');
        }
        const slot = this.materialWriter.writeMaterial(name, full, opacity);
        this.materialsByName.set(name, slot);
        this.materialCount += 1;
        return slot;
    }
    addTextureMaterial(name, imageBytes, texturePath = '', appliedHeight, appliedWidth, opacity) {
        if (this.geometryWriter !== null) {
            throw new SkpWriteError('addTextureMaterial must be called before any addFace calls');
        }
        if (this.layerWriter !== null) {
            throw new SkpWriteError('addTextureMaterial must be called before any addLayer calls');
        }
        if (this.definitionWriterInstance !== null) {
            throw new SkpWriteError('addTextureMaterial must be called before any addComponentDefinition calls');
        }
        if (this.materialsByName.has(name)) return this.materialsByName.get(name);
        const subtype = detectImageSubtype(imageBytes);
        const slot = this.materialWriter.writeTexturedMaterial(name, imageBytes, texturePath, subtype, appliedHeight, appliedWidth, opacity);
        this.materialsByName.set(name, slot);
        this.materialCount += 1;
        return slot;
    }
    addLayer(name, options = {}) {
        if (this.geometryWriter !== null) throw new SkpWriteError('addLayer must be called before any addFace calls');
        if (this.definitionWriterInstance !== null) {
            throw new SkpWriteError('addLayer must be called before any addComponentDefinition calls');
        }
        if (this.layersByName.has(name)) return this.layersByName.get(name);
        let rgba;
        if (options.color !== undefined) {
            let c = options.color;
            if (c.length === 3) c = [
                ...c,
                255
            ];
            if (c.length !== 4 || !c.every((v)=>Number.isInteger(v) && v >= 0 && v <= 255)) {
                throw new SkpWriteError('color must be 3 or 4 integers in 0-255');
            }
            rgba = c;
        }
        if (this.layerWriter === null) {
            const materialShift = this.materialWriter.nextSlot - this.base;
            this.layerWriterStart = this.layerWriterBase + materialShift;
            this.layerWriter = new ArchiveWriter(this.layerWriterStart, this.materialShiftedClassSlot());
        }
        const slot = this.layerWriter.writeLayer(name, true, options.hidden ?? false, rgba);
        this.layersByName.set(name, slot);
        this.layerCount += 1;
        return slot;
    }
    _checkMaterialHandle(value, param) {
        if (value && ![
            ...this.materialsByName.values()
        ].includes(value)) {
            throw new SkpWriteError(`${param}=${value} is not a handle this builder's addMaterial()/addTextureMaterial() ` + 'returned - passing an unrelated value (e.g. a layer handle by mistake) would silently ' + 'write an invalid material reference that real SketchUp rejects on open');
        }
    }
    _checkLayerHandle(value, param = 'layer') {
        if (value && ![
            ...this.layersByName.values()
        ].includes(value)) {
            throw new SkpWriteError(`${param}=${value} is not a handle this builder's addLayer() returned - passing an ` + 'unrelated value (e.g. a material handle by mistake) would silently write an invalid ' + 'layer reference that real SketchUp rejects on open');
        }
    }
    materialShiftedClassSlot() {
        const materialShift = this.materialWriter.nextSlot - this.base;
        const out = {};
        for (const [n, s] of Object.entries(this.scaffoldClassSlot))out[n] = s + materialShift;
        return out;
    }
    layerShift() {
        if (this.layerWriter === null) return 0;
        return this.layerWriter.nextSlot - this.layerWriterStart;
    }
    postLayerClassSlot() {
        if (this.layerWriter !== null) return {
            ...this.layerWriter.classSlot
        };
        return this.materialShiftedClassSlot();
    }
    startDefinition(name, caller, groupPlacement, attributeDicts = []) {
        if (this.geometryWriter !== null) {
            throw new SkpWriteError(`${caller} must be called before any addFace/addInstance calls`);
        }
        if (this.openDefinition !== null) {
            throw new SkpWriteError(`component definition ${JSON.stringify(this.openDefinition.name)} is still open - close it before starting another`);
        }
        if (this.definitionWriterInstance === null) {
            this.definitionWriterStart = this.scaffoldNextSlot + (this.materialWriter.nextSlot - this.base) + this.layerShift();
            this.definitionWriterInstance = new ArchiveWriter(this.definitionWriterStart, this.postLayerClassSlot());
        }
        const [slot, countPatchPos] = this.definitionWriterInstance.writeDefinitionHeader(attributeDicts);
        this.definitionCount += 1;
        const comp = new ComponentDefinitionBuilder(this, slot, name, countPatchPos, groupPlacement);
        this.openDefinition = comp;
        return comp;
    }
    addComponentDefinition(name, build, options = {}) {
        const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? 'attributes');
        const def = this.startDefinition(name, 'addComponentDefinition', undefined, attributeDicts);
        build(def);
        def._close();
        return def;
    }
    addGroup(build, options = {}) {
        this._checkMaterialHandle(options.material, 'material');
        this._checkLayerHandle(options.layer);
        const matrix3x3 = resolveMatrix3x3(options.matrix3x3, options.rotation);
        const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? 'attributes');
        const placement = [
            options.translation ?? [
                0,
                0,
                0
            ],
            matrix3x3,
            options.material ?? 0,
            options.layer ?? 0,
            attributeDicts,
            options.hidden ?? false
        ];
        const def = this.startDefinition(options.name ?? 'Group', 'addGroup', placement);
        build(def);
        def._close();
        return def;
    }
    definitionShift() {
        if (this.definitionWriterInstance === null) return 0;
        return this.definitionWriterInstance.nextSlot - this.definitionWriterStart;
    }
    postDefinitionClassSlot() {
        if (this.definitionWriterInstance !== null) return {
            ...this.definitionWriterInstance.classSlot
        };
        return this.postLayerClassSlot();
    }
    addInstance(definition, options = {}) {
        this._checkMaterialHandle(options.material, 'material');
        this._checkLayerHandle(options.layer);
        if (definition._skp !== this) {
            throw new SkpWriteError(`component definition ${JSON.stringify(definition.name)} belongs to a different builder (a different create() call) - its slot number is meaningless here`);
        }
        const matrix3x3 = resolveMatrix3x3(options.matrix3x3, options.rotation);
        this.ensureGeometryWriter();
        const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? 'attributes');
        this.newEntityCount += this.geometryWriter.writeInstance(definition.slot, options.name ?? definition.name, options.translation ?? [
            0,
            0,
            0
        ], matrix3x3, options.material ?? 0, options.layer ?? 0, attributeDicts, options.hidden ?? false);
        this.faceCount += 1;
    }
    addImage(imageBytes, width, height, options = {}) {
        this._checkLayerHandle(options.layer);
        const mat = this.addTextureMaterial(`__openskp_image_${this.materialCount}`, imageBytes, options.texturePath ?? '');
        const imageDef = this.addComponentDefinition(`Image${this.definitionCount}`, (def)=>{
            def.addFace([
                [
                    0,
                    0,
                    0
                ],
                [
                    width,
                    0,
                    0
                ],
                [
                    width,
                    height,
                    0
                ],
                [
                    0,
                    height,
                    0
                ]
            ], {
                material: mat,
                frontUv: [
                    [
                        [
                            0,
                            0,
                            0
                        ],
                        [
                            0,
                            0
                        ]
                    ],
                    [
                        [
                            width,
                            0,
                            0
                        ],
                        [
                            1,
                            0
                        ]
                    ],
                    [
                        [
                            0,
                            height,
                            0
                        ],
                        [
                            0,
                            1
                        ]
                    ]
                ]
            });
        });
        const matrix3x3 = resolveMatrix3x3(options.matrix3x3, options.rotation);
        this.ensureGeometryWriter();
        this.newEntityCount += this.geometryWriter.writeImage(imageDef.slot, options.translation ?? [
            0,
            0,
            0
        ], matrix3x3, options.layer ?? 0, options.hidden ?? false);
        this.faceCount += 1;
    }
    ensureGeometryWriter() {
        if (this.geometryWriter !== null) return;
        if (this.openDefinition !== null) {
            throw new SkpWriteError(`component definition ${JSON.stringify(this.openDefinition.name)} is still open - close it before adding root-level geometry`);
        }
        const materialShift = this.materialWriter.nextSlot - this.base;
        this.geometryWriter = new ArchiveWriter(this.scaffoldNextSlot + materialShift + this.layerShift() + this.definitionShift(), this.postDefinitionClassSlot());
        for (const [comp, [translation, matrix3x3, mat, layer, attributeDicts, hidden]] of this.pendingGroups){
            this.newEntityCount += this.geometryWriter.writeGroup(comp.slot, comp.name, translation, matrix3x3, mat, layer, attributeDicts, hidden);
            this.faceCount += 1;
        }
        this.pendingGroups = [];
    }
    addFace(points, options = {}) {
        this._checkMaterialHandle(options.material, 'material');
        this._checkMaterialHandle(options.backMaterial, 'backMaterial');
        this._checkLayerHandle(options.layer);
        const pts = points.map(toPoint3);
        if (pts.length < 3) throw new SkpWriteError('a face needs at least 3 points');
        const holes = (options.holes ?? []).map((h)=>h.map(toPoint3));
        this.ensureGeometryWriter();
        const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? 'attributes');
        this.newEntityCount += writeFaceOrTriangulate({
            writer: this.geometryWriter,
            points: pts,
            vertexSlots: this.vertexSlots,
            edgeRegistry: this.edgeRegistry,
            material: options.material ?? 0,
            layer: options.layer ?? 0,
            backMaterial: options.backMaterial ?? 0,
            hidden: options.hidden ?? false,
            softEdges: options.softEdges ?? false,
            smoothEdges: options.smoothEdges ?? false,
            hiddenEdges: options.hiddenEdges ?? false,
            frontUv: options.frontUv,
            backUv: options.backUv,
            attributeDicts,
            autoTriangulate: options.autoTriangulate ?? false,
            holes
        });
        this.faceCount += 1;
    }
    addCircle(center, normal, radius, options = {}) {
        this._checkMaterialHandle(options.material, 'material');
        this._checkMaterialHandle(options.backMaterial, 'backMaterial');
        this._checkLayerHandle(options.layer);
        const numSegments = options.numSegments ?? 24;
        if (!(numSegments >= 3 && numSegments <= 255)) {
            throw new SkpWriteError(`num_segments must be between 3 and 255, got ${numSegments}`);
        }
        const c = toPoint3(center);
        const n = normalize3(toPoint3(normal));
        this.ensureGeometryWriter();
        const [u, w] = circleBasis(n);
        const xaxis = [
            radius * u[0],
            radius * u[1],
            radius * u[2]
        ];
        const curveParams = {
            center: c,
            normal: n,
            xaxis,
            startAngle: 0,
            endAngle: 2 * Math.PI,
            radius,
            numSegments
        };
        const points = circlePoints(c, radius, numSegments, u, w);
        const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? 'attributes');
        this.newEntityCount += this.geometryWriter.writeFace(points, this.vertexSlots, this.edgeRegistry, options.material ?? 0, options.layer ?? 0, options.backMaterial ?? 0, options.hidden ?? false, false, false, false, options.frontUv, options.backUv, attributeDicts, curveParams);
        this.faceCount += 1;
    }
    addArc(center, normal, radius, startAngle, endAngle, options = {}) {
        const numSegments = options.numSegments ?? 24;
        if (!(numSegments >= 3 && numSegments <= 255)) {
            throw new SkpWriteError(`num_segments must be between 3 and 255, got ${numSegments}`);
        }
        if (endAngle === startAngle) {
            throw new SkpWriteError('start_angle and end_angle must differ - use addCircle for a full circle');
        }
        const c = toPoint3(center);
        const n = normalize3(toPoint3(normal));
        this.ensureGeometryWriter();
        const [u, w] = circleBasis(n);
        const xaxis = [
            radius * u[0],
            radius * u[1],
            radius * u[2]
        ];
        const curveParams = {
            center: c,
            normal: n,
            xaxis,
            startAngle,
            endAngle,
            radius,
            numSegments
        };
        const points = arcPoints(c, radius, numSegments, u, w, startAngle, endAngle);
        this.newEntityCount += this.geometryWriter.writeArc(points, this.vertexSlots, this.edgeRegistry, curveParams, options.hiddenEdges ?? false, options.softEdges ?? false, options.smoothEdges ?? false);
        this.faceCount += 1;
    }
    addPolyline(points, options = {}) {
        const pts = points.map(toPoint3);
        if (pts.length < 2) throw new SkpWriteError('a polyline needs at least 2 points');
        this.ensureGeometryWriter();
        this.newEntityCount += this.geometryWriter.writePolyline(pts, this.vertexSlots, this.edgeRegistry, options.closed ?? false, options.hiddenEdges ?? false, options.softEdges ?? false, options.smoothEdges ?? false);
        this.faceCount += 1;
    }
    addDimension(p1, p2, offset = 10.0) {
        this.ensureGeometryWriter();
        this.geometryWriter.writeDimension(toPoint3(p1), toPoint3(p2), offset);
        this.newEntityCount += 1;
        this.faceCount += 1;
    }
    addText(text, point, leader = [
        15.0,
        15.0,
        15.0
    ]) {
        this.ensureGeometryWriter();
        this.geometryWriter.writeText(text, toPoint3(point), toPoint3(leader));
        this.newEntityCount += 1;
        this.faceCount += 1;
    }
    addConstructionLine(point, options = {}) {
        this.ensureGeometryWriter();
        this.geometryWriter.writeConstructionLine(toPoint3(point), options.point2 !== undefined ? toPoint3(options.point2) : undefined, options.direction !== undefined ? toPoint3(options.direction) : undefined);
        this.newEntityCount += 1;
        this.faceCount += 1;
    }
    addConstructionPoint(position) {
        this.ensureGeometryWriter();
        this.geometryWriter.writeConstructionPoint(toPoint3(position));
        this.newEntityCount += 1;
        this.faceCount += 1;
    }
    addSectionPlane(point, normal) {
        this.ensureGeometryWriter();
        this.geometryWriter.writeSectionPlane(toPoint3(point), toPoint3(normal));
        this.newEntityCount += 1;
        this.faceCount += 1;
    }
    toBytes() {
        if (this.pendingGroups.length > 0) {
            this.ensureGeometryWriter();
        }
        if (this.faceCount === 0) throw new SkpWriteError('no geometry added - call addFace at least once before saving');
        const materialShift = this.materialWriter.nextSlot - this.base;
        const layerShift = this.layerShift();
        const definitionShift = this.definitionShift();
        const geometryInitialSlot = this.scaffoldNextSlot + materialShift + layerShift + definitionShift;
        const geometryShift = this.geometryWriter.nextSlot - geometryInitialSlot;
        const newRootCount = this.origRootCount + this.newEntityCount;
        const parts = [];
        const out = {
            push: (part)=>{
                parts.push(part instanceof Uint8Array ? part : Uint8Array.from(part));
            }
        };
        const layerPids = this.layerWriter ? this.layerWriter.nextPid - 1 : 0;
        const pidDelta = this.materialCount + layerPids;
        const prefix = Array.from(this.data.subarray(0, this.materialInsertPos - 4));
        if (pidDelta) {
            const u16 = readU16(prefix, PID_COUNTER_POS);
            writeU16At(prefix, PID_COUNTER_POS, u16 + pidDelta);
        }
        for(let i = 0; i < ISO_CAMERA_PREFIX_PATCH.length; i++){
            prefix[ISO_CAMERA_PREFIX_OFFSET + i] = ISO_CAMERA_PREFIX_PATCH[i];
        }
        out.push(prefix);
        out.push(u32Bytes(this.materialCount));
        out.push(this.materialWriter.bytes.view());
        const middle1 = Array.from(this.data.subarray(this.materialInsertPos, this.layerInsertPos));
        const layerCountRel = this.layerCountPos - this.materialInsertPos;
        writeU32At(middle1, layerCountRel, this.origLayerCount + this.layerCount);
        out.push(middle1);
        if (this.layerWriter !== null) out.push(this.layerWriter.bytes.view());
        const middle2a = Array.from(this.data.subarray(this.layerInsertPos, this.defCountPos));
        if (materialShift) shiftRef(middle2a, ACTIVE_LAYER_ANCHOR_REL, materialShift);
        out.push(middle2a);
        out.push(u32Bytes(this.origDefCount + this.definitionCount));
        if (this.definitionWriterInstance !== null) out.push(this.definitionWriterInstance.bytes.view());
        out.push(this.data.subarray(this.defCountPos + 4, this.rootCountPos));
        out.push(u32Bytes(newRootCount));
        out.push(this.data.subarray(this.rootCountPos + 4, this.tailPos));
        out.push(this.geometryWriter.bytes.view());
        const tail = Array.from(this.data.subarray(this.tailPos));
        const totalTailShift = materialShift + layerShift + definitionShift + geometryShift;
        const isoPatches = new Map(ISO_CAMERA_TAIL_PATCHES);
        const actions = [
            ...TAIL_REF_POSITIONS.map((pos)=>[
                    pos,
                    'ref'
                ]),
            ...Array.from(isoPatches.keys()).map((pos)=>[
                    pos,
                    'patch'
                ])
        ].sort((a, b)=>a[0] - b[0]);
        let growth = 0;
        for (const [pos, kind] of actions){
            const here = pos + growth;
            if (kind === 'ref') {
                growth += shiftRef(tail, here, totalTailShift);
            } else {
                const patch = isoPatches.get(pos);
                for(let i = 0; i < patch.length; i++)tail[here + i] = patch[i];
            }
        }
        out.push(tail);
        let total = 0;
        for (const part of parts)total += part.length;
        const result = new Uint8Array(total);
        let offset = 0;
        for (const part of parts){
            result.set(part, offset);
            offset += part.length;
        }
        return result;
    }
    save(path) {
        if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
            throw new Error('SkpBuilder.save is only supported in Node.js environments - use toBytes() elsewhere');
        }
        const fs = require('fs');
        fs.writeFileSync(path, Buffer.from(this.toBytes()));
    }
    _definitionWriter() {
        return this.definitionWriterInstance;
    }
    _patchDefinitionCount(countPatchPos, count) {
        const writer = this.definitionWriterInstance;
        writeU32At(writer.bytes.buf, countPatchPos, count);
    }
    _clearOpenDefinition() {
        this.openDefinition = null;
    }
    _pushPendingGroup(comp, placement) {
        this.pendingGroups.push([
            comp,
            placement
        ]);
    }
}
export function create() {
    return new SkpBuilder();
}
export const _internal = {
    ArchiveWriter,
    GrowableBytes,
    shiftRef,
    planeFromPolygon,
    isCoplanar
};
