precision highp float;

uniform vec4 scol;
uniform mat4 camera;
varying vec3 pvcol;

#ifdef VERTEX
in vec2 position;

void main() {
  gl_Position = camera * vec4(position, 0, 1);
}

#endif
#ifdef FRAGMENT

out vec4 color;
void main() { color = scol; }

#endif