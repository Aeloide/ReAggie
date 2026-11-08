precision mediump float;

uniform sampler2D sampler1;

uniform vec2 shadowOffset;
uniform vec2 shadowSpread;

varying vec2 vTexCoord;

void main() {
  vec2 shadowOff = vTexCoord - shadowOffset;
  vec2 sd = shadowSpread;
  vec2 sd2 = shadowSpread * 2.0;
  float bias = 1.0;

  float shadow = 0.0;

  shadow += texture2D(sampler1, shadowOff, bias).a * 0.15018315018315018;

  shadow += texture2D(sampler1, shadowOff + vec2(0, -sd.y), bias).a * 0.0952380;
  shadow += texture2D(sampler1, shadowOff + vec2(sd.x, 0), bias).a * 0.0952380;
  shadow += texture2D(sampler1, shadowOff + vec2(0, sd.y), bias).a * 0.0952380;
  shadow += texture2D(sampler1, shadowOff + vec2(-sd.x, 0), bias).a * 0.0952380;

  shadow += texture2D(sampler1, shadowOff + vec2(-sd.x, -sd.y), bias).a * 0.0586080;
  shadow += texture2D(sampler1, shadowOff + vec2(sd.x, sd.y), bias).a * 0.0586080;
  shadow += texture2D(sampler1, shadowOff + vec2(-sd.x, sd.y), bias).a * 0.0586080;
  shadow += texture2D(sampler1, shadowOff + vec2(sd.x, -sd.y), bias).a * 0.0586080;

  shadow += texture2D(sampler1, shadowOff + vec2(0, -sd2.y), bias).a * 0.0256410;
  shadow += texture2D(sampler1, shadowOff + vec2(sd2.x, 0), bias).a * 0.0256410;
  shadow += texture2D(sampler1, shadowOff + vec2(0, sd2.y), bias).a * 0.0256410;
  shadow += texture2D(sampler1, shadowOff + vec2(-sd2.x, 0), bias).a * 0.0256410;

  shadow += texture2D(sampler1, shadowOff + vec2(-sd2.x, -sd.y), bias).a * 0.01465201;
  shadow += texture2D(sampler1, shadowOff + vec2(sd2.x, sd.y), bias).a * 0.01465201;
  shadow += texture2D(sampler1, shadowOff + vec2(-sd2.x, sd.y), bias).a * 0.01465201;
  shadow += texture2D(sampler1, shadowOff + vec2(sd2.x, -sd.y), bias).a * 0.01465201;
  shadow += texture2D(sampler1, shadowOff + vec2(-sd.x, -sd2.y), bias).a * 0.01465201;
  shadow += texture2D(sampler1, shadowOff + vec2(sd.x, sd2.y), bias).a * 0.01465201;
  shadow += texture2D(sampler1, shadowOff + vec2(-sd.x, sd2.y), bias).a * 0.01465201;
  shadow += texture2D(sampler1, shadowOff + vec2(sd.x, -sd2.y), bias).a * 0.01465201;

  shadow += texture2D(sampler1, shadowOff + vec2(-sd2.x, -sd2.y), bias).a * 0.00366300;
  shadow += texture2D(sampler1, shadowOff + vec2(sd2.x, sd2.y), bias).a * 0.00366300;
  shadow += texture2D(sampler1, shadowOff + vec2(-sd2.x, sd2.y), bias).a * 0.00366300;
  shadow += texture2D(sampler1, shadowOff + vec2(sd2.x, -sd2.y), bias).a * 0.00366300;
  gl_FragColor = vec4(shadow);
}