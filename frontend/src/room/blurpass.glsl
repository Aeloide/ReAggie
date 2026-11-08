precision highp float;

uniform sampler2D tex;
uniform vec2 dir;

#ifdef VERTEX

in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}

#endif
#ifdef FRAGMENT
out vec4 color;

vec4 blur9(in vec2 uv, in vec2 res) {
  vec4 color = vec4(0.0);
  vec2 off1 = vec2(1.411764705882353) * dir;
  vec2 off2 = vec2(3.2941176470588234) * dir;
  vec2 off3 = vec2(5.176470588235294) * dir;
  color += texture(tex, uv) * 0.1964825501511404;
  color += texture(tex, uv + (off1 / res)) * 0.2969069646728344;
  color += texture(tex, uv - (off1 / res)) * 0.2969069646728344;
  color += texture(tex, uv + (off2 / res)) * 0.09447039785044732;
  color += texture(tex, uv - (off2 / res)) * 0.09447039785044732;
  color += texture(tex, uv + (off3 / res)) * 0.010381362401148057;
  color += texture(tex, uv - (off3 / res)) * 0.010381362401148057;
  return color;
}

void main() {
  vec2 res = vec2(textureSize(tex, 0));
  vec2 uv = gl_FragCoord.xy / res;
  color = blur9(uv, res);
}
#endif
