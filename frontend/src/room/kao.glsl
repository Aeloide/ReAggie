precision highp float;
uniform sampler2D sprite;
uniform mat4 camera;
uniform vec2 dims;

varying vec2 uv;

#ifdef VERTEX

in vec2 spos;
in vec2 pos;
in float sel;

void main() {
	uv = spos + 0.5;
	uv.x /= 2.0;
	if (sel > 0.0)
		uv.x += 0.5;
	gl_Position = camera * vec4(spos * dims + pos, 0, 1.0f);
}
#endif

#ifdef FRAGMENT

out vec4 color;

void main() {
    color = texture(sprite, uv);// + vec4(1.0, 1.0, 0.0, 1.0);
}

#endif