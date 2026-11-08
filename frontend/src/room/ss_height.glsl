precision highp float;

#define DATA_TEXTURE_MAX_SIZE 1024
#define DATA_TEXTURE_ATTRS 4

uniform mat4 camera;
uniform sampler2D puzzleState; // (texelformat: xy: center, z: rotation, w: groupdepth)

#ifdef VERTEX
layout(location = 0) in vec2 position;
// layout(location = 1) in vec2 normal; // Not used
layout(location = 2) in float pieceid;

out float vDepth;

vec4 getAttrBlock(int id, int attr) {
	ivec2 pIndex = ivec2((id % DATA_TEXTURE_MAX_SIZE), id / DATA_TEXTURE_MAX_SIZE);
	int attrh = textureSize(puzzleState, 0).y / DATA_TEXTURE_ATTRS;
	pIndex.y += attrh * attr;
	return texelFetch(puzzleState, pIndex, 0);
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
    
    vec4 groupattr = getAttrBlock(gid, 0);
	vec2 groupOffset = groupattr.xy;
	float angle = groupattr.z;
	float groupDepth = groupattr.w;
    
    vec2 gother = getAttrBlock(gid, 3).zw; // .y is scale?

    // Standard piece transform
    vec2 paddedPosition = position; // No grow/padding for core shadow shape
    vec2 direction = rotate(vec2(0, 1), 0.0);
	vec2 pos = scalePerpendicularTo11(paddedPosition + offset, gother.y, direction);
	pos = rotate(pos, angle) + groupOffset;

    // We output the depth to the fragment shader
    // We also set gl_Position so it rasterizes correctly
    gl_Position = camera * vec4(pos, groupDepth, 1.0);
    
    // Pass depth to frag
    vDepth = groupDepth + 1.0;
}
#endif

#ifdef FRAGMENT
in float vDepth;
out vec4 color;

void main() {
    // Output depth/height. 
    // We assume R32F or similar texture.
    color = vec4(vDepth, 0.0, 0.0, 1.0);
}
#endif
