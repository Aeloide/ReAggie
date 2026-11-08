precision highp float;
uniform sampler2D fbuffer;
uniform mat4 camera;
uniform vec2 dims;
uniform float time;

varying vec2 uv;

#ifdef VERTEX

in vec2 pos;

void main() {
	uv = pos + 0.5;
	uv.y = 1.0-uv.y;
	// gl_Position = camera * vec4(pos * dims + 1024.0f, 0, 1.0f);
	gl_Position = vec4(pos * 2.0f, 0, 1.0f);
}
#endif

#ifdef FRAGMENT

out vec4 color;

void main() {
	vec2 fpos = vec2(gl_FragCoord.xy);
	vec2 distortion = vec2(
		sin(fpos.y / 400.0 + time * 0.002) * 0.85,
		cos(fpos.x / 400.0 + time * 0.002) * 0.85
	);
	vec2 screenpos = (fpos + distortion) / vec2(textureSize(fbuffer, 0));
	color = texture(fbuffer, screenpos);
	color.a = 0.90;
}

#endif