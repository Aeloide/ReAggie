attribute vec2 position;
attribute vec4 texCoord;

varying vec2 vTexCoord;

void main() {
  vTexCoord = texCoord.xy;
  gl_Position = vec4(position, 0, 1);
}