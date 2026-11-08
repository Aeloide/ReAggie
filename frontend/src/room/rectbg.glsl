precision highp float;

uniform sampler2D uTexture;
uniform vec4 colorTint;
uniform mat4 camera;

varying vec2 texCoord;

#ifdef VERTEX
in vec2 position;

void main() {
    gl_Position = camera * vec4(position, 0.0, 1.0);
    texCoord = position / vec2(textureSize(uTexture, 0));
}
#endif

#ifdef FRAGMENT

out vec4 fragColor;

void main() {
    vec4 texColor = texture(uTexture, texCoord);
    fragColor = texColor * colorTint;
}

#endif