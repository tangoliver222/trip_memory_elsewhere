export const vertexShader = /* glsl */`
  attribute float aRandom;
  attribute float aScale;
  attribute float aPhase;
  attribute float aAmplitude;
  attribute float aColorMix;
  attribute float aTargetIndex;
  attribute vec3 aTarget;

  uniform float uTime;
  uniform float uProgress;
  uniform float uPositionRandom;
  uniform float uDepth;
  uniform float uNoiseStrength;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uReducedMotion;
  uniform float uPulse;

  varying float vAlpha;
  varying float vColorMix;
  varying float vDepth;

  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0 / 7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m *= m;
    return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    float eased = uProgress * uProgress * (3.0 - 2.0 * uProgress);
    vec3 transformed = mix(position, aTarget, eased);
    float time = uTime * mix(0.04, 0.24, 1.0 - uReducedMotion);
    float noise = snoise(transformed * 0.09 + vec3(time + aPhase));
    float drift = (noise * aAmplitude * uNoiseStrength) + (aRandom - 0.5) * uPositionRandom;
    transformed += normalize(transformed + vec3(0.001)) * drift * (1.0 - uReducedMotion * 0.85);
    transformed.z *= uDepth;

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float perspective = clamp(110.0 / max(1.0, -mvPosition.z), 0.38, 1.85);
    gl_PointSize = min(5.0, uPointSize * aScale * uPixelRatio * perspective * (1.0 + uPulse * 0.35));
    vAlpha = mix(0.24, 0.92, aScale) * smoothstep(100.0, 3.0, -mvPosition.z);
    vColorMix = aColorMix;
    vDepth = perspective;
  }
`;

export const fragmentShader = /* glsl */`
  uniform vec3 uCoolColor;
  uniform vec3 uWarmColor;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vColorMix;
  varying float vDepth;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float distanceToCenter = length(centered);
    float softAlpha = 1.0 - smoothstep(0.04, 0.5, distanceToCenter);
    float core = 1.0 - smoothstep(0.0, 0.11, distanceToCenter);
    vec3 color = mix(uCoolColor, uWarmColor, clamp(vColorMix + core * 0.04, 0.0, 1.0));
    gl_FragColor = vec4(color, softAlpha * vAlpha * uOpacity * clamp(vDepth, 0.45, 1.25));
  }
`;
