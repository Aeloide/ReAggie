precision highp float;

uniform mat4 camera;
uniform sampler2D sprite;

varying vec2 uv;

#ifdef VERTEX

uniform float scale;

in vec2 spos;
in vec2 pos;

void main() {
	uv = spos + 0.5;
    vec2 dims = vec2(textureSize(sprite, 0));
	gl_Position = camera * vec4(spos * dims * scale + pos, 0, 1.0f);
}

#endif

#ifdef FRAGMENT

out vec4 color;

void main() {
    color = texture(sprite, uv);// + vec4(1.0, 1.0, 0.0, 1.0);
}

#endif