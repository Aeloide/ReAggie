precision highp float;

#define DATA_TEXTURE_MAX_SIZE 1024
#define DATA_TEXTURE_ATTRS 4

uniform mat4 camera;
uniform vec2 idims;
uniform sampler2D puzzleState; // (texelformat: xy: center, z: rotation, w: groupdepth)
uniform sampler2D image;
uniform sampler2D image2;

varying vec2 uv;
varying float rotting;

#ifdef VERTEX

layout(location = 0) in vec2 quadPosition; // 0..1 quad coords
layout(location = 1) in vec4 instBB; // xy: min, zw: dimensions
layout(location = 2) in float pieceid;

vec4 getAttrBlock(int id, int attr) {
	ivec2 pIndex = ivec2((id % DATA_TEXTURE_MAX_SIZE), id / DATA_TEXTURE_MAX_SIZE);
	int attrh = textureSize(puzzleState, 0).y / DATA_TEXTURE_ATTRS;
	pIndex.y += attrh * attr;
	return texelFetch(puzzleState, pIndex, 0);
}

vec2 directionalScale(vec2 v, vec2 direction, float scaleFactor) {
    direction = normalize(direction);
    float dotProduct = dot(v, direction);
    vec2 parallelComponent = direction * dotProduct;
    vec2 perpComponent = v - parallelComponent;
    vec2 scaledPerp = perpComponent * scaleFactor;
    return parallelComponent + scaledPerp;
}

vec2 scalePerpendicularTo11(vec2 v, float scaleFactor, vec2 direction) {
    float dotProduct = dot(v, direction);
    vec2 parallelComponent = direction * dotProduct;
    vec2 perpComponent = v - parallelComponent;
    return parallelComponent + perpComponent * scaleFactor;
}

vec2 rotate(vec2 v, float a) {
	float s = sin(a);
	float c = cos(a);
	mat2 m = mat2(c, -s, s, c);
	return m * v;
}

void main() {
	int pid = int(pieceid);
	vec4 paddr = getAttrBlock(pid, 1);
	vec2 offset = paddr.xy; 
	int gid = int(paddr.z);
	vec2 gother = getAttrBlock(gid, 3).zw;
	vec4 groupattr = getAttrBlock(gid, 0);
	vec2 groupOffset = groupattr.xy;
	float angle = groupattr.z;
	float groupDepth = groupattr.w;
	
	vec2 pt = quadPosition * instBB.zw + instBB.xy;
	vec2 centerRel = quadPosition - vec2(0.5);
	vec2 paddedPosition = pt + sign(centerRel) * 10.0;

	vec2 origin = getAttrBlock(pid, 3).xy; 
	uv = (paddedPosition + origin) / idims;
    vec2 direction = rotate(vec2(0, 1), 0.0);
	vec2 pos = scalePerpendicularTo11(paddedPosition + offset, gother.y, direction);
	pos = rotate(pos, angle) + groupOffset;
	rotting = gother.x;
	gl_Position = camera * vec4(pos, groupDepth, 1);
}

#endif

#ifdef FRAGMENT
out vec4 color;
float rand(float n) { return fract(sin(n) * 43758.5453123); }
float rand(vec2 n) { return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }
float noise(vec2 n) {
	const vec2 d = vec2(0.0, 1.0);
	vec2 b = floor(n), f = smoothstep(vec2(0.0), vec2(1.0), fract(n));
	return mix(mix(rand(b), rand(b + d.yx), f.x), mix(rand(b + d.xy), rand(b + d.yy), f.x), f.y);
}

void main() {
	float f = 1.0;
    vec2 fuv = uv;
    if (gl_FrontFacing) { fuv.x = 1.0f - fuv.x; }
    color = gl_FrontFacing ? texture(image, fuv) : texture(image2, fuv);
    float s = noise(uv * 500.0f);
    if (s >= rotting) f = 0.0;
	color.a *= f;
}
#endif
