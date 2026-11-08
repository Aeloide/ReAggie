precision highp float;

uniform sampler2D spritesheet;
uniform mat4 camera;
uniform float time;
uniform vec4 tint;

varying vec2 uv;

#ifdef VERTEX

in vec2 spos;
in float angle;
in float scale;
in vec4 source;
in vec2 pos;

vec2 rotate(vec2 v, float a) {
	float s = sin(a);
	float c = cos(a);
	mat2 m = mat2(c, -s, s, c);
	return m * v;
}

void main() {
    // vec2 auv = spos + 0.5;
    // vec2 frame_size = vec2(textureSize(spritesheet, 0));
    // uv = (source.xy + auv * source.zw) / frame_size;
    // vec2 asd = rotate(uv - frame_size * 0.5, angle);
    // gl_Position = camera * vec4(asd * source.zw * scale + pos, 0, 1.0);

    // vec2 auv = spos + 0.5;
    // gl_Position = camera * vec4(auv * 100.0 + 800., 0.0, 1.0);
    // spos are 4 points of a quad in -0.5; 0.5
    vec2 auv = spos + 0.5;
    uv = source.xy  + auv * source.zw;
    uv /= vec2(textureSize(spritesheet, 0));
    vec2 lpos = spos * source.zw;
    vec2 asd = rotate(lpos, angle + (time * 0.000));
    gl_Position = camera * vec4(asd * (scale) + pos, 0, 1.0);

}

#endif
#ifdef FRAGMENT

out vec4 color;

void main() {
    color = vec4(texture(spritesheet, uv).r) * tint;// + vec4(1.0, 1.0, 0.0, 1.0);
    // color = vec4(1.0, 1.0, 0.0, 1.0);
}

#endif