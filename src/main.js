// ============================================================================
// 운암고 부수기 — 개선판 2
//  · 파편은 사라지지 않고 남음 (쉬는 파편이 많아지면 움직임만 멈춤)
//  · 맞으면 여러 조각으로 터져 멀리 날아감 · 먼지/불꽃 · 화면 흔들림 · 폭발음
//  · 건물·기둥·깃발·간판·차량·나무·바닥 타일까지 물리 판정
//  · 1 K2(연사) · 2 M416(고연사) · 3 Kar98k(단발 고위력) · 스페이스 공
// 필요: three r152 이상, cannon-es 0.20 이상
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as CANNON from 'cannon-es';

const GRAVITY = 22;
const STEP = 1 / 60;      // 물리 고정 시간 간격
const PH = 0.985;          // 물리 상자 크기 보정 (맞닿은 면의 떨림 방지)

const rand = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const Z_AXIS = V(0, 0, 1);

// 렌더러 · 씬 · 카메라 · 조작 · 조명
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.style.cssText = 'margin:0;overflow:hidden';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xd3e3ef, 0.0009);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 4000);
camera.position.set(-20, 100, 180);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 10, -5);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 20;
controls.maxDistance = 600;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };

scene.add(new THREE.HemisphereLight(0xdcefff, 0x4d6b3c, 0.5));
const sun = new THREE.DirectionalLight(0xfff0dc, 1.6);
sun.position.set(140, 220, 120);
sun.target.position.set(0, 0, -40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 230, bottom: -230, near: 50, far: 700 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

// 텍스처 도구 (이미지 파일 없이 캔버스로 그림)
const canvas = (w, h = w) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const tex = (c, rep = 1) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  return t;
};
function speckle(g, w, h, cols, n) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = rand(0.2, 0.6);
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    g.fillRect(rand(0, w), rand(0, h), 2, 2);
  }
  g.globalAlpha = 1;
}
function noiseMat(base, cols, rough = 0.9, rep = 1) {
  const c = canvas(256), g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, cols, 2500);
  return new THREE.MeshStandardMaterial({ map: tex(c, rep), roughness: rough });
}

// 하늘 배경
{
  const c = canvas(4, 256), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#5d9bd6');
  gr.addColorStop(0.6, '#a9d1ec');
  gr.addColorStop(1, '#e8f1f6');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  scene.background = tex(c);
}

// 건물 외벽 아틀라스 (한 텍스처에 옆면과 옥상 패치를 같이 담음)
const FX = { w: 900, h: 900, y: 100 };
function win(g, x0, x1, y0, y1, frame) {
  const x = x0 * FX.w, w = (x1 - x0) * FX.w, y = FX.y + (1 - y1) * FX.h, h = (y1 - y0) * FX.h;
  g.fillStyle = '#d8d2c8';
  g.fillRect(x - 6, y + h, w + 12, 10);
  g.fillStyle = frame;
  g.fillRect(x, y, w, h);
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, '#8aa0b2');
  gr.addColorStop(0.5, '#2c3d4e');
  gr.addColorStop(1, '#5c7284');
  g.fillStyle = gr;
  g.fillRect(x + 7, y + 7, w - 14, h - 14);
  g.fillStyle = frame;
  g.fillRect(x + w / 2 - 3, y, 6, h);
}
const FACADE = {
  brick(g) {
    g.fillStyle = '#c9c1b3';
    g.fillRect(0, FX.y, FX.w, FX.h);
    const bw = FX.w / 20, bh = FX.h / 56;
    for (let r = 0; r < 56; r++)
      for (let c = -1; c <= 20; c++) {
        const t = rand(0.9, 1.1);
        g.fillStyle = `rgb(${(170 * t) | 0},${(82 * t) | 0},${(56 * t) | 0})`;
        g.fillRect(c * bw + ((r % 2) * bw) / 2 + 1.5, FX.y + r * bh + 1.5, bw - 3, bh - 3);
      }
    win(g, 0.14, 0.86, 0.2, 0.7, '#3a3f46');
  },
  panel(g) {
    g.fillStyle = '#d4d2cc';
    g.fillRect(0, FX.y, FX.w, FX.h);
    win(g, 0.16, 0.84, 0.2, 0.7, '#2f353c');
  },
  gym(g) {
    g.fillStyle = '#e4dfd4';
    g.fillRect(0, FX.y, FX.w, FX.h);
    win(g, 0.04, 0.96, 0.3, 0.72, '#343a41');
  },
  bridge(g) {
    g.fillStyle = '#3f6d57';
    g.fillRect(0, FX.y, FX.w, FX.h);
  },
};
function facadeMat(draw, roof) {
  const c = canvas(1000), g = c.getContext('2d');
  draw(g);
  g.fillStyle = roof;
  g.fillRect(900, 0, 100, 100);
  return new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.85 });
}

// 로고·간판·깃발·운동장 텍스처
function arcText(g, s, cx, cy, r, a0, a1) {
  [...s].forEach((ch, i, arr) => {
    const a = a0 + ((a1 - a0) * i) / (arr.length - 1);
    g.save();
    g.translate(cx + r * Math.cos(a), cy + r * Math.sin(a));
    g.rotate(a + Math.PI / 2);
    g.fillText(ch, 0, 0);
    g.restore();
  });
}
function taegeuk(g, x, y, r) {
  g.fillStyle = '#003478';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c8102e';
  g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.fill();
  g.fillStyle = '#003478';
  g.beginPath(); g.arc(x, y - r / 2, r / 2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c8102e';
  g.beginPath(); g.arc(x, y + r / 2, r / 2, 0, Math.PI * 2); g.fill();
}
function logoTex() {                                  // 학교 로고: 남색 테두리, 하늘색·빨강 원, 흰 물결, UNAM HIGH SCHOOL, 2007
  const S = 512, C = S / 2, c = canvas(S), g = c.getContext('2d');
  const disc = (x, y, r, col) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = col; g.fill(); };
  disc(C, C, C - 2, '#1d4a9e');
  disc(C, C, C - 46, '#ffffff');
  g.save();
  g.beginPath(); g.arc(C, C, C - 46, 0, Math.PI * 2); g.clip();
  disc(C - 34, C - 34, 140, '#42b6e6');
  disc(C + 44, C + 58, 118, '#e2312b');
  g.beginPath(); g.moveTo(0, C + 10); g.quadraticCurveTo(C, C - 40, S, C + 40);
  g.lineWidth = 40; g.strokeStyle = '#ffffff'; g.stroke();
  g.restore();
  g.fillStyle = '#2fa84a'; g.font = 'bold 40px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('2007', C - 128, C - 158);
  g.fillStyle = '#ffffff'; g.font = 'bold 30px Arial, sans-serif';
  arcText(g, 'UNAM HIGH SCHOOL', C, C, C - 24, -Math.PI * 0.92, -Math.PI * 0.08);
  return tex(c);
}
function signTex() {
  const c = canvas(2048, 360), g = c.getContext('2d');
  g.fillStyle = '#1d3557';
  g.fillRect(0, 0, 2048, 360);
  g.font = 'bold 150px "Noto Serif KR", "Malgun Gothic", serif';
  g.fillStyle = '#f7f2e8';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('운 암 고 등 학 교', 1024, 185);
  return tex(c);
}
function flagTex() {
  const c = canvas(300, 200), g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 300, 200);
  taegeuk(g, 150, 100, 52);
  return tex(c);
}
// 기하 (단위 상자, 외벽용 상자, 나무 수관)
const noise3 = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const facadeGeo = boxGeo.clone();
{
  // 옆면은 벽면 영역, 윗·아랫면은 옥상 패치를 보도록 UV 재배치
  const uv = facadeGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const f = (i / 4) | 0, u = uv.getX(i), v = uv.getY(i);
    if (f === 2 || f === 3) uv.setXY(i, 0.9 + u * 0.1, 0.9 + v * 0.1);
    else uv.setXY(i, u * 0.9, v * 0.9);
  }
  uv.needsUpdate = true;
}
const crownGeo = (() => {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, v = V(0, 0, 0);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 0.85 + 0.3 * noise3(v.x * 3, v.y * 3, v.z * 3);
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.computeVertexNormals();
  return g;
})();

// 재질
const MAT = {
  brick: facadeMat(FACADE.brick, '#5f7d69'),
  panel: facadeMat(FACADE.panel, '#6d7377'),
  gym: facadeMat(FACADE.gym, '#4a443e'),
  bridge: facadeMat(FACADE.bridge, '#7b8389'),
  outerLawn: noiseMat('#5a8b3d', ['#6fa04c', '#4b7a33', '#7fae5c'], 0.95, 40),
  hedge: noiseMat('#2f5e2f', ['#3f7a3c', '#24492a', '#4d8a45']),
  bark: new THREE.MeshStandardMaterial({ color: 0x5b4331, roughness: 0.95 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.4, metalness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x2a4d66, roughness: 0.1, metalness: 0.5 }),
  ac: new THREE.MeshStandardMaterial({ color: 0xc4c9cf, roughness: 0.55, metalness: 0.25 }),
  water: new THREE.MeshStandardMaterial({ color: 0x2f8fc9, roughness: 0.08 }),
  sign: new THREE.MeshStandardMaterial({ map: signTex(), roughness: 0.6 }),
  logo: new THREE.MeshStandardMaterial({ map: logoTex(), alphaTest: 0.5, roughness: 0.6 }),
  flag: new THREE.MeshStandardMaterial({ map: flagTex(), roughness: 0.8 }),
  leaf: [0x3f7d3b, 0x4c8c41, 0x3a7244, 0x58923f, 0x2f6e3c].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })),
  car: [0xf2f2f2, 0x1e1f23, 0xb7bcc2, 0x2b4a7a, 0x8e2a2a, 0xe8e2d0].map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.3, metalness: 0.3, clearcoat: 1 })),
};

// 물리 월드
const world = new CANNON.World();
world.gravity.set(0, -GRAVITY, 0);
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = 6;
world.defaultContactMaterial.friction = 0.5;
world.defaultContactMaterial.restitution = 0.05;
const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
floor.position.set(0, -2, 0);
world.addBody(floor);


// ----------------------------------------------------------------------------
// [4] 재질 · 등록부 · 물체 만들기
// ----------------------------------------------------------------------------
const std = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const MX = {                          // 추가 재질
  base: noiseMat('#4b3728', ['#3d2d20', '#5a4431'], 1),
  roof: std(0x5c3a31, 0.7),
  carGlass: std(0x1b2430, 0.1, { metalness: 0.6 }),
  rim: std(0xe6642c, 0.4),
};
const FRAG = {                        // 부서질 때 흩어지는 조각의 재질
  brick: noiseMat('#a4553c', ['#8c4530', '#c26d50', '#6e3424'], 0.9),
  concrete: noiseMat('#cfccc5', ['#b5b2aa', '#e3e0d8', '#9e9b93'], 0.9),
  dark: noiseMat('#3a4450', ['#2c343d', '#4b5661'], 0.8),
  soil: noiseMat('#5b4330', ['#4a3626', '#6d5139'], 1),
  metal: MAT.steel,
  white: MAT.white,
  bark: MAT.bark,
  leaf: MAT.leaf[0],
  water: MAT.water,
};

const chunks = new Map();             // 재질·기하별 InstancedMesh 묶음 (그리기 호출 줄이기)
const bodyPiece = new Map();          // CANNON.Body → 물체 정보
const pieces = [];                    // 부술 수 있는 물체 (땅·건물·나무 …)
const dyn = [];                       // 움직이는 물체 (떨어지는 블록·파편)
const queue = [];                     // 충돌 타격 (물리 계산이 끝난 뒤 처리)
const dirtyChunks = new Set();
let settleFlag = false, groundDirty = false, groundAttr = null;
const massOf = (s) => Math.max(0.2, s.x * s.y * s.z * 0.25);

function slot(geo, mat) {             // 같은 재질의 물체를 한 묶음에 넣어 그림
  const key = geo.uuid + '|' + mat.uuid;
  let ch = chunks.get(key);
  if (!ch || ch.n >= 2048) {
    const im = new THREE.InstancedMesh(geo, mat, 2048);
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    im.count = 0;
    scene.add(im);
    ch = { im, n: 0 };
    chunks.set(key, ch);
  }
  ch.im.count = ++ch.n;
  return { im: ch.im, idx: ch.n - 1 };
}

const _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _M = new THREE.Matrix4();
function setMatrix(p) {
  const b = p.body;
  _P.set(b.position.x, b.position.y, b.position.z);
  _Q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
  p.im.setMatrixAt(p.idx, _M.compose(_P, _Q, p.vis));
  dirtyChunks.add(p.im);
}

// 물체 하나. size: 전체 크기 · round: 공 모양 · root: 땅(떨어지지 않음)
// unbreak: 부서지지 않음 · exact: 물리 상자를 줄이지 않음 · frag: 부서진 조각 재질
function piece(o) {
  const [sx, sy, sz] = o.size, [x, y, z] = o.pos, k = o.exact ? 1 : PH;
  const body = new CANNON.Body({
    mass: 0,
    position: new CANNON.Vec3(x, y, z),
    shape: o.round
      ? new CANNON.Sphere(sx / 2)
      : new CANNON.Box(new CANNON.Vec3((sx * k) / 2, (sy * k) / 2, (sz * k) / 2)),
  });
  world.addBody(body);
  const s = slot(o.geo, o.mat);
  const p = {
    id: pieces.length, kind: 'piece', body, im: s.im, idx: s.idx,
    pos: V(x, y, z), size: V(sx, sy, sz),
    min: V(x - sx / 2, y - sy / 2, z - sz / 2),
    max: V(x + sx / 2, y + sy / 2, z + sz / 2),
    vis: o.round ? V(sx / 2, sy / 2, sz / 2) : V(sx, sy, sz),
    fragMat: o.frag, root: !!o.root, unbreak: !!o.unbreak,
    origMat: o.mat, school: !!o.school, hp: 1,
    alive: true, dyn: false, frag: false, frozen: false, listening: false,
    nb: [], mk: 0, lastV: null,
  };
  setMatrix(p);
  bodyPiece.set(body, p);
  pieces.push(p);
  return p;
}

// ----------------------------------------------------------------------------
// [5] 땅: 6×6 타일로 나눔 (부서지는 땅). 지도 그림 한 장을 입혀 선·포장이 이어지게 함
// ----------------------------------------------------------------------------
const TILE = 6, PX = 8;                                          // 1유닛 = 8px
const GR = { x0: -120, z0: -72, nx: 40, nz: 28 };               // 땅 영역 240 × 168
const GX1 = GR.x0 + GR.nx * TILE, GZ1 = GR.z0 + GR.nz * TILE;   // 120, 96
const CW = GR.nx * TILE * PX + 8, CH = GR.nz * TILE * PX + 8;   // 그림 크기 (오른쪽·아래 8px 여백 = 흙색)

function groundAtlas() {
  const c = canvas(CW, CH), g = c.getContext('2d');
  const X = (x) => (x - GR.x0) * PX, Z = (z) => (z - GR.z0) * PX, S = (s) => s * PX;
  const fill = (x0, z0, x1, z1, col) => { g.fillStyle = col; g.fillRect(X(x0), Z(z0), S(x1 - x0), S(z1 - z0)); };
  const speck = (x0, z0, x1, z1, cols, n) => {
    for (let i = 0; i < n; i++) {
      g.globalAlpha = rand(0.2, 0.5);
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.fillRect(rand(X(x0), X(x1)), rand(Z(z0), Z(z1)), 3, 3);
    }
    g.globalAlpha = 1;
  };
  const ln = (w) => { g.strokeStyle = '#f4f4ef'; g.lineWidth = S(w); };
  const seg = (x0, z0, x1, z1, w = 0.5) => { ln(w); g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.stroke(); };
  const rect = (x0, z0, x1, z1, w = 0.5) => { ln(w); g.strokeRect(X(x0), Z(z0), S(x1 - x0), S(z1 - z0)); };
  const circ = (x, z, r, w = 0.5) => { ln(w); g.beginPath(); g.arc(X(x), Z(z), S(r), 0, Math.PI * 2); g.stroke(); };

  fill(GR.x0, GR.z0, GX1, GZ1, '#5a8b3d');                                  // 잔디
  speck(GR.x0, GR.z0, GX1, GZ1, ['#6fa04c', '#4b7a33', '#7fae5c', '#43702e'], 26000);
  fill(-112, GR.z0, -100, GZ1, '#3a3e44');                                  // 서쪽 도로
  g.fillStyle = 'rgba(245,245,240,0.9)';
  for (let z = GR.z0; z < GZ1; z += 8) g.fillRect(X(-106.4), Z(z), S(0.8), S(4));
  fill(-100, GR.z0, -96, GZ1, '#b5533a');                                   // 자전거도로
  fill(-43, -17, 71, -3, '#8a5a42');                                        // 광장 벽돌
  for (let r = 0; r < 14; r++) for (let k = 0; k < 56; k++) {
    const t = rand(0.85, 1.12);
    g.fillStyle = `rgb(${(160 * t) | 0},${(88 * t) | 0},${(62 * t) | 0})`;
    g.fillRect(X(-43 + k * 2 + (r % 2)) + 1, Z(-17 + r) + 1, S(2) - 2, S(1) - 2);
  }
  fill(-43, -4, 71, -2.4, '#2f5e2f');                                       // 생울타리 밑
  fill(-40, -2, 90, 78, '#d6b889');                                         // 운동장
  speck(-40, -2, 90, 78, ['#c39e6c', '#e6ccaa', '#b98e5d'], 14000);
  rect(-39.2, -0.8, 88.4, 76.8, 0.7); seg(25, -0.8, 25, 76.8, 0.7); circ(25, 38, 9, 0.7);
  rect(-39.2, 18, -22.8, 58, 0.7); rect(72.8, 18, 88.4, 58, 0.7);
  fill(-85, 10, -45, 66, '#2f8f92');                                        // 농구장
  rect(-84.2, 10.8, -45.8, 65.2, 0.6); seg(-85, 38, -45, 38, 0.6); circ(-65, 38, 4, 0.6);
  rect(-69.5, 10, -60.5, 22, 0.6); rect(-69.5, 54, -60.5, 66, 0.6);
  fill(71, -41, 101, -3, '#4b5057');                                        // 주차장
  for (let k = 0; k <= 4; k++) seg(71 + k * 7.5, -40, 71 + k * 7.5, -4, 0.45);
  g.fillStyle = '#4b3728';                                                  // 옆면 흙 (여백)
  g.fillRect(CW - 8, 0, 8, CH);
  g.fillRect(0, CH - 8, CW, 8);
  return tex(c);
}

const FACES = [                       // 상자의 여섯 면 (꼭짓점 순서는 바깥에서 볼 때 시계 반대 방향)
  [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
  [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
  [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
  [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
  [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
];
function buildGround() {              // 타일 모든 면을 한 덩어리 그림으로 만듦
  const NT = GR.nx * GR.nz, h = TILE / 2, soilUV = [(CW - 4) / CW, 4 / CH];
  const P = new Float32Array(NT * 72), N = new Float32Array(NT * 72);
  const U = new Float32Array(NT * 48), I = new Uint32Array(NT * 36);
  for (let k = 0; k < NT; k++) {
    const cx = GR.x0 + ((k % GR.nx) + 0.5) * TILE;
    const cz = GR.z0 + (((k / GR.nx) | 0) + 0.5) * TILE;
    FACES.forEach(([n, cs], f) => {
      for (let c = 0; c < 4; c++) {
        const v = k * 24 + f * 4 + c;
        const x = cx + cs[c][0] * h, y = -0.5 + cs[c][1] * 0.5, z = cz + cs[c][2] * h;
        P.set([x, y, z], v * 3);
        N.set(n, v * 3);
        U.set(f === 2 ? [(x - GR.x0) * PX / CW, 1 - (z - GR.z0) * PX / CH] : soilUV, v * 2);
      }
      const b = k * 24 + f * 4;
      I.set([b, b + 1, b + 2, b, b + 2, b + 3], k * 36 + f * 6);
    });
  }
  const geo = new THREE.BufferGeometry();
  groundAttr = new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', groundAttr);
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  geo.setIndex(new THREE.BufferAttribute(I, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: groundAtlas(), roughness: 0.95 }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return P;
}
const GP = buildGround();

const tiles = [];
for (let j = 0; j < GR.nz; j++) for (let i = 0; i < GR.nx; i++) {
  const x = GR.x0 + (i + 0.5) * TILE, z = GR.z0 + (j + 0.5) * TILE;
  const body = new CANNON.Body({
    mass: 0,
    position: new CANNON.Vec3(x, -0.5, z),
    shape: new CANNON.Box(new CANNON.Vec3(TILE / 2, 0.5, TILE / 2)),
  });
  world.addBody(body);
  const p = {
    id: pieces.length, kind: 'tile', k: tiles.length, body, im: null, idx: -1,
    pos: V(x, -0.5, z), size: V(TILE, 1, TILE),
    min: V(x - TILE / 2, -1, z - TILE / 2), max: V(x + TILE / 2, 0, z + TILE / 2),
    vis: V(0, 0, 0), fragMat: FRAG.soil, root: true, unbreak: true,
    alive: true, dyn: false, frag: false, frozen: false, listening: false,
    nb: [], mk: 0, lastV: null,
  };
  bodyPiece.set(body, p);
  pieces.push(p);
  tiles.push(p);
}
function hideTile(p) {                // 부서진 타일은 그림에서 아래로 내려 숨김
  for (let v = 0; v < 24; v++) GP[(p.k * 24 + v) * 3 + 1] = -50;
  groundDirty = true;
}

// 땅속 흙과 바깥 잔디 (부서지지 않는 바닥)
const solid = (x0, z0, x1, z1, y0, y1, mat, frag) => piece({
  geo: boxGeo, mat, size: [x1 - x0, y1 - y0, z1 - z0],
  pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  root: true, unbreak: true, exact: true, frag,
});
solid(GR.x0, GR.z0, GX1, GZ1, -2, -1, MX.base, FRAG.soil);
solid(-900, -900, 900, GR.z0, -1, 0, MAT.outerLawn, FRAG.soil);
solid(-900, GZ1, 900, 900, -1, 0, MAT.outerLawn, FRAG.soil);
solid(-900, GR.z0, GR.x0, GZ1, -1, 0, MAT.outerLawn, FRAG.soil);
solid(GX1, GR.z0, 900, GZ1, -1, 0, MAT.outerLawn, FRAG.soil);

// ----------------------------------------------------------------------------
// [6] 건물·조형물 배치 (전부 부서지는 물체, 창 한 칸 = 블록 한 칸)
// ----------------------------------------------------------------------------
const FH = 4.4;
const facade = (mat, size, pos, frag) => piece({ geo: facadeGeo, mat, size, pos, frag, school: true });
const obj = (mat, size, pos, frag = FRAG.dark) => piece({ geo: boxGeo, mat, size, pos, frag });
function bays(mat, frag, x0, y0, z0, cols, rows, layers, sx, sy, sz) {
  for (let l = 0; l < layers; l++) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    facade(mat, [sx, sy, sz], [x0 + (c + 0.5) * sx, y0 + (l + 0.5) * sy, z0 + (r + 0.5) * sz], frag);
}

// 건물
bays(MAT.brick, FRAG.brick, -20, 0, -32, 16, 3, 5, 5, FH, 5);      // 본관 (붉은 벽돌 5층)
bays(MAT.brick, FRAG.brick, -20, 0, -47, 8, 3, 4, 5, FH, 5);       // 뒷동
bays(MAT.panel, FRAG.concrete, -40, 0, -37, 4, 4, 5, 5, FH, 5);    // 교무동 (회색 패널)
bays(MAT.gym, FRAG.concrete, -94, 0, -36, 8, 3, 3, 5.5, FH, 5);    // 체육관
bays(MAT.bridge, FRAG.dark, -50, FH, -32, 2, 1, 1, 5, FH, 4);      // 구름다리
obj(MX.roof, [44, 1.2, 15], [-72, 13.8, -28.5]);                   // 체육관 지붕

// 본관·교무동 부속물
for (let x = -10; x <= 56; x += 6) obj(MAT.ac, [2.4, 1.8, 3], [x, 22.9, -22.5], FRAG.metal); // 옥상 실외기
obj(MAT.sign, [16, 2.8, 0.3], [20, 20.6, -16.85]);                 // 교명 간판
obj(MAT.steel, [17, 0.45, 5], [14, 5, -14.5], FRAG.metal);         // 현관 캐노피
for (const x of [6, 22]) obj(MAT.steel, [0.8, 4.9, 0.8], [x, 2.45, -15.4], FRAG.metal); // 기둥
obj(MAT.logo, [3.2, 3.2, 0.4], [-30, 19.5, -16.8], FRAG.concrete); // 학교 로고
for (const x of [64, 68]) {                                        // 게양대와 태극기
  obj(MAT.steel, [0.3, 13, 0.3], [x, 6.5, -13], FRAG.metal);
  obj(MAT.flag, [4.2, 2.8, 0.12], [x + 2.25, 11.2, -13], FRAG.white);
}

// 마당 시설
piece({ geo: boxGeo, mat: MAT.water, size: [12, 0.5, 5], pos: [12, 0.25, -9], frag: FRAG.water }); // 연못
for (let k = 0; k < 19; k++) obj(MAT.hedge, [6, 1.2, 1.6], [-40 + k * 6, 0.6, -3.2], FRAG.leaf); // 생울타리
for (const z of [34.5, 41.5]) obj(MAT.white, [0.3, 2.5, 0.3], [88, 1.25, z], FRAG.white);        // 골대 기둥
obj(MAT.white, [0.3, 0.3, 7.3], [88, 2.5, 38], FRAG.white);                                       // 골대 가로대
for (const [zB, dir] of [[11.3, 1], [64.7, -1]]) {                                                // 농구골대
  const zp = zB - dir * 0.2;
  obj(MAT.steel, [0.3, 5, 0.3], [-65, 2.5, zp], FRAG.metal);
  obj(MAT.white, [2.4, 1.5, 0.3], [-65, 4.6, zB], FRAG.white);
  obj(MX.rim, [1.8, 0.12, 0.8], [-65, 3.9, zB + dir * 0.45], FRAG.metal);
}
[82.25, 89.75].forEach((x, col) => {                                                              // 주차된 차
  for (let i = 0; i < 6; i++) {
    if ((i + col) % 4 === 2) continue;
    const z = -8 - i * 5.4, m = MAT.car[(i * 2 + col) % MAT.car.length];
    obj(m, [2.0, 1.0, 4.2], [x, 0.5, z], m);
    obj(MX.carGlass, [1.8, 0.8, 2.3], [x, 1.4, z - 0.2], MX.carGlass);
  }
});

// 나무 (몸통 + 둥근 수관)
const SPOTS = [
  [-92, -66], [-92, -46], [-92, 0], [-92, 14], [-92, 28], [-92, 42], [-92, 56], [-92, 70], [-92, 84],
  [68, -30], [68, -22], [-52, -6], [-30, -60], [0, -62], [30, -60], [60, -62],
  [104, -60], [104, -30], [104, 0], [104, 30], [104, 60],
];
for (let x = -60; x <= 100; x += 14) SPOTS.push([x, 88]);
for (const [x, z] of SPOTS) {
  const R = rand(2.9, 3.5);
  obj(MAT.bark, [0.8, 4.6, 0.8], [x, 2.3, z], FRAG.bark);
  piece({
    geo: crownGeo, mat: MAT.leaf[(Math.random() * 5) | 0], round: true,
    size: [2 * R, 2 * R, 2 * R], pos: [x, 4.6 + 0.4 * R, z], frag: FRAG.leaf,
  });
}

// ----------------------------------------------------------------------------
// [7] 받침 관계: 땅과 이어진 물체만 남고, 끊기면 떨어짐
// ----------------------------------------------------------------------------
function touches(a, b) {              // 겹치거나 면이 맞닿아 있으면 이어진 것으로 봄
  const e = 0.08, o = 0.02;
  const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const oy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  if (ox > o && oy > o && oz > o) return true;
  if (ox > o && oz > o && (Math.abs(a.max.y - b.min.y) < e || Math.abs(b.max.y - a.min.y) < e)) return true;
  if (oy > o && oz > o && (Math.abs(a.max.x - b.min.x) < e || Math.abs(b.max.x - a.min.x) < e)) return true;
  return ox > o && oy > o && (Math.abs(a.max.z - b.min.z) < e || Math.abs(b.max.z - a.min.z) < e);
}
function buildLinks() {               // 가까운 물체끼리 연결 목록 만들기 (공간 칸으로 나눠서 빠르게)
  const CELL = 8, cellMap = new Map(), done = new Set();
  for (const p of pieces.filter((q) => !q.unbreak || q.kind === 'tile'))
    for (let i = Math.floor(p.min.x / CELL); i <= Math.floor(p.max.x / CELL); i++)
      for (let j = Math.floor(p.min.y / CELL); j <= Math.floor(p.max.y / CELL); j++)
        for (let k = Math.floor(p.min.z / CELL); k <= Math.floor(p.max.z / CELL); k++) {
          const key = i + ',' + j + ',' + k;
          if (!cellMap.has(key)) cellMap.set(key, []);
          cellMap.get(key).push(p);
        }
  for (const arr of cellMap.values())
    for (let a = 0; a < arr.length; a++)
      for (let b = a + 1; b < arr.length; b++) {
        const p = arr[a], q = arr[b];
        const id = Math.min(p.id, q.id) * 1e6 + Math.max(p.id, q.id);
        if (done.has(id)) continue;
        done.add(id);
        if (touches(p, q)) { p.nb.push(q); q.nb.push(p); }
      }
}
let mark = 1;
function settle() {                   // 땅(뿌리)에서 이어지지 않은 물체는 떨어뜨림
  mark++;
  const q = [];
  for (const p of pieces) if (p.alive && p.root) { p.mk = mark; q.push(p); }
  for (let i = 0; i < q.length; i++)
    for (const n of q[i].nb)
      if (n.alive && !n.dyn && n.mk !== mark) { n.mk = mark; q.push(n); }
  for (const p of pieces)
    if (p.alive && !p.dyn && !p.root && p.mk !== mark) makeDynamic(p);
}

// ----------------------------------------------------------------------------
// [8] 움직이는 물체 · 조각 · 파괴
// ----------------------------------------------------------------------------
const MAX_DYN = 260, BREAK_SPEED = 14, GROUND_BREAK = 16, MAX_HITS_PER_FRAME = 10;

function makeDynamic(p) {             // 정적 물체 → 움직이는 물체 (중력을 받아 떨어짐)
  if (p.dyn || !p.alive || p.unbreak) return;
  const b = p.body;
  b.type = CANNON.Body.DYNAMIC;
  b.mass = massOf(p.size);
  b.updateMassProperties();
  b.linearDamping = 0.03;
  b.angularDamping = 0.2;
  b.wakeUp();
  p.dyn = true;
  p.frozen = false;
  dyn.push(p);
  if (!p.listening) {
    p.listening = true;
    b.addEventListener('collide', (e) => onBump(p, e));
  }
}
function freeze(p) {                  // 조각이 너무 많을 때: 움직임만 멈추고 충돌은 남김
  const b = p.body;
  b.type = CANNON.Body.STATIC;
  b.mass = 0;
  b.updateMassProperties();
  b.velocity.set(0, 0, 0);
  b.angularVelocity.set(0, 0, 0);
  p.dyn = false;
  p.frozen = true;
}
function capDynamics() {
  let over = dyn.length - MAX_DYN;
  if (over <= 0) return;
  const keep = [];
  for (const p of dyn) {
    if (over > 0 && p.frag && p.body.sleepState === CANNON.Body.SLEEPING) { freeze(p); over--; }
    else keep.push(p);
  }
  dyn.length = 0;
  for (const p of keep) dyn.push(p);
}

function onBump(p, e) {               // 떨어지던 구조물이 세게 부딪히면 맞은 쪽도 부서짐 (조각은 제외)
  if (!p.alive || !p.dyn || p.frag || p.pulled) return;
  const q = bodyPiece.get(e.body);
  if (!q || !q.alive || q.dyn || q.frag || q.unbreak || q.pulled) return;
  const v = p.lastV || p.body.velocity;
  const sp = v.length();
  if (sp < (q.kind === 'tile' ? GROUND_BREAK : BREAK_SPEED)) return;
  const c = p.body.position;
  queue.push({ q, at: V(c.x, c.y, c.z), dir: V(v.x, v.y, v.z).normalize(), power: Math.min(sp, 60) });
}
function processQueue() {
  for (const it of queue.slice(0, MAX_HITS_PER_FRAME)) if (it.q.alive) shatter(it.q, it.at, it.dir, it.power);
  queue.length = 0;
}

function shatter(p, at, dir, power, spread = 0.04) {  // 맞은 물체를 여러 조각으로 터뜨림
  if (!p.alive || p.unbreak) return;
  if (p.hp > 1) {                        // 강철 운암고: hp가 남아 있으면 흠집만 남기고 버팀
    p.hp -= 1;
    flash(at, 0xffe2a0, 1.2, 0.1);
    emit(at, 4, { v: [4, 10], life: [0.2, 0.4], size: [0.1, 0.2], colors: SPARK, g: 1.2, drag: 0.9, grow: 0 });
    shake(0.08);
    crack();
    return;
  }
  p.alive = false;
  if (p.dyn) {
    const i = dyn.indexOf(p);
    if (i >= 0) dyn.splice(i, 1);
    p.dyn = false;
  }
  world.removeBody(p.body);
  if (p.im) { p.vis.set(0, 0, 0); setMatrix(p); }
  else hideTile(p);
  const n = p.kind === 'tile' ? 2 : p.size.x * p.size.z > 25 ? 3 : 2;
  for (let i = 0; i < n; i++) spawnFragment(p, at, dir, power, spread);
  burst(at, p.size, power);
  settleFlag = true;
}

function spawnFragment(p, at, dir, power, spread = 0.04) {   // 조각 하나: 맞은 자리에서 멀어지는 방향으로 날아감
  const s = p.size, c = p.body.position;
  const fs = V(
    Math.max(0.35, s.x * rand(0.28, 0.5)),
    Math.max(0.3, s.y * rand(0.28, 0.5)),
    Math.max(0.35, s.z * rand(0.28, 0.5))
  );
  const rd = V(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)).normalize();
  const fp = V(c.x, c.y, c.z).addScaledVector(rd, Math.max(s.x, s.y, s.z) * 0.05);
  if (p.kind === 'tile') fp.y = Math.max(fp.y, 0.4);
  const out = fp.clone().sub(at);
  if (out.lengthSq() < 1e-4) out.copy(rd);
  const vel = out.normalize().multiplyScalar(power * spread).addScaledVector(dir, power * 0.02);
  vel.y += rand(0, 0.5);
  const body = new CANNON.Body({
    mass: massOf(fs),
    position: new CANNON.Vec3(fp.x, fp.y, fp.z),
    linearDamping: 0.02,
    angularDamping: 0.1,
    shape: new CANNON.Box(new CANNON.Vec3((fs.x * PH) / 2, (fs.y * PH) / 2, (fs.z * PH) / 2)),
  });
  body.velocity.set(vel.x, vel.y, vel.z);
  body.angularVelocity.set(rand(-1, 1), rand(-1, 1), rand(-1, 1));
  world.addBody(body);
  const sl = slot(boxGeo, p.fragMat || FRAG.concrete);
  const f = {
    id: -1, kind: 'frag', body, im: sl.im, idx: sl.idx, size: fs, vis: fs.clone(),
    alive: true, dyn: true, frag: true, frozen: false, listening: true,
    root: false, unbreak: false, nb: [], mk: 0, lastV: null,
  };
  bodyPiece.set(body, f);
  body.addEventListener('collide', (e) => onBump(f, e));
  dyn.push(f);
  setMatrix(f);
}

// ----------------------------------------------------------------------------
// [9] 효과 · 소리 · 화면 흔들림
// ----------------------------------------------------------------------------
const DUST = ['#b8a58a', '#9c8a72', '#d6cbb8'];
const SPARK = ['#ffd27a', '#ffb347', '#fff3c4'];

const flashGeo = new THREE.SphereGeometry(1, 14, 10);
const flashes = [];
function flash(at, color, r, dur) {   // 번쩍이며 커지는 빛
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
  const mesh = new THREE.Mesh(flashGeo, m);
  mesh.position.copy(at);
  scene.add(mesh);
  flashes.push({ mesh, m, t: 0, dur, r });
}
function updateFlashes(dt) {
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt;
    const k = Math.min(f.t / f.dur, 1);
    f.mesh.scale.setScalar(0.3 + f.r * (1 - Math.pow(1 - k, 3)));
    f.m.opacity = 0.9 * (1 - k);
    if (k >= 1) {
      scene.remove(f.mesh);
      f.m.dispose();
      flashes.splice(i, 1);
    }
  }
}

// 먼지·불꽃 입자 (미리 만들어 둔 묶음을 돌려 씀)
const PMAX = 400;
const partMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(1, 6, 4),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false }),
  PMAX
);
partMesh.frustumCulled = false;
partMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
partMesh.setColorAt(0, new THREE.Color(0xffffff));
scene.add(partMesh);
const PD = [];
for (let i = 0; i < PMAX; i++) {
  PD.push({ life: 0, max: 1, pos: V(0, 0, 0), vel: V(0, 0, 0), s: 0, g: 1, drag: 0.92, grow: 0 });
  partMesh.setMatrixAt(i, ZERO);
}
let pHead = 0;
const _c = new THREE.Color(), _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _ps = new THREE.Vector3();
function emit(at, n, o) {
  for (let i = 0; i < n; i++) {
    const id = pHead;
    pHead = (pHead + 1) % PMAX;
    const d = PD[id];
    d.pos.copy(at);
    d.vel.set(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(rand(o.v[0], o.v[1]));
    d.life = d.max = rand(o.life[0], o.life[1]);
    d.s = rand(o.size[0], o.size[1]);
    d.g = o.g;
    d.drag = o.drag;
    d.grow = o.grow;
    partMesh.setColorAt(id, _c.set(o.colors[(Math.random() * o.colors.length) | 0]));
  }
  partMesh.instanceColor.needsUpdate = true;
}
function updateParticles(dt) {
  let any = false;
  for (let i = 0; i < PMAX; i++) {
    const d = PD[i];
    if (d.life <= 0) continue;
    any = true;
    d.life -= dt;
    if (d.life <= 0) {
      _ps.setScalar(0);
    } else {
      const t = 1 - d.life / d.max;
      d.vel.multiplyScalar(Math.pow(d.drag, dt * 60));
      d.vel.y -= GRAVITY * d.g * dt;
      d.pos.addScaledVector(d.vel, dt);
      _ps.setScalar(d.s * (1 + d.grow * t) * (1 - t * 0.6));
    }
    partMesh.setMatrixAt(i, _pm.compose(d.pos, _pq, _ps));
  }
  if (any) partMesh.instanceMatrix.needsUpdate = true;
}

// 화면 흔들림
const SHAKE_TIME = 0.5;
let shakeAmp = 0, shakeEnd = 0;
const shakeOff = new THREE.Vector3();
function shake(a) {
  shakeAmp = Math.max(shakeAmp * Math.max(0, (shakeEnd - T) / SHAKE_TIME), a);
  shakeEnd = T + SHAKE_TIME;
}

// 소리 (파일 없이 소음을 만들어 들려줌)
let AC = null, noiseBuf = null, lastCrack = 0;
function audioInit() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 1.5, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (err) {
    AC = null;
  }
}
const SOUNDS = {
  shot: { type: 'highpass', f0: 1400, f1: 600, dur: 0.1, vol: 0.5 },
  rifle: { type: 'bandpass', f0: 900, f1: 300, dur: 0.22, vol: 0.9 },
  boom: { type: 'lowpass', f0: 500, f1: 60, dur: 1.2, vol: 1.2 },
  crack: { type: 'bandpass', f0: 2200, f1: 900, dur: 0.18, vol: 0.35 },
  rumble: { type: 'lowpass', f0: 160, f1: 40, dur: 3.5, vol: 0.9 },
};
function sound(name, vol = 1) {
  if (!AC) return;
  const s = SOUNDS[name], t = AC.currentTime;
  const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = noiseBuf;
  f.type = s.type;
  f.frequency.setValueAtTime(s.f0, t);
  f.frequency.exponentialRampToValueAtTime(s.f1, t + s.dur);
  g.gain.setValueAtTime(s.vol * vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + s.dur);
  src.connect(f);
  f.connect(g);
  g.connect(AC.destination);
  src.start(t, Math.random() * 0.5, s.dur);
}
function crack() {
  const now = performance.now();
  if (now - lastCrack < 60) return;   // 너무 자주 나지 않게
  lastCrack = now;
  sound('crack', 0.6);
}

function burst(at, size, power) {     // 맞았을 때 터지는 연출
  const big = Math.max(size.x, size.y, size.z);
  flash(at, 0xffe2a0, 1 + big * 0.5, 0.15);
  shake(0.12);
  crack();
}

// ----------------------------------------------------------------------------
// [10] 재난 4종 — 1 지진 · 2 블랙홀 · 3 오존층 파괴 · 4 화산폭발
//  숫자키로 재난을 고르고, 좌클릭한 땅 위 지점에서 발생 (Space도 같은 지점)
// ----------------------------------------------------------------------------
const DISASTERS = ['지진', '블랙홀', '오존층 파괴', '화산폭발', '허리케인'];
let disaster = 0;
const events = [];                           // 진행 중인 재난 (매 프레임 갱신, true를 돌려주면 끝)
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const planeUp = new THREE.Plane(V(0, 1, 0), 0);
const rockMat = std(0x4a3a33, 0.95);
const GOO = { v: [1, 3], life: [0.6, 1.2], size: [0.15, 0.35], colors: ['#ffcf6b', '#ff9a3c', '#ffe49a'], g: 1.0, drag: 0.92, grow: 0 };
const LAVA = { v: [10, 28], life: [0.8, 1.8], size: [0.5, 1.2], colors: ['#ff7a1a', '#ffb13b', '#ff4d00', '#3a2a22'], g: 1.0, drag: 0.97, grow: 0.4 };

const dist3 = (q, c) => Math.hypot(q.x - c.x, q.y - c.y, q.z - c.z);
function within(c, R) {                      // 반경 안의 부술 수 있는 물체
  const out = [];
  for (const p of pieces) if (p.alive && !p.unbreak && dist3(p.body.position, c) < R) out.push(p);
  return out;
}
function groundPoint() {                     // 커서가 가리키는 땅(y=0) 위의 점
  ndc.set((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = V(0, 0, 0);
  return ray.ray.intersectPlane(planeUp, hit) ? hit : V(0, 0, 0);
}

// 지진: 화면 흔들림 없이, 가까운 건물부터 짧게(2.5초) 무너뜨림
function quake(c) {
  const R = 46, DUR = 2.5, TICK = 0.15, PER = 26;
  const list = within(c, R)
    .filter((p) => !(guardOn && p.school && Math.random() < 0.65))   // 안전장치: 학교 건물 대부분은 버팀
    .sort((a, b) => dist3(a.body.position, c) - dist3(b.body.position, c));
  let t = 0, next = 0, idx = 0;
  sound('rumble', 1);
  return (dt) => {
    t += dt;
    shake(0.35);
    if (t >= next && idx < list.length) {
      next = t + TICK;
      for (let i = 0; i < PER && idx < list.length; i++, idx++) if (list[idx].alive) makeDynamic(list[idx]);
    }
    for (const p of list) {
      if (p.alive && p.dyn) {
        const v = p.body.velocity;
        v.x += (Math.random() * 2 - 1) * 1.3;
        v.z += (Math.random() * 2 - 1) * 1.3;
        p.body.wakeUp();
      }
    }
    return t >= DUR;
  };
}

// 블랙홀: 주변 잔해가 한 점으로 빨려들었다가 3초 뒤 사방으로 터짐
function blackHole(c) {
  const R = 50, DUR = 3, MAXHOLD = 90;
  const center = V(c.x, c.y + 6, c.z);
  const list = within(c, R).slice(0, MAXHOLD);
  const core = new THREE.Mesh(new THREE.SphereGeometry(2, 56, 40), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.16, 16, 128), new THREE.MeshBasicMaterial({ color: 0xffa04a }));
  ring.rotation.x = Math.PI / 2;
  core.position.copy(center);
  ring.position.copy(center);
  scene.add(core, ring);
  for (const p of list) { p.pulled = true; makeDynamic(p); }
  sound('rumble', 0.7);
  let t = 0;
  return (dt) => {
    t += dt;
    const k = Math.min(t / DUR, 1);
    core.scale.setScalar(2 + 5 * k);
    ring.scale.setScalar((2 + 5 * k) * 2.2);
    ring.rotation.z += dt * 3;
    for (const p of list) {
      if (!p.alive || !p.dyn) continue;
      const q = p.body.position;
      const dx = center.x - q.x, dy = center.y - q.y, dz = center.z - q.z;
      const d = Math.hypot(dx, dy, dz) + 0.01;
      const sp = Math.min(70, 6 + d * 2.2) * (0.4 + k);
      p.body.velocity.set((dx / d) * sp, (dy / d) * sp, (dz / d) * sp);
    }
    if (k < 1) return false;
    scene.remove(core, ring);
    for (const p of list) {
      if (!p.alive) continue;
      p.pulled = false;
      const q = p.body.position;
      shatter(p, center, V(q.x - center.x, q.y - center.y, q.z - center.z).normalize(), 45, 0.7);
    }
    flash(center, 0xffe0a0, 16, 0.4);
    sound('boom');
    shake(0.9);
    return true;
  };
}

// 녹은 잔해: 녹아 사라진 자리에 어두운 웅덩이가 번지고, 덩어리 몇 개가 흘러내림
const MELT_MAT = new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.25, metalness: 0.1 });
const puddleGeo = new THREE.CircleGeometry(1, 18);
puddleGeo.rotateX(-Math.PI / 2);
const puddles = [];
function meltDone(p) {
  const pos = p.body.position;
  if (pos.y < 2) {                      // 땅에 닿은 것만 웅덩이를 남김
    const pud = new THREE.Mesh(
      puddleGeo,
      new THREE.MeshStandardMaterial({ color: 0x3b3322, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.9 })
    );
    pud.position.set(pos.x, 0.06, pos.z);
    pud.scale.set(0.01, 1, 0.01);
    scene.add(pud);
    puddles.push({ mesh: pud, t: 0, r: Math.max(p.size.x, p.size.z) * 0.6, life: 25 });
    if (puddles.length > 80) {
      const old = puddles.shift();
      scene.remove(old.mesh);
      old.mesh.material.dispose();
    }
  }
  for (let i = 0; i < 3; i++) {         // 녹은 덩어리는 아래로 흘러내려 아래 물체 위에 쌓임
    spawnFragment(
      { size: V(p.size.x * 0.6, p.size.y * 0.3, p.size.z * 0.6), body: { position: pos }, fragMat: MELT_MAT },
      V(pos.x, pos.y, pos.z), V(rand(-0.5, 0.5), -1, rand(-0.5, 0.5)), 2, 0.2
    );
  }
}
function updatePuddles(dt) {
  for (let i = puddles.length - 1; i >= 0; i--) {
    const u = puddles[i];
    u.t += dt;
    const s = u.r * Math.min(1, u.t / 1.2);
    u.mesh.scale.set(Math.max(0.01, s), 1, Math.max(0.01, s));
    if (u.t > u.life) {
      scene.remove(u.mesh);
      u.mesh.material.dispose();
      puddles.splice(i, 1);
    }
  }
}

// 오존층 파괴: 중심에서 바깥으로 건물과 나무가 녹아내림, 하늘이 누렇게 변함
function ozone(c) {
  const R = 58, MELT = 2.2, SPAN = 3.2;
  const list = within(c, R);
  let maxY = -1e9, minY = 1e9;
  for (const p of list) {
    maxY = Math.max(maxY, p.body.position.y);
    minY = Math.min(minY, p.body.position.y);
  }
  for (const p of list) {
    const hf = (maxY - p.body.position.y) / (maxY - minY + 0.01);   // 높은 곳일수록 먼저 녹음
    p.mT0 = (hf * 0.7 + (dist3(p.body.position, c) / R) * 0.3) * SPAN;
    p.mRound = p.round;
    p.mR = p.vis.x;
    p.mH = p.vis.y;
    p.mBottom = p.round ? p.body.position.y - p.vis.x : p.body.position.y - p.vis.y / 2;
    world.removeBody(p.body);
  }
  const prevFog = scene.fog.color.getHex();
  scene.fog.color.set(0xffc27a);
  let t = 0;
  return (dt) => {
    t += dt;
    for (const p of list) {
      if (!p.alive) continue;
      const k = Math.min(1, Math.max(0, (t - p.mT0) / MELT));
      if (k >= 1) {
        p.alive = false;
        p.vis.set(0, 0, 0);
        setMatrix(p);
        meltDone(p);
        settleFlag = true;
        continue;
      }
      if (p.mRound) {
        const s = Math.max(0.01, 1 - k);
        p.vis.set(p.mR * s, p.mR * s, p.mR * s);
        p.body.position.y = p.mBottom + p.mR * s;
      } else {
        const H = Math.max(0.01, p.mH * (1 - k));
        p.vis.y = H;
        p.body.position.y = p.mBottom + H / 2;
      }
      setMatrix(p);
      if (k > 0 && Math.random() < 0.08) emit(V(p.body.position.x, p.body.position.y + 0.5, p.body.position.z), 2, GOO);
    }
    if (t >= SPAN + MELT) {
      scene.fog.color.setHex(prevFog);
      return true;
    }
    return false;
  };
}

// 분출물(화산 덩어리): 물리 물체라서 건물에 떨어지면 건물을 부숨
const ejGeo = new THREE.SphereGeometry(1, 8, 6);
const ejMat = new THREE.MeshStandardMaterial({ color: 0x3a2620, emissive: 0xff5a1a, emissiveIntensity: 0.6, roughness: 0.7 });
const ejectas = [];
const SCHOOL_AIM = V(20, 0, -36);    // 본관 쪽 (운동장 가운데에서 북쪽)
function ejecta(from) {
  const r = rand(1.1, 2.0);
  // 높이 솟지 않고 낮게, 빠르게 날아가도록 조준 (최고점이 분출구 높이를 넘지 않음)
  let vx, vy, vz;
  if (Math.random() < 0.7) {            // 70%: 학교 벽을 향해 빠르게 날아감
    const tau = rand(0.75, 0.9);        // 도착까지 걸리는 시간 (짧을수록 빠름)
    const tx = SCHOOL_AIM.x + rand(-12, 12), ty = rand(6, 18), tz = SCHOOL_AIM.z + rand(-10, 10);
    vx = (tx - from.x) / tau;
    vy = (ty - from.y) / tau + 0.5 * GRAVITY * tau;
    vz = (tz - from.z) / tau;
  } else {                              // 30%: 사방으로 빠르게 흩뿌림 (낮게)
    vx = rand(-60, 60);
    vz = rand(-60, 60);
    vy = rand(-6, 6);
  }
  const body = new CANNON.Body({
    mass: 50,
    shape: new CANNON.Sphere(r),
    position: new CANNON.Vec3(from.x, from.y, from.z),
    linearDamping: 0.01,
  });
  body.velocity.set(vx, vy, vz);
  world.addBody(body);
  const sl = slot(ejGeo, ejMat);
  const e = {
    id: -1, kind: 'ejecta', body, im: sl.im, idx: sl.idx,
    size: V(2 * r, 2 * r, 2 * r), vis: V(r, r, r),
    alive: true, dyn: true, frag: false, frozen: false, listening: true,
    root: false, unbreak: true, pulled: false, nb: [], mk: 0, lastV: null, age: 0,
  };
  bodyPiece.set(body, e);
  body.addEventListener('collide', (ev) => onBump(e, ev));
  dyn.push(e);
  setMatrix(e);
  ejectas.push(e);
}
function updateEjecta(dt) {
  for (let i = ejectas.length - 1; i >= 0; i--) {
    const e = ejectas[i];
    e.age += dt;
    if (e.age > 14 || e.body.position.y < -3) {
      world.removeBody(e.body);
      const di = dyn.indexOf(e);
      if (di >= 0) dyn.splice(di, 1);
      e.alive = false;
      e.vis.set(0, 0, 0);
      setMatrix(e);
      ejectas.splice(i, 1);
    }
  }
}

// 화산폭발: 운동장 가운데에 솟아올라 3초 뒤 폭발, 분출물이 주변 건물을 부숨
function volcano(c) {
  const R = 36, GROW = 3, ERUPT = 8, H = 34;
  const geo = new THREE.ConeGeometry(26, H, 36);
  geo.translate(0, H / 2, 0);
  const cone = new THREE.Mesh(geo, rockMat);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff5a1a }));
  cone.position.copy(c);
  glow.position.copy(c);
  cone.castShadow = true;
  cone.receiveShadow = true;
  scene.add(cone, glow);
  let t = 0, erupted = false, lavaT = 0, ejT = 0;
  return (dt) => {
    t += dt;
    const g = Math.min(1, t / GROW), e = g * g * (3 - 2 * g), s = Math.max(0.01, e);
    cone.scale.setScalar(s);
    glow.scale.setScalar(s);
    glow.position.set(c.x, c.y + H * s, c.z);
    const top = V(c.x, c.y + H, c.z);
    if (!erupted && t >= GROW) {
      erupted = true;
      sound('boom');
      flash(top, 0xffa040, 30, 0.6);
      for (const p of within(c, R).slice(0, 120)) {
        const q = p.body.position;
        shatter(p, c, V(q.x - c.x, Math.max(0, q.y - c.y) + 6, q.z - c.z).normalize(), 50, 0.7);
      }
      for (let i = 0; i < 8; i++) ejecta(top);
    }
    shake(erupted ? 0.6 : 0.3);
    if (erupted) {
      lavaT -= dt;
      ejT -= dt;
      if (lavaT <= 0) { lavaT = 0.08; emit(top, 14, LAVA); }
      if (ejT <= 0) { ejT = 0.2; ejecta(top); }
    }
    if (t < GROW + ERUPT) return false;
    scene.remove(cone, glow);
    geo.dispose();
    return true;
  };
}

// 허리케인: 커서 방향으로 천천히 이동하며 주변 물체를 빨아들여 소용돌이에 태우고 휩쓸어 감
function hurricane(c0, dir) {
  const DUR = 8, SPEED = 16, PULL_R = 20, MAXHELD = 90;
  const perp = V(-dir.z, 0, dir.x);     // 진행 방향에 수직 (지그재그의 옆 흔들림 방향)
  const pos = V(c0.x, 0, c0.z);
  const vis = new THREE.Mesh(
    new THREE.CylinderGeometry(12, 3, 50, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xe6edf2, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
  );
  vis.position.set(pos.x, 25, pos.z);
  scene.add(vis);
  const held = new Set();
  let t = 0, along = 0;
  return (dt) => {
    t += dt;
    along += SPEED * dt;
    const side = Math.sin(t * 1.6) * 18;   // 좌우로 번갈아 꺾이며 전진
    pos.set(c0.x + dir.x * along + perp.x * side, 0, c0.z + dir.z * along + perp.z * side);
    vis.position.set(pos.x, 25, pos.z);
    vis.rotation.y += dt * 5;
    const eye = V(pos.x, 12, pos.z);
    if (held.size < MAXHELD) {
      for (const p of within(eye, PULL_R)) {
        if (held.size >= MAXHELD) break;
        if (!held.has(p)) { held.add(p); makeDynamic(p); }
      }
    }
    for (const p of held) {
      if (!p.alive || !p.dyn) { held.delete(p); continue; }
      const q = p.body.position;
      const dx = pos.x - q.x, dz = pos.z - q.z;
      const d = Math.hypot(dx, dz) + 0.01;
      if (d > PULL_R * 1.4) { held.delete(p); continue; }   // 휩쓸려 나가면 관성으로 날아감
      const swirl = 24, pull = Math.min(24, 6 + d * 0.8);
      p.body.velocity.set(
        (-dz / d) * swirl + (dx / d) * pull + dir.x * SPEED,
        8 + Math.max(0, 1 - d / PULL_R) * 10,
        (dx / d) * swirl + (dz / d) * pull + dir.z * SPEED
      );
      p.body.wakeUp();
    }
    if (t < DUR) return false;
    scene.remove(vis);
    vis.geometry.dispose();
    held.clear();
    return true;
  };
}

const FIELD_C = V(25, 0, 38);          // 운동장 가운데 (화산 고정 위치)
function trigger(pt) {
  if (events.length >= 2) return;      // 재난이 겹쳐 렉 나는 것 방지
  if (disaster === 3) events.push(volcano(FIELD_C));
  else if (disaster === 4) events.push(hurricane(pt, V(pt.x - camera.position.x, 0, pt.z - camera.position.z).normalize()));
  else events.push([quake, blackHole, ozone][disaster](pt));
}
function updateEvents(dt) {
  for (let i = events.length - 1; i >= 0; i--) if (events[i](dt)) events.splice(i, 1);
}

// ----------------------------------------------------------------------------
// 옵션: 6 강철 운암고 (내구도 10배, 재질 강철) · 7 지진 안전장치 (기초 받침대)
const STEEL_HP = 10;
const STEEL_MAT = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 0.85, roughness: 0.28 });
const PLINTH_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.9 });
let steelOn = false, guardOn = false;
const guardGroup = new THREE.Group();
for (const [x0, x1, z0, z1] of [[-20, 60, -32, -17], [-20, 20, -47, -32], [-40, -20, -37, -17], [-94, -50, -36, -21]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 3, 1.2, z1 - z0 + 3), PLINTH_MAT);
  m.position.set((x0 + x1) / 2, 0.6, (z0 + z1) / 2);
  m.castShadow = true;
  m.receiveShadow = true;
  guardGroup.add(m);
}
guardGroup.visible = false;
scene.add(guardGroup);

function setSteel(on) {
  steelOn = on;
  for (const p of pieces) if (p.school) {
    p.hp = on ? STEEL_HP : 1;
    p.im.material = on ? STEEL_MAT : p.origMat;
  }
}
function setGuard(on) {
  guardOn = on;
  guardGroup.visible = on;
}

// ----------------------------------------------------------------------------
// [11] 입력 · 재난 선택 · 안내 · 메인 루프
// ----------------------------------------------------------------------------
const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
let T = 0;

const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;left:14px;bottom:14px;display:flex;gap:8px;' +
  'font:600 14px/1 "Malgun Gothic",sans-serif;user-select:none;pointer-events:none;';
const hint = document.createElement('div');
hint.style.cssText = 'position:fixed;left:14px;top:12px;padding:8px 12px;border-radius:8px;' +
  'background:rgba(0,0,0,.4);color:#fff;font:13px/1.6 "Malgun Gothic",sans-serif;user-select:none;pointer-events:none;';
hint.textContent = '좌클릭: 커서 위치에 재난 발생 | 1 지진 · 2 블랙홀 · 3 오존층 파괴 · 4 화산폭발(운동장 고정) · 5 허리케인 | ' +
  '6 강철 운암고 · 7 지진 안전장치 | 휠 드래그: 회전 | 우클릭 드래그: 이동 | R: 초기화';
document.body.append(hud, hint);

function renderHud() {
  hud.innerHTML = '';
  DISASTERS.forEach((name, i) => {
    const on = i === disaster;
    const d = document.createElement('div');
    d.textContent = `${i + 1} ${name}`;
    d.style.cssText = `padding:8px 12px;border-radius:8px;color:${on ? '#222' : '#fff'};` +
      `background:${on ? 'rgba(255,190,60,.95)' : 'rgba(0,0,0,.45)'};`;
    hud.appendChild(d);
  });
  [['6 강철 운암고', steelOn], ['7 지진 안전장치', guardOn]].forEach(([name, on]) => {
    const d = document.createElement('div');
    d.textContent = `${name} ${on ? 'ON' : 'OFF'}`;
    d.style.cssText = `padding:8px 12px;border-radius:8px;color:${on ? '#222' : '#fff'};` +
      `background:${on ? 'rgba(120,220,255,.95)' : 'rgba(0,0,0,.45)'};`;
    hud.appendChild(d);
  });
}

addEventListener('pointermove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;                // 휠·우클릭은 카메라 조작
  audioInit();
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  trigger(groundPoint());
});
addEventListener('keydown', (e) => {
  if (/^Digit[1-5]$/.test(e.code)) {
    disaster = Number(e.code.slice(-1)) - 1;
    renderHud();
  } else if (e.code === 'Digit6') {
    setSteel(!steelOn);
    renderHud();
  } else if (e.code === 'Digit7') {
    setGuard(!guardOn);
    renderHud();
  } else if (e.code === 'Space') {
    e.preventDefault();
    audioInit();
    if (!e.repeat) trigger(groundPoint());
  } else if (e.code === 'KeyR') {
    location.reload();
  }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  T += dt;

  for (const p of dyn) p.lastV = p.body.velocity.clone();
  world.step(STEP, dt, 4);
  processQueue();
  updateEvents(dt);
  updateEjecta(dt);
  updatePuddles(dt);
  if (settleFlag) {
    settleFlag = false;
    settle();
  }
  capDynamics();

  for (const p of dyn) setMatrix(p);
  for (const im of dirtyChunks) im.instanceMatrix.needsUpdate = true;
  dirtyChunks.clear();
  updateFlashes(dt);
  updateParticles(dt);

  // 카메라 흔들림 (0.5초 동안 점점 약해짐)
  camera.position.sub(shakeOff);
  controls.update();
  const left = Math.max(0, (shakeEnd - T) / SHAKE_TIME);
  const k = shakeAmp * left;
  shakeOff.set((Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k);
  camera.position.add(shakeOff);
  renderer.render(scene, camera);
}

buildLinks();
settle();
renderHud();
frame();
