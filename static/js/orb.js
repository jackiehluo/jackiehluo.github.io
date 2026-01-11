import * as THREE from "three";

const container = document.getElementById("orb-container");
if (!container) throw new Error("No orb container");

// Simplex noise for shaders
const simplexNoise = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
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

    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
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

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;

// Vertex shader - fluid morphing sphere
const vertexShader = `
  ${simplexNoise}

  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uMouseStrength;

  varying vec3 vNormal;
  varying float vFresnel;

  void main() {
    vec3 pos = position;
    vec3 norm = normalize(position);
    float t = uTime;

    // Organic wobble
    float wave1 = sin(pos.x * 0.9 + t * 1.1) * sin(pos.y * 1.0 + t * 0.9) * 0.045;
    float wave2 = sin(pos.y * 1.1 + t * 1.3) * sin(pos.z * 0.8 + t * 1.0) * 0.04;
    float wave3 = sin(pos.z * 1.0 + t * 0.8) * sin(pos.x * 1.2 + t * 1.2) * 0.035;
    float bigWobble = sin(t * 0.5 + pos.x * 0.5) * sin(t * 0.4 + pos.y * 0.6) * 0.03;
    float noise = snoise(norm * 1.2 + t * 0.4) * 0.025;
    float breathe = sin(t * 0.7) * 0.015;

    float displacement = wave1 + wave2 + wave3 + bigWobble + noise + breathe;

    // Cursor deformation
    vec3 mouseDir = normalize(vec3(uMouse.x, uMouse.y, 0.4));
    float facingMouse = dot(norm, mouseDir);
    float indent = smoothstep(-0.3, 1.0, facingMouse) * uMouseStrength * -0.15;
    float bulgeOut = smoothstep(0.3, -1.0, facingMouse) * uMouseStrength * 0.08;
    float sideBulge = (1.0 - abs(facingMouse)) * uMouseStrength * 0.06;

    displacement += indent + bulgeOut + sideBulge;

    vec3 newPosition = pos + norm * displacement;
    vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);

    vNormal = normalize(normalMatrix * norm);
    vFresnel = pow(1.0 - max(dot(normalize(-mvPosition.xyz), vNormal), 0.0), 2.0);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment shader - black and white with dithering
const fragmentShader = `
  ${simplexNoise}

  uniform float uTime;

  varying vec3 vNormal;
  varying float vFresnel;

  // Bayer 4x4 dither matrix
  float bayer4(vec2 coord) {
    vec2 c = floor(mod(coord, 4.0));
    int index = int(c.x) + int(c.y) * 4;
    float pattern[16];
    pattern[0] = 0.0/16.0;   pattern[1] = 8.0/16.0;   pattern[2] = 2.0/16.0;   pattern[3] = 10.0/16.0;
    pattern[4] = 12.0/16.0;  pattern[5] = 4.0/16.0;   pattern[6] = 14.0/16.0;  pattern[7] = 6.0/16.0;
    pattern[8] = 3.0/16.0;   pattern[9] = 11.0/16.0;  pattern[10] = 1.0/16.0;  pattern[11] = 9.0/16.0;
    pattern[12] = 15.0/16.0; pattern[13] = 7.0/16.0;  pattern[14] = 13.0/16.0; pattern[15] = 5.0/16.0;

    for (int i = 0; i < 16; i++) {
      if (i == index) return pattern[i];
    }
    return 0.0;
  }

  void main() {
    float time = uTime * 0.3;

    // Large flowing regions
    float t1 = time * 0.6;
    float t2 = time * 0.45;

    vec3 p = vNormal;

    float a1 = t1;
    vec3 rot1 = vec3(
      p.x * cos(a1) - p.y * sin(a1),
      p.x * sin(a1) + p.y * cos(a1),
      p.z
    );

    float a2 = -t2;
    vec3 rot2 = vec3(
      p.x,
      p.y * cos(a2) - p.z * sin(a2),
      p.y * sin(a2) + p.z * cos(a2)
    );

    float blob1 = snoise(rot1 * 0.8) * 0.5 + 0.5;
    float blob2 = snoise(rot2 * 0.6 + 1.5) * 0.5 + 0.5;

    float flow = mix(blob1, blob2, 0.5 + sin(time * 0.4) * 0.35);

    // Value based on flow and fresnel (edges darker)
    float value = flow * 0.7 + 0.15;
    value -= vFresnel * 0.3;
    value = clamp(value, 0.0, 1.0);

    // Dither threshold
    float threshold = bayer4(gl_FragCoord.xy);

    // Pure black or white
    float bw = value > threshold ? 1.0 : 0.0;

    gl_FragColor = vec4(vec3(bw), 0.96);
  }
`;

class OpalOrb {
  constructor(container) {
    this.container = container;
    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.mouseStrength = { value: 0, target: 0 };
    this.clock = new THREE.Clock();

    this.init();
    this.createOrb();
    this.addEventListeners();
    this.animate();
  }

  init() {
    this.scene = new THREE.Scene();

    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.z = 4;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(
      this.container.clientWidth,
      this.container.clientHeight
    );
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);
  }

  createOrb() {
    const geometry = new THREE.IcosahedronGeometry(1, 128);

    this.orbMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uMouseStrength: { value: 0 },
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      depthWrite: false,
    });

    this.orb = new THREE.Mesh(geometry, this.orbMaterial);
    this.scene.add(this.orb);
  }

  addEventListeners() {
    const PROXIMITY_PX = 120; // Only react within this distance

    window.addEventListener("mousemove", (e) => {
      const rect = this.container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Distance from cursor to orb center in pixels
      const distPx = Math.sqrt(
        Math.pow(e.clientX - centerX, 2) +
        Math.pow(e.clientY - centerY, 2)
      );

      if (distPx < PROXIMITY_PX) {
        this.mouse.targetX = (e.clientX - centerX) / (rect.width / 2);
        this.mouse.targetY = -(e.clientY - centerY) / (rect.height / 2);
        // Strength based on proximity (stronger when closer)
        this.mouseStrength.target = 1 - (distPx / PROXIMITY_PX);
      } else {
        this.mouseStrength.target = 0;
      }
    });

    window.addEventListener("mouseleave", () => {
      this.mouseStrength.target = 0;
    });

    window.addEventListener("touchmove", (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const rect = this.container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const distPx = Math.sqrt(
          Math.pow(touch.clientX - centerX, 2) +
          Math.pow(touch.clientY - centerY, 2)
        );

        if (distPx < PROXIMITY_PX) {
          this.mouse.targetX = (touch.clientX - centerX) / (rect.width / 2);
          this.mouse.targetY = -(touch.clientY - centerY) / (rect.height / 2);
          this.mouseStrength.target = 1 - (distPx / PROXIMITY_PX);
        } else {
          this.mouseStrength.target = 0;
        }
      }
    }, { passive: true });

    window.addEventListener("touchend", () => {
      this.mouseStrength.target = 0;
    });

    window.addEventListener("resize", () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.clock.stop();
      } else {
        this.clock.start();
      }
    });
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    if (document.hidden) return;

    const elapsed = this.clock.getElapsedTime();

    // Fast, responsive mouse tracking
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.12;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.12;
    this.mouseStrength.value += (this.mouseStrength.target - this.mouseStrength.value) * 0.08;

    // Nudge orb away from cursor (repel)
    const repelX = -this.mouse.x * this.mouseStrength.value * 0.2;
    const repelY = -this.mouse.y * this.mouseStrength.value * 0.2;
    this.orb.position.x += (repelX - this.orb.position.x) * 0.08;
    this.orb.position.y += (repelY - this.orb.position.y) * 0.08;

    // Update uniforms
    this.orbMaterial.uniforms.uTime.value = elapsed;
    this.orbMaterial.uniforms.uMouse.value.set(this.mouse.x, this.mouse.y);
    this.orbMaterial.uniforms.uMouseStrength.value = this.mouseStrength.value;

    this.renderer.render(this.scene, this.camera);
  }
}

new OpalOrb(container);
