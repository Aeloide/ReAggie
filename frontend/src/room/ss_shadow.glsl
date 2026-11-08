precision highp float;

uniform sampler2D uHeightMap;
uniform vec2 uResolution; 
uniform vec2 uShadowOffset; 
uniform float uRadius;      
uniform float uStrength;    
uniform float uTotalPieces;

#ifdef VERTEX
in vec2 position;
out vec2 vUV;
void main() {
    vUV = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}
#endif

#ifdef FRAGMENT
in vec2 vUV;
out vec4 color;

const float BIAS = 0.1; 
const float PI = 3.14159265;

float rand(vec2 co) {
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
    float myHeight = texture(uHeightMap, vUV).r;
    
    vec2 centerUV = vUV - (uShadowOffset / uResolution);
    vec2 radiusUV = vec2(uRadius / uResolution.x, uRadius / uResolution.y);
    
    float shadow = 0.0;
    
    float angleStart = rand(vUV) * 2.0 * PI;
    const int SAMPLES = 32;
    const float GOLDEN_ANGLE = 2.39996323; 
    
    for (int i = 0; i < SAMPLES; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / float(SAMPLES)); 
        float theta = angleStart + fi * GOLDEN_ANGLE;
        
        vec2 offset = vec2(cos(theta), sin(theta)) * r;
        vec2 samplePos = centerUV + offset * radiusUV;
        
        float h = texture(uHeightMap, samplePos).r;
        
        if (h > myHeight + BIAS) {
            float w = 1.0;
            // Selected pieces are shifted by 2 * totalPieces in height
            if (h > 2.0 * uTotalPieces) {
                 w = 1.3; // Double the darkness contribution for selected pieces
            }
            shadow += w;
        }
    }
    
    shadow /= float(SAMPLES);
    
    shadow = smoothstep(0.0, 1.0, shadow);
    
    // Allow alpha to exceed uStrength if shadow > 1.0 (due to weights)
    // But clamp final alpha to 1.0 to stay valid.
    float alpha = clamp(shadow * uStrength, 0.0, 1.0);
    
    float val = 1.0 - alpha;
    
    color = vec4(val, val, val, 1.0);
}
#endif
