attribute vec2 position;
attribute vec4 texCoord;
attribute vec4 vertexColor;

uniform mat4 transform;
varying vec4 vColor;

void main() {
  vColor = vertexColor;
  gl_Position = transform * vec4(position, 0, 1);
}