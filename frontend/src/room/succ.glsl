precision highp float;
uniform sampler2D fbuffer;
uniform mat4 camera;
uniform vec2 dims;

varying vec2 v_displacement;
varying vec2 uv;

#ifdef VERTEX

in vec2 basepos;

// per inst
// in vec2 u_start;
in vec2 u_end;
in vec2 world_pos;
in vec2 scale_angle;

void main() {
    vec2 u_start = vec2(0.0, 0.0);
    // vec2 u_end = vec2(-0.125, -0.125);
    float dist = distance(u_start, basepos);
    float normalizedDist = min(1.0, dist);
    float influence = 0.0;
    if(normalizedDist < 0.85) {
        influence = exp(-32.0 * normalizedDist * normalizedDist);
    }

    vec2 displacement = u_end - u_start;
    displacement *= influence;
    float depth = length(displacement) * 0.5; // Use displacement magnitude for depth, negative to bring displaced points forward
    // uv = world_pos + basepos * scale_angle.x + displacement * dims;
    vec4 bp = camera * vec4(world_pos + basepos * scale_angle.x, depth, 1.0);
    gl_Position = camera * vec4(world_pos + basepos * scale_angle.x + displacement * dims, depth, 1.0);
    uv = bp.xy; // [-1; 1]
    // uv += basepos;
    uv += 1.0f; // [0; 2]
    uv *= 0.5f;
    v_displacement = displacement;
}

#endif

#ifdef FRAGMENT

out vec4 color;

void main() {
    // vec2 fpos = vec2(gl_FragCoord.xy);
    // vec2 v_displacement = 5.0 * sin(fpos);
    vec2 screenpos = uv;
    // screenpos.y = 1.0f - screenpos.y;
    color = texture(fbuffer, screenpos);
    color.a = 1.0;
    // color = vec4(abs(v_displacement), 0, 1);
}
#endif 