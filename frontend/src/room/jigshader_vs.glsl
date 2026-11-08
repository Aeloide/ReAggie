precision mediump float;
attribute vec2 position;
attribute vec4 texCoord;
attribute vec4 vertexColor;

uniform mat4 transform;
uniform vec2 shadowOffset;

varying vec4 vTexCoord;
varying vec2 vColor;
varying vec2 vShadowOffset;

void main() {
  vTexCoord = texCoord;
  vColor = vertexColor.xy;

  float angle = -vertexColor.z;
  float cosa = cos(angle);
  float sina = sin(angle);
  vec2 s = shadowOffset;
  vShadowOffset = vec2(cosa * s.x - sina * s.y, sina * s.x + cosa * s.y);

  gl_Position = transform * vec4(position, 0, 1);
}