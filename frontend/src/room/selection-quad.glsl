precision highp float;
precision highp int;

#define DATA_TEXTURE_MAX_SIZE 1024
#define DATA_TEXTURE_ATTRS 4

uniform mat4 camera;
uniform sampler2D puzzleState;
uniform float grow;
uniform int basePid;

varying vec4 outlineColor;

#ifdef VERTEX

// Instanced attributes (or we can just use an array of 4 vertices if we don't have a VBO for the quad)
vec2 quadVertices[4] = vec2[4](
    vec2(-0.5, -0.5),
    vec2( 0.5, -0.5),
    vec2(-0.5,  0.5),
    vec2( 0.5,  0.5)
);

layout(location = 0) in vec4 bounds; // cx, cy, sx, sy

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
    int pid = basePid + gl_InstanceID;
    
    vec4 paddr = getAttrBlock(pid, 1);
    vec2 offset = paddr.xy;
    int gid = int(paddr.z);
    
    vec4 style = getAttrBlock(gid, 2);
    if(style.a == 0.0) {
        gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
        return;
    }
    outlineColor = style;

    vec2 gother = getAttrBlock(gid, 3).zw;
    vec4 groupattr = getAttrBlock(gid, 0);
    vec2 groupOffset = groupattr.xy;
    float angle = groupattr.z;
    float groupDepth = groupattr.w;
    
    vec2 q = quadVertices[gl_VertexID];
    vec2 localPos = bounds.xy + q * (bounds.zw + vec2(grow * 2.5)); // expand bounds slightly to ensure coverage

    vec2 direction = vec2(0.0, 1.0);
    vec2 pos = scalePerpendicularTo11(localPos + offset, gother.y, direction);
    pos = rotate(pos, angle) + groupOffset;
    
    gl_Position = camera * vec4(pos, groupDepth - 0.5, 1.0);
}

#endif

#ifdef FRAGMENT
out vec4 color;

void main() {
    color = outlineColor;
}
#endif
