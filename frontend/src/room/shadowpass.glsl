precision highp float;
precision highp sampler2DArray;
precision highp sampler2D;
#define DATA_TEXTURE_MAX_SIZE 1024
#define DATA_TEXTURE_ATTRS 4

uniform mat4 camera;
uniform sampler2D puzzleState; // (texelformat: xy: center, z: rotation, w: groupdepth)
uniform float totalPieces;
uniform sampler2DArray shadows; // 24 layers
uniform float idpr;

#ifdef VERTEX
#define DIR out
#else
#define DIR in
#endif
DIR vec3 auv;
DIR float strength;

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

vec2 scalePerpendicularTo11(vec2 v, float scaleFactor, vec2 direction) {
    float dotProduct = dot(v, direction);
    vec2 parallelComponent = direction * dotProduct;
    vec2 perpComponent = v - parallelComponent;
    return parallelComponent + perpComponent * scaleFactor;
}

void main() {
    vec2 uv = position + 0.5;
    vec3 aa = vec3(textureSize(shadows, 0));
    vec2 shadowsize = vec2(aa.xy) / 1.15f;

    int pid = gl_InstanceID;
	vec4 paddr = getAttrBlock(pid, 1);
	vec2 offset = paddr.xy;
	int gid = int(paddr.z);
	vec2 gother = getAttrBlock(gid, 3).zw;

    int type = int(paddr.w);
    int archtype = type & 0x1F; // select last 5 bits
    int rotmirror = (type >> 5) & 7;

    if ((rotmirror & 4) == 4) {
         // 90degree clockwise
         vec2 temp = uv;
         uv.x = temp.y;
         uv.y = 1.0 - temp.x;
    }
     if ((rotmirror & 1) == 1) { // y flip
     uv.x = 1.0f - uv.x;
     }
     if ((rotmirror & 2) == 2) { // x flip
     uv.y = 1.0f - uv.y;
     }

    auv = vec3(uv, archtype);

	vec4 groupattr = getAttrBlock(gid, 0);
	vec2 groupOffset = groupattr.xy;
	float angle = groupattr.z;
	float groupDepth = groupattr.w - 0.75;

	vec2 paddedPosition = (position * shadowsize);
    vec2 direction = rotate(vec2(0, 1), 0.0);
	vec2 pos = scalePerpendicularTo11(paddedPosition + offset, gother.y, direction);
	pos = rotate(pos, angle) + groupOffset;

    strength = 0.3;
    if (groupDepth > totalPieces)
        strength = 0.5;

    gl_Position = camera * vec4(pos, groupDepth, 1);
}
#endif

#ifdef FRAGMENT
out vec4 color;

void main() {
    vec4 s = texture(shadows, auv);
    color = vec4(s.rgb, s.a * strength);
}
#endif