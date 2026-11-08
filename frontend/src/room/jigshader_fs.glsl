precision mediump float;

uniform sampler2D sampler1;
uniform sampler2D sampler2;
uniform sampler2D sampler3;

uniform float viewScale;
uniform vec2 shadowSpread;
uniform vec4 highlightColor;
uniform float borderOpacity;

varying vec4 vTexCoord;
varying vec2 vColor;
varying vec2 vShadowOffset;

void main() {
  vec4 image = texture2D(sampler1, vTexCoord.xy);
  vec4 mask = texture2D(sampler2, vTexCoord.zw);
  vec4 mask2 = texture2D(sampler2, vTexCoord.zw, 1.0 * viewScale);
  if (borderOpacity > 0.5)
    image.rgb *=
        min((mask.a * 0.33 + mask2.a * 0.66) + (1.0 - viewScale) * 0.1, 1.0);
  image *= mask.a * vColor.x;

  if ((vColor.x + vColor.y) == 0.0) {
    if (mask.a == 1.0) {
      gl_FragColor = vec4(0);
      return;
    }

    vec2 sd = shadowSpread * 0.2;
    float a1 = texture2D(sampler2, vTexCoord.zw + vec2(0, -sd.y)).a;
    float a2 = texture2D(sampler2, vTexCoord.zw + vec2(sd.x, 0)).a;
    float a3 = texture2D(sampler2, vTexCoord.zw + vec2(0, sd.y)).a;
    float a4 = texture2D(sampler2, vTexCoord.zw + vec2(-sd.x, 0)).a;
    float b1 = texture2D(sampler2, vTexCoord.zw + vec2(-sd.x, -sd.y)).a * 0.75;
    float b2 = texture2D(sampler2, vTexCoord.zw + vec2(sd.x, sd.y)).a * 0.75;
    float b3 = texture2D(sampler2, vTexCoord.zw + vec2(-sd.x, sd.y)).a * 0.75;
    float b4 = texture2D(sampler2, vTexCoord.zw + vec2(sd.x, -sd.y)).a * 0.75;
    gl_FragColor =
        highlightColor * max(mask.a, max(max(max(a1, a2), max(a3, a4)),
                                         max(max(b1, b2), max(b3, b4))));
    return;
  }

  float shadow = 0.0;

  if (mask.a != 1.0 && vColor.y > 0.0) {
    shadow = texture2D(sampler3, vTexCoord.zw + vShadowOffset).r * vColor.y *
             (1.0 - image.a);
  }

  gl_FragColor = vec4(0, 0, 0, shadow) + image;
}