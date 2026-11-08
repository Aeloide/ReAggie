precision highp float;
precision highp int;
precision highp sampler2DArray;
precision highp sampler2D;
#define DATA_TEXTURE_MAX_SIZE 1024
#define DATA_TEXTURE_ATTRS 4

uniform mat4 camera;
uniform sampler2D puzzleState; // (texelformat: xy: center, z: rotation, w: groupdepth)
uniform vec2 piecesize;
uniform sampler2D image;
uniform int basepiece;
uniform vec2 idims;

varying vec2 auv;
varying float rotting;

#ifdef VERTEX

in vec2 position; // quad position

vec2 rotate(vec2 v, float a) {
	float s = sin(a);
	float c = cos(a);
	mat2 m = mat2(c, -s, s, c);
	return m * v;
}

vec4 getAttrBlock(int id, int attr) {
	ivec2 pIndex = ivec2((id % DATA_TEXTURE_MAX_SIZE), id / DATA_TEXTURE_MAX_SIZE);
	int attrh = textureSize(puzzleState, 0).y / DATA_TEXTURE_ATTRS;
	pIndex.y += attrh * attr;
	return texelFetch(puzzleState, pIndex, 0);
}

void main() {
	int pid = gl_InstanceID + basepiece;
	vec4 paddr = getAttrBlock(pid, 1);
	vec2 offset = paddr.xy;
	int gid = int(paddr.z);

	vec4 groupattr = getAttrBlock(gid, 0);
	vec2 groupOffset = groupattr.xy;
	float angle = groupattr.z;
	float groupDepth = groupattr.w;

	vec2 paddedPosition = (position * piecesize);
	vec2 pos = rotate(paddedPosition + offset, angle) + groupOffset;
	vec2 origin = getAttrBlock(pid, 3).xy;
	auv = (paddedPosition + origin) / idims;
	rotting = getAttrBlock(gid, 3).z;
	gl_Position = camera * vec4(pos, groupDepth, 1);
}
#endif

#ifdef FRAGMENT

float rand(float n) {
	return fract(sin(n) * 43758.5453123);
}
float rand(vec2 n) {
	return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}
float noise(vec2 n) {
	const vec2 d = vec2(0.0, 1.0);
	vec2 b = floor(n), f = smoothstep(vec2(0.0), vec2(1.0), fract(n));
	return mix(mix(rand(b), rand(b + d.yx), f.x), mix(rand(b + d.xy), rand(b + d.yy), f.x), f.y);
}

out vec4 color;

void main() {
	color = texture(image, auv);
	float f = 1.0;
	float s = noise(auv * 500.0);
	if(s >= rotting)
		f = 0.0;

	color.a *= f;
}
#endif