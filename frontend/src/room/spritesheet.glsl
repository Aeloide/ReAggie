precision highp float;
precision highp isampler2D;
precision highp sampler2D;
precision highp usampler2D;

uniform sampler2D sprite;
uniform usampler2D framedata;
uniform mat4 camera;
uniform float scale;

// TODO: move to a uniform
uniform vec2 frame_size;

varying vec2 uv;
flat varying ivec4 bounds;
#ifdef VERTEX

in vec2 spos; // position in a unit square, used to derive UVs

// per instance attributes
in vec2 pos; // center position of the instanced squares in world space
in vec2 gscale; // geometric scale (that's not a real term btw)
in int frame;
in int layer;
in float angle;

vec2 rotate(vec2 v, float a) {
	float s = sin(a);
	float c = cos(a);
	mat2 m = mat2(c, -s, s, c);
	return m * v;
}

uvec2 decode(uvec4 v) {
	uint a = v.g << 8 | v.r;
	uint b = v.a << 8 | v.b;
	return uvec2(a, b);
}

void main() {
	uvec2 xyoff = decode(texelFetch(framedata, ivec2(frame * 3, layer), 0));
	uvec2 wh = decode(texelFetch(framedata, ivec2(frame * 3 + 1, layer), 0));
	uvec2 sxsy = decode(texelFetch(framedata, ivec2(frame * 3 + 2, layer), 0));
	vec2 kuv = spos + 0.5;
	vec2 lpos = kuv * vec2(wh);
	uv = vec2(sxsy) + lpos;
	bounds = ivec4(wh.x, wh.y, sxsy.x, sxsy.y);
	vec2 centeredPos = rotate(lpos - frame_size * 0.5 + vec2(xyoff), angle);
	gl_Position = camera * vec4(centeredPos * gscale * scale + pos, 0, 1.0);
}
#endif

#ifdef FRAGMENT

out vec4 color;

void main() {
	vec2 euv = clamp(uv, vec2(bounds.zw), vec2(bounds.zw - 1 + bounds.xy)); // doesn't seem to do shit, i'll have to add 1 pixel of border padding on the sprite textures...
	color = texelFetch(sprite, ivec2(euv), 0);
}

#endif