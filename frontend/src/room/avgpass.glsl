precision highp float;

uniform sampler2D tex;
uniform vec2 pdims;

varying vec2 uv;

#ifdef VERTEX

in vec2 spos; // geometry
in vec2 origin; // per instance attribute

vec2 to_screen_coords(vec2 grid_coord) {
    vec2 normalized_coord = grid_coord / 127.0f;
    vec2 clip_coord = 2.0f * normalized_coord - 1.0f;
    return clip_coord;
}

void main() {
    vec2 dims = vec2(textureSize(tex, 0));
    vec2 topleft = origin - pdims * 0.5;
    uv = (topleft + spos * pdims) / dims;
    int xpx = gl_InstanceID % 128;
    int ypx = gl_InstanceID / 128;
    gl_Position = vec4(to_screen_coords(vec2(xpx, ypx) + spos), 0, 1);
}

#endif

#ifdef FRAGMENT

out vec4 color;

void main() {
    color = texture(tex, uv);
}

#endif