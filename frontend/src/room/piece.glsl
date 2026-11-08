precision highp float;

#define DATA_TEXTURE_MAX_SIZE 1024
#define DATA_TEXTURE_ATTRS 4

uniform mat4 camera;
uniform vec2 idims;
uniform sampler2D puzzleState; // (texelformat: xy: center, z: rotation, w: groupdepth)
uniform float grow;
uniform bool selection;
uniform sampler2D image;
uniform sampler2D image2;

varying vec2 uv;
varying vec4 outlineColor;
varying float rotting;

#ifdef VERTEX

// WHY, OH WHY
layout(location = 0) in vec2 position;
layout(location = 1) in vec2 normal;
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
	gl_PointSize = 5.0;

	int pid = int(pieceid);
	vec4 paddr = getAttrBlock(pid, 1);
	vec2 offset = paddr.xy; // geometry offset relative to center of group 
	int gid = int(paddr.z);
	vec2 gother = getAttrBlock(gid, 3).zw;
	vec4 groupattr = getAttrBlock(gid, 0);
	vec2 groupOffset = groupattr.xy;
	float angle = groupattr.z;
	float groupDepth = groupattr.w;
	vec4 style = getAttrBlock(gid, 2);
	vec2 padding = normal * grow;
	float depthOffset = 0.0;

	outlineColor = vec4(0);
	if(grow == 0.0) {
		outlineColor = vec4(0.3, 0.3, 0.3, 1.0);
		depthOffset = -0.25;
	} else if(grow < 0.0) {
		outlineColor = vec4(0.0);
	} else if(selection) {
		if(style.a == 0.0) {
			// Don't render it.
			//padding = vec2(0.0);
			gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
			return;
		}
		depthOffset = -0.5;
		outlineColor = style;
	}

	vec2 origin = getAttrBlock(pid, 3).xy; // texture sampling origin for the piece
	vec2 paddedPosition = position + padding;
	uv = (paddedPosition + origin) / idims;
    vec2 direction = rotate(vec2(0, 1), 0.0);
	vec2 pos = scalePerpendicularTo11(paddedPosition + offset, gother.y, direction);
	pos = rotate(pos, angle) + groupOffset;
	rotting = gother.x;
	gl_Position = camera * vec4(pos, groupDepth + depthOffset, 1);
}

#endif

#ifdef FRAGMENT
out vec4 color;
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

void main() {
	if(selection) {
		color = outlineColor;
		return;
	}
	float f = 1.0;
	if(outlineColor.a > 0.0) {
		color = outlineColor;
	} else {
		vec2 fuv = uv;
		if (gl_FrontFacing) {
			fuv.x = 1.0f - fuv.x;
		}
		color = gl_FrontFacing ? texture(image, fuv) : texture(image2, fuv);
        float s = noise(uv * 500.0f);
        if (s >= rotting)
           f = 0.0;
	}

	color.a *= f;
}
#endif