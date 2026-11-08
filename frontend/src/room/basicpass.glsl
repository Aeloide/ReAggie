precision highp float;

uniform mat4 camera;

#ifdef VERTEX
in vec2 position;
void main() {
    gl_Position = camera * vec4(position, 0, 1);
}

#endif

#ifdef FRAGMENT
out vec4 color;

void main() {
    color = vec4(0, 0, 0, 1);
}

#endif