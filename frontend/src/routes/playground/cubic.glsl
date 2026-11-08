precision highp float;

uniform float curvedir;

varying vec3 uv;

#ifdef VERTEX

in vec2 pos;
in vec3 vuv;

void main() {
    uv = vuv;
    gl_Position = vec4(pos, 0.0, 1.0);
}
#endif

#ifdef FRAGMENT

out vec4 color;

void main() {
    float v = uv.x;
    float w = uv.y;
    float t = uv.z;

    // Compute v^3
    float v_cubed = v * v * v;

    // Compute w * t + 0.000001
    float wt_term = w * t + 0.000001;

    color = (v_cubed - wt_term) * curvedir > 0.0 ? vec4(uv, 1.0) : vec4(v_cubed, w*t, 0.0, 0.0);
}
#endif
