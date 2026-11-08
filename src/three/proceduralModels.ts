import * as THREE from 'three';
import { FruitKind, FruitSpec } from '../types/game';
import { FRUIT_SPECS } from '../utils/storage';

// Cache procedural textures and shared materials so the 60fps loop never allocates textures
const rindTextureCache = new Map<FruitKind, THREE.CanvasTexture>();
const crossSectionTextureCache = new Map<FruitKind, THREE.CanvasTexture>();

export function initProceduralTextures(maxAnisotropy: number) {
  (Object.keys(FRUIT_SPECS) as FruitKind[]).forEach((kind) => {
    if (!rindTextureCache.has(kind)) {
      const tex = createRindTexture(kind);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      rindTextureCache.set(kind, tex);
    }
    if (!crossSectionTextureCache.has(kind)) {
      const tex = createCrossSectionTexture(kind);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      crossSectionTextureCache.set(kind, tex);
    }
  });
}

function createRindTexture(kind: FruitKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const spec = FRUIT_SPECS[kind];

  const baseHex = '#' + spec.rindColor.toString(16).padStart(6, '0');
  const accentHex = '#' + spec.accentColor.toString(16).padStart(6, '0');

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  if (kind === 'watermelon') {
    // Jagged dark-green and emerald vertical stripes
    ctx.fillStyle = '#064e3b';
    for (let x = 0; x < 256; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= 256; y += 16) {
        ctx.lineTo(x + Math.sin(y * 0.15) * 6, y);
      }
      for (let y = 256; y >= 0; y -= 16) {
        ctx.lineTo(x + 14 + Math.cos(y * 0.15) * 6, y);
      }
      ctx.closePath();
      ctx.fill();
    }
  } else if (kind === 'pineapple') {
    // Diamond lattice pattern
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    const step = 32;
    for (let y = -256; y < 512; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y + 256);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(256, y);
      ctx.lineTo(0, y + 256);
      ctx.stroke();
    }
    ctx.fillStyle = '#fef08a';
    for (let y = 16; y < 256; y += 32) {
      for (let x = 16; x < 256; x += 32) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === 'mango') {
    // Warm tropical blush gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#ef4444');
    grad.addColorStop(0.55, '#f97316');
    grad.addColorStop(1, '#eab308');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  } else if (kind === 'coconut') {
    // Fibrous husk striations
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 2;
    for (let i = 0; i < 140; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 14, y + 28);
      ctx.stroke();
    }
  } else if (kind === 'golden_yuzu') {
    // Shimmering citrus dimples
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#fde047');
    grad.addColorStop(0.5, '#f59e0b');
    grad.addColorStop(1, '#d97706');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 90; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 256, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Subtle organic mottling for dragonfruit / pomegranate / bomb
    ctx.fillStyle = accentHex;
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 60; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  return new THREE.CanvasTexture(canvas);
}

function createCrossSectionTexture(kind: FruitKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const spec = FRUIT_SPECS[kind];

  const cx = 128;
  const cy = 128;
  const rindHex = '#' + spec.rindColor.toString(16).padStart(6, '0');
  const fleshHex = '#' + spec.fleshColor.toString(16).padStart(6, '0');
  const seedHex = '#' + spec.seedColor.toString(16).padStart(6, '0');

  // Outer rind border
  ctx.fillStyle = rindHex;
  ctx.fillRect(0, 0, 256, 256);

  // White/cream pith ring
  ctx.beginPath();
  ctx.arc(cx, cy, 114, 0, Math.PI * 2);
  ctx.fillStyle = kind === 'coconut' ? '#78350f' : '#fef9c3';
  ctx.fill();

  // Inner juicy flesh
  ctx.beginPath();
  ctx.arc(cx, cy, 104, 0, Math.PI * 2);
  ctx.fillStyle = fleshHex;
  ctx.fill();

  if (kind === 'watermelon') {
    // Radial seed ring
    ctx.fillStyle = seedHex;
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const r = i % 2 === 0 ? 64 : 44;
      const sx = cx + Math.cos(angle) * r;
      const sy = cy + Math.sin(angle) * r;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (kind === 'pineapple' || kind === 'golden_yuzu') {
    // Citrus / Bromeliad radial segments
    ctx.strokeStyle = kind === 'golden_yuzu' ? '#ca8a04' : '#eab308';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * 100, cy + Math.sin(angle) * 100);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#fef08a';
    ctx.fill();
  } else if (kind === 'dragonfruit') {
    // White flesh speckled with crisp black sesame-like seeds
    ctx.fillStyle = '#0f172a';
    for (let i = 0; i < 75; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 88;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'pomegranate') {
    // Ruby aril clusters separated by cream membranes
    ctx.fillStyle = '#be123c';
    for (let c = 0; c < 6; c++) {
      const a = (c / 6) * Math.PI * 2;
      const gx = cx + Math.cos(a) * 52;
      const gy = cy + Math.sin(a) * 52;
      ctx.beginPath();
      ctx.arc(gx, gy, 30, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe4e6';
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const r = 35 + (i % 3) * 20;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'coconut') {
    // Hollow water center inside thick white coconut meat
    ctx.beginPath();
    ctx.arc(cx, cy, 58, 0, Math.PI * 2);
    ctx.fillStyle = '#cbd5e1';
    ctx.fill();
  } else if (kind === 'mango') {
    // Fibrous golden seed core
    ctx.beginPath();
    ctx.ellipse(cx, cy, 38, 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fde047';
    ctx.fill();
  }

  return new THREE.CanvasTexture(canvas);
}

/**
 * Builds a composite 3–12 part procedural 3D model (`THREE.Group`) for each fruit or Oni bomb.
 * Never uses a single primitive — combines primary body, calyx/collar, stem/leaves, and surface accents
 * with varied roughness and metalness.
 */
export function buildWholeFruitModel(kind: FruitKind): THREE.Group {
  const spec: FruitSpec = FRUIT_SPECS[kind];
  const group = new THREE.Group();
  group.name = `fruit_${kind}`;

  if (kind === 'bomb_oni') {
    return buildOniBombModel(spec);
  }

  const rindTex = rindTextureCache.get(kind);
  const r = spec.radius;

  // Part 1: Primary Silhouette Body (sculpted proportions per fruit)
  const bodyGeo = new THREE.SphereGeometry(r, 28, 24);
  if (kind === 'watermelon') {
    bodyGeo.scale(1.18, 0.96, 0.96);
  } else if (kind === 'pineapple') {
    bodyGeo.scale(0.86, 1.22, 0.86);
  } else if (kind === 'mango') {
    bodyGeo.scale(1.15, 0.85, 0.78);
  } else if (kind === 'dragonfruit') {
    bodyGeo.scale(0.92, 1.15, 0.92);
  }

  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: rindTex,
    roughness: kind === 'coconut' ? 0.88 : kind === 'golden_yuzu' ? 0.18 : 0.35,
    metalness: kind === 'golden_yuzu' ? 0.65 : 0.05,
    clearcoat: kind === 'coconut' ? 0.0 : 0.65,
    clearcoatRoughness: 0.2,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // Part 2: Secondary Read — Top Calyx / Stem Collar (contrasting roughness >= 0.25 delta)
  const collarGeo = new THREE.TorusGeometry(r * 0.22, r * 0.06, 10, 20);
  collarGeo.rotateX(Math.PI / 2);
  const collarMat = new THREE.MeshStandardMaterial({
    color: spec.accentColor,
    roughness: 0.75,
    metalness: 0.1,
  });
  const collarMesh = new THREE.Mesh(collarGeo, collarMat);
  collarMesh.position.y = r * (kind === 'pineapple' ? 1.12 : 0.92);
  group.add(collarMesh);

  // Part 3..N: Fruit-Specific Multi-Part Crowns, Fins, or Stems
  if (kind === 'pineapple') {
    // 7-part layered leafy bromeliad crown
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x15803d,
      roughness: 0.45,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const leafGeo = new THREE.ConeGeometry(r * 0.22, r * 0.75, 5);
      leafGeo.translate(0, r * 0.35, 0);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(Math.cos(angle) * r * 0.12, r * 1.05, Math.sin(angle) * r * 0.12);
      leaf.rotation.y = -angle;
      leaf.rotation.z = 0.42 + (i % 2) * 0.18;
      leaf.castShadow = true;
      group.add(leaf);
    }
  } else if (kind === 'dragonfruit') {
    // 6 Lime-tipped pitaya scales wrapping the body
    const scaleMat = new THREE.MeshStandardMaterial({
      color: 0x84cc16,
      roughness: 0.55,
      metalness: 0.05,
    });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const finGeo = new THREE.ConeGeometry(r * 0.14, r * 0.42, 4);
      const fin = new THREE.Mesh(finGeo, scaleMat);
      fin.position.set(
        Math.cos(a) * r * 0.78,
        (i % 2 === 0 ? 0.2 : -0.2) * r,
        Math.sin(a) * r * 0.78
      );
      fin.rotation.z = -Math.cos(a) * 0.55;
      fin.rotation.x = Math.sin(a) * 0.55;
      group.add(fin);
    }
  } else if (kind === 'pomegranate') {
    // 4-pointed royal calyx crown
    const crownMat = new THREE.MeshStandardMaterial({
      color: 0x881337,
      roughness: 0.68,
      metalness: 0.12,
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const spire = new THREE.Mesh(new THREE.ConeGeometry(r * 0.09, r * 0.28, 5), crownMat);
      spire.position.set(Math.cos(a) * r * 0.16, r * 1.02, Math.sin(a) * r * 0.16);
      spire.rotation.z = -Math.cos(a) * 0.3;
      spire.rotation.x = Math.sin(a) * 0.3;
      group.add(spire);
    }
  } else if (kind === 'golden_yuzu') {
    // Celestial orbital ring + topjade leaf
    const haloGeo = new THREE.TorusGeometry(r * 1.28, 0.035, 12, 36);
    const haloMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.9,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = Math.PI / 3;
    group.add(halo);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, r * 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0x713f12, roughness: 0.8 })
    );
    stem.position.y = r * 1.02;
    group.add(stem);
  } else {
    // Curved botanical stem + accent leaf for Watermelon, Mango, Coconut
    const stemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, r * 0.85, 0),
      new THREE.Vector3(0.06, r * 1.05, 0.02),
      new THREE.Vector3(0.16, r * 1.16, 0.06),
    ]);
    const stemGeo = new THREE.TubeGeometry(stemCurve, 8, 0.045, 6, false);
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x3f6212,
      roughness: 0.82,
      metalness: 0.05,
    });
    const stemMesh = new THREE.Mesh(stemGeo, stemMat);
    group.add(stemMesh);

    // Bottom umbilicus button accent
    const baseCap = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.12, r * 0.08, 0.06, 10),
      stemMat
    );
    baseCap.position.y = -r * 0.92;
    group.add(baseCap);
  }

  return group;
}

/**
 * Builds a 7-part procedural Oni Fuse Bomb (`THREE.Group`) with iron hull, brass collar,
 * lacquer danger band, equatorial spikes, curved rope fuse, and sizzling spark core.
 */
function buildOniBombModel(spec: FruitSpec): THREE.Group {
  const group = new THREE.Group();
  const r = spec.radius;

  // 1. Cast-iron sphere hull
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.32,
    metalness: 0.88,
  });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 24), hullMat);
  hull.castShadow = true;
  group.add(hull);

  // 2. Crimson danger lacquer belly ring
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0x991b1b,
    emissiveIntensity: 0.45,
    roughness: 0.55,
    metalness: 0.2,
  });
  const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.99, 0.055, 10, 32), bandMat);
  band.rotation.x = Math.PI / 2;
  group.add(band);

  // 3. Brushed brass fuse nozzle collar
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.18,
    metalness: 0.92,
  });
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.24, r * 0.3, r * 0.26, 16),
    brassMat
  );
  collar.position.y = r * 0.92;
  group.add(collar);

  // 4. 6 Equatorial iron spikes
  const spikeGeo = new THREE.ConeGeometry(r * 0.11, r * 0.32, 8);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(spikeGeo, brassMat);
    spike.position.set(Math.cos(angle) * r * 0.96, 0, Math.sin(angle) * r * 0.96);
    spike.rotation.z = -Math.cos(angle) * (Math.PI / 2);
    spike.rotation.x = Math.sin(angle) * (Math.PI / 2);
    group.add(spike);
  }

  // 5. Curved braided fuse cord
  const fuseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, r * 1.0, 0),
    new THREE.Vector3(0.14, r * 1.28, 0.06),
    new THREE.Vector3(0.28, r * 1.42, -0.08),
  ]);
  const fuseGeo = new THREE.TubeGeometry(fuseCurve, 10, 0.045, 8, false);
  const fuseMat = new THREE.MeshStandardMaterial({
    color: 0xd6d3d1,
    roughness: 0.9,
    metalness: 0.0,
  });
  const fuse = new THREE.Mesh(fuseGeo, fuseMat);
  group.add(fuse);

  // 6. Sizzling spark core at fuse tip
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
  });
  const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), sparkMat);
  spark.position.set(0.28, r * 1.42, -0.08);
  spark.name = 'bomb_spark';
  group.add(spark);

  return group;
}

/**
 * Builds a composite 4-part Sliced Half Fruit (`THREE.Group`) with outer rind dome,
 * pith bevel collar, glossy textured cross-section interior face, and core/seed relief.
 */
export function buildSlicedFruitHalf(kind: FruitKind, isTopHalf: boolean): THREE.Group {
  const spec = FRUIT_SPECS[kind];
  const group = new THREE.Group();
  const r = spec.radius;

  const rindTex = rindTextureCache.get(kind);
  const crossTex = crossSectionTextureCache.get(kind);

  // 1. Outer Rind Hemisphere
  const hemiGeo = new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const rindMat = new THREE.MeshPhysicalMaterial({
    map: rindTex,
    roughness: kind === 'coconut' ? 0.85 : 0.35,
    metalness: kind === 'golden_yuzu' ? 0.6 : 0.05,
    clearcoat: 0.5,
  });
  const hemiMesh = new THREE.Mesh(hemiGeo, rindMat);
  hemiMesh.castShadow = true;
  group.add(hemiMesh);

  // 2. Flat Cross-Section Cut Face at Y=0 looking down (-Y)
  const capGeo = new THREE.CircleGeometry(r * 0.99, 24);
  capGeo.rotateX(Math.PI / 2);
  const capMat = new THREE.MeshPhysicalMaterial({
    map: crossTex,
    roughness: 0.15,
    metalness: 0.02,
    clearcoat: 0.95,
    clearcoatRoughness: 0.08,
    side: THREE.DoubleSide,
  });
  const capMesh = new THREE.Mesh(capGeo, capMat);
  capMesh.position.y = 0.01;
  group.add(capMesh);

  // 3. Pith Bevel Rim Collar
  const rimGeo = new THREE.TorusGeometry(r * 0.97, r * 0.045, 8, 24);
  rimGeo.rotateX(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: kind === 'coconut' ? 0x78350f : 0xfef9c3,
    roughness: 0.65,
    metalness: 0.05,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  group.add(rimMesh);

  // 4. Top-half Crown / Stem detail so the top half carries the botanical crown
  if (isTopHalf) {
    const crownGeo = new THREE.ConeGeometry(r * 0.18, r * 0.45, 6);
    const crownMat = new THREE.MeshStandardMaterial({
      color: spec.accentColor,
      roughness: 0.55,
    });
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.y = r * 0.98;
    group.add(crown);
  }

  return group;
}

export interface DojoEnvironmentController {
  group: THREE.Group;
  update: (nowSec: number, dt: number, tempoLevel: number) => void;
}

/**
 * Builds the Moonlit Mount Fuji & Vermilion Torii Ninja Sanctuary environment:
 * - Panoramic Harvest Moon, Starfield & Snow-Capped Mt. Fuji horizon mural (visible on mobile & desktop)
 * - Center-framed 11-part Vermilion Torii Sanctuary Gate with double crossbeams & hanging warm paper lanterns
 * - Backlit Shoji lattice dojo screens & engraved cypress stage deck with luminous golden Dojo crest
 * - InstancedMesh Bamboo Grove (>40 stalks with per-instance scale & tint variation)
 * - Animated InstancedMesh of 48 floating Sakura petals & golden spirit embers that accelerate with session Tempo
 */
export function buildDojoEnvironment(
  scene: THREE.Scene,
  maxAnisotropy: number
): DojoEnvironmentController {
  const envGroup = new THREE.Group();
  const groundY = -5.4;

  // 1. High-Res Panoramic Moonlit Mt. Fuji & Starry Night Sky Mural (fog: false so it stays crisp and vibrant)
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 1024;
  skyCanvas.height = 512;
  const sCtx = skyCanvas.getContext('2d')!;

  const skyGrad = sCtx.createLinearGradient(0, 0, 0, 512);
  skyGrad.addColorStop(0.0, '#050811');
  skyGrad.addColorStop(0.38, '#0f172a');
  skyGrad.addColorStop(0.72, '#1e1b4b');
  skyGrad.addColorStop(0.92, '#3b1d38');
  skyGrad.addColorStop(1.0, '#0c0f17');
  sCtx.fillStyle = skyGrad;
  sCtx.fillRect(0, 0, 1024, 512);

  // Crisp twinkling starfield in upper sky
  for (let i = 0; i < 160; i++) {
    const sx = (Math.sin(i * 127.1) * 0.5 + 0.5) * 1024;
    const sy = (Math.cos(i * 311.7) * 0.5 + 0.5) * 310;
    const sr = 0.6 + (i % 3) * 0.65;
    sCtx.fillStyle =
      i % 7 === 0
        ? 'rgba(254, 240, 138, 0.9)'
        : i % 5 === 0
        ? 'rgba(186, 230, 253, 0.85)'
        : 'rgba(248, 250, 252, 0.65)';
    sCtx.beginPath();
    sCtx.arc(sx, sy, sr, 0, Math.PI * 2);
    sCtx.fill();
  }

  // Radiant Harvest Moon in upper-center (x = 512, y = 148) so it frames both mobile portrait & desktop
  const moonX = 512;
  const moonY = 148;
  const outerHalo = sCtx.createRadialGradient(moonX, moonY, 30, moonX, moonY, 195);
  outerHalo.addColorStop(0, 'rgba(254, 243, 199, 0.45)');
  outerHalo.addColorStop(0.45, 'rgba(245, 158, 11, 0.16)');
  outerHalo.addColorStop(1, 'rgba(245, 158, 11, 0)');
  sCtx.fillStyle = outerHalo;
  sCtx.beginPath();
  sCtx.arc(moonX, moonY, 195, 0, Math.PI * 2);
  sCtx.fill();

  // Moon disc
  const moonGrad = sCtx.createRadialGradient(moonX - 14, moonY - 14, 8, moonX, moonY, 58);
  moonGrad.addColorStop(0, '#fffbeb');
  moonGrad.addColorStop(0.7, '#fef08a');
  moonGrad.addColorStop(1, '#f59e0b');
  sCtx.fillStyle = moonGrad;
  sCtx.beginPath();
  sCtx.arc(moonX, moonY, 56, 0, Math.PI * 2);
  sCtx.fill();

  // Subtle lunar maria texture on moon disc
  sCtx.fillStyle = 'rgba(217, 119, 6, 0.14)';
  sCtx.beginPath();
  sCtx.arc(moonX + 16, moonY - 8, 14, 0, Math.PI * 2);
  sCtx.arc(moonX - 18, moonY + 12, 19, 0, Math.PI * 2);
  sCtx.arc(moonX + 6, moonY + 22, 10, 0, Math.PI * 2);
  sCtx.fill();

  // Distant Mount Fuji Silhouette with Moonlit Snow Cap
  sCtx.beginPath();
  sCtx.moveTo(140, 440);
  sCtx.quadraticCurveTo(370, 390, 468, 232);
  sCtx.lineTo(556, 232);
  sCtx.quadraticCurveTo(654, 390, 884, 440);
  sCtx.closePath();
  const fujiGrad = sCtx.createLinearGradient(512, 230, 512, 440);
  fujiGrad.addColorStop(0, '#1e293b');
  fujiGrad.addColorStop(0.45, '#0f172a');
  fujiGrad.addColorStop(1, '#090d16');
  sCtx.fillStyle = fujiGrad;
  sCtx.fill();

  // Fuji Snow Cap Ridges
  sCtx.beginPath();
  sCtx.moveTo(468, 232);
  sCtx.lineTo(556, 232);
  sCtx.quadraticCurveTo(582, 276, 604, 304);
  sCtx.lineTo(568, 286);
  sCtx.lineTo(542, 312);
  sCtx.lineTo(512, 284);
  sCtx.lineTo(484, 312);
  sCtx.lineTo(458, 286);
  sCtx.lineTo(420, 304);
  sCtx.quadraticCurveTo(442, 276, 468, 232);
  sCtx.closePath();
  const snowGrad = sCtx.createLinearGradient(512, 232, 512, 312);
  snowGrad.addColorStop(0, 'rgba(254, 249, 195, 0.85)');
  snowGrad.addColorStop(1, 'rgba(148, 163, 184, 0.15)');
  sCtx.fillStyle = snowGrad;
  sCtx.fill();

  // Layered Mountain Ridges & Misty Foothills on Left & Right
  sCtx.fillStyle = '#0b1120';
  sCtx.beginPath();
  sCtx.moveTo(0, 460);
  sCtx.lineTo(0, 340);
  sCtx.quadraticCurveTo(130, 290, 260, 365);
  sCtx.quadraticCurveTo(390, 410, 512, 395);
  sCtx.quadraticCurveTo(660, 410, 780, 350);
  sCtx.quadraticCurveTo(910, 285, 1024, 345);
  sCtx.lineTo(1024, 460);
  sCtx.closePath();
  sCtx.fill();

  // Soft horizon mist band
  const mistGrad = sCtx.createLinearGradient(0, 360, 0, 480);
  mistGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
  mistGrad.addColorStop(0.5, 'rgba(244, 63, 94, 0.11)');
  mistGrad.addColorStop(1, 'rgba(12, 15, 23, 0.95)');
  sCtx.fillStyle = mistGrad;
  sCtx.fillRect(0, 360, 1024, 152);

  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.anisotropy = maxAnisotropy;

  const skyBackdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 27),
    new THREE.MeshBasicMaterial({
      map: skyTex,
      fog: false,
      depthWrite: false,
    })
  );
  skyBackdrop.position.set(0, 2.5, -17.5);
  envGroup.add(skyBackdrop);

  // 2. Engraved Cypress Wood & Golden Seal Stage Floor Texture
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 512;
  boardCanvas.height = 512;
  const bCtx = boardCanvas.getContext('2d')!;
  const grad = bCtx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.5, '#1e293b');
  grad.addColorStop(1, '#0c0f17');
  bCtx.fillStyle = grad;
  bCtx.fillRect(0, 0, 512, 512);

  bCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  bCtx.lineWidth = 2;
  for (let x = 0; x <= 512; x += 48) {
    bCtx.beginPath();
    bCtx.moveTo(x, 0);
    bCtx.lineTo(x, 512);
    bCtx.stroke();
  }
  for (let y = 0; y <= 512; y += 64) {
    bCtx.beginPath();
    bCtx.moveTo(0, y);
    bCtx.lineTo(512, y);
    bCtx.stroke();
  }

  // Ornate Golden Dojo Medallion on Stage Floor
  bCtx.strokeStyle = 'rgba(245, 158, 11, 0.28)';
  bCtx.lineWidth = 5;
  bCtx.beginPath();
  bCtx.arc(256, 256, 150, 0, Math.PI * 2);
  bCtx.stroke();

  bCtx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
  bCtx.lineWidth = 3;
  bCtx.beginPath();
  bCtx.arc(256, 256, 118, 0, Math.PI * 2);
  bCtx.stroke();

  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = maxAnisotropy;

  // Ground Courtyard Plane
  const groundGeo = new THREE.PlaneGeometry(90, 60);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x090d16,
    roughness: 0.85,
    metalness: 0.1,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = groundY;
  ground.receiveShadow = true;
  envGroup.add(ground);

  // Raised Timber Stage Deck
  const deckGeo = new THREE.BoxGeometry(26, 0.32, 12);
  const deckMat = new THREE.MeshStandardMaterial({
    map: boardTex,
    roughness: 0.5,
    metalness: 0.18,
  });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.set(0, groundY + 0.16, -4.2);
  deck.receiveShadow = true;
  envGroup.add(deck);

  // Golden Lacquer Front Stage Border Trim
  const stageTrim = new THREE.Mesh(
    new THREE.BoxGeometry(26, 0.1, 0.18),
    new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.25,
      metalness: 0.8,
    })
  );
  stageTrim.position.set(0, groundY + 0.33, 1.75);
  envGroup.add(stageTrim);

  // Soft Radial Contact Shadow Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shCtx = shadowCanvas.getContext('2d')!;
  const radGrad = shCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  radGrad.addColorStop(0, 'rgba(0,0,0,0.68)');
  radGrad.addColorStop(1, 'rgba(0,0,0,0)');
  shCtx.fillStyle = radGrad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadowTex = new THREE.CanvasTexture(shadowCanvas);

  // 3. Center-Framed Grand Vermilion Torii Sanctuary Gate (x = ±4.15, z = -7.6)
  // Positioned so both pillars, crossbeams, and glowing lanterns are visible on mobile & desktop!
  const toriiGroup = new THREE.Group();
  toriiGroup.position.set(0, groundY + 0.32, -7.6);

  const vermilionMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    roughness: 0.36,
    metalness: 0.15,
  });
  const darkRoofMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.5,
    metalness: 0.35,
  });
  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.22,
    metalness: 0.88,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.88,
    metalness: 0.05,
  });

  const lanternMeshes: THREE.Group[] = [];
  const lanternCoreMaterials: THREE.MeshStandardMaterial[] = [];

  [-4.15, 4.15].forEach((xPos) => {
    // Contact shadow
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 2.8),
      new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.6,
      })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.set(xPos, 0.02, 0);
    toriiGroup.add(shadowPlane);

    // Stone Plinth Base
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.75, 0.7, 16), stoneMat);
    plinth.position.set(xPos, 0.35, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    toriiGroup.add(plinth);

    // Main Vermilion Pillar
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.46, 9.2, 18),
      vermilionMat
    );
    pillar.position.set(xPos, 4.9, 0);
    pillar.castShadow = true;
    toriiGroup.add(pillar);

    // Gold Ring Collar
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.32, 18),
      goldTrimMat
    );
    collar.position.set(xPos, 7.6, 0);
    toriiGroup.add(collar);

    // Hanging Paper Lantern Assembly suspended inside the Torii arch
    const lanternGroup = new THREE.Group();
    const lanternX = xPos < 0 ? xPos + 1.15 : xPos - 1.15;
    lanternGroup.position.set(lanternX, 7.55, 0.35);

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8),
      darkRoofMat
    );
    cord.position.y = -0.35;
    lanternGroup.add(cord);

    const lanternCoreMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.6,
      roughness: 0.25,
    });
    lanternCoreMaterials.push(lanternCoreMat);

    const lanternBody = new THREE.Mesh(
      new THREE.SphereGeometry(0.44, 16, 14),
      lanternCoreMat
    );
    lanternBody.scale.set(0.88, 1.25, 0.88);
    lanternBody.position.y = -1.1;
    lanternGroup.add(lanternBody);

    const topRim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.12, 14),
      darkRoofMat
    );
    topRim.position.y = -0.58;
    const botRim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.26, 0.12, 14),
      darkRoofMat
    );
    botRim.position.y = -1.62;
    lanternGroup.add(topRim, botRim);

    lanternMeshes.push(lanternGroup);
    toriiGroup.add(lanternGroup);
  });

  // Lower Nuki Tie-Beam spanning across both pillars
  const nukiBeam = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.42, 0.55), vermilionMat);
  nukiBeam.position.set(0, 7.6, 0);
  nukiBeam.castShadow = true;
  toriiGroup.add(nukiBeam);

  // Upper Kasagi Vermilion Crossbeam + Dark Swept Roof Cap
  const kasagiBeam = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.52, 0.78), vermilionMat);
  kasagiBeam.position.set(0, 9.25, 0);
  kasagiBeam.castShadow = true;
  toriiGroup.add(kasagiBeam);

  const kasagiCap = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.28, 1.05), darkRoofMat);
  kasagiCap.position.set(0, 9.62, 0);
  toriiGroup.add(kasagiCap);

  // Upturned Pagoda Wing Tips on Kasagi Roof
  [-6.2, 6.2].forEach((wx) => {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.26, 1.08), darkRoofMat);
    wing.position.set(wx, 9.75, 0);
    wing.rotation.z = wx < 0 ? -0.22 : 0.22;
    toriiGroup.add(wing);
  });

  // Central Gakuzuka Strut & Gold Sanctuary Plaque
  const centerStrut = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.65, 0.48), vermilionMat);
  centerStrut.position.set(0, 8.42, 0);
  toriiGroup.add(centerStrut);

  const goldPlaque = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.15, 0.56), goldTrimMat);
  goldPlaque.position.set(0, 8.42, 0.04);
  toriiGroup.add(goldPlaque);

  envGroup.add(toriiGroup);

  // 4. Flanking Warm Backlit Shoji Lattice Dojo Screens (x = ±7.8, z = -8.4)
  const shojiCanvas = document.createElement('canvas');
  shojiCanvas.width = 256;
  shojiCanvas.height = 512;
  const shojiCtx = shojiCanvas.getContext('2d')!;
  const shojiGrad = shojiCtx.createLinearGradient(0, 0, 0, 512);
  shojiGrad.addColorStop(0, '#451a03');
  shojiGrad.addColorStop(0.5, '#b45309');
  shojiGrad.addColorStop(1, '#451a03');
  shojiCtx.fillStyle = shojiGrad;
  shojiCtx.fillRect(0, 0, 256, 512);

  shojiCtx.strokeStyle = '#1e293b';
  shojiCtx.lineWidth = 8;
  for (let x = 0; x <= 256; x += 64) {
    shojiCtx.beginPath();
    shojiCtx.moveTo(x, 0);
    shojiCtx.lineTo(x, 512);
    shojiCtx.stroke();
  }
  for (let y = 0; y <= 512; y += 64) {
    shojiCtx.beginPath();
    shojiCtx.moveTo(0, y);
    shojiCtx.lineTo(256, y);
    shojiCtx.stroke();
  }
  const shojiTex = new THREE.CanvasTexture(shojiCanvas);
  shojiTex.colorSpace = THREE.SRGBColorSpace;

  const shojiMat = new THREE.MeshStandardMaterial({
    map: shojiTex,
    emissive: 0xf59e0b,
    emissiveMap: shojiTex,
    emissiveIntensity: 0.55,
    roughness: 0.6,
  });

  [-7.8, 7.8].forEach((sx) => {
    const shojiPanel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5.6, 0.25), shojiMat);
    shojiPanel.position.set(sx, groundY + 3.1, -8.5);
    shojiPanel.rotation.y = sx < 0 ? 0.22 : -0.22;
    envGroup.add(shojiPanel);
  });

  // 5. InstancedMesh Bamboo Stalk Grove (44 stalks framing the sanctuary)
  const bambooCount = 44;
  const bambooGeo = new THREE.CylinderGeometry(0.13, 0.17, 11.5, 10);
  bambooGeo.translate(0, 5.75, 0);
  const bambooMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0.08,
  });
  const bambooInstanced = new THREE.InstancedMesh(bambooGeo, bambooMat, bambooCount);
  const dummy = new THREE.Object3D();
  const tintColor = new THREE.Color();

  for (let i = 0; i < bambooCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (4.9 + (i % 11) * 1.25 + (Math.random() - 0.5) * 0.5);
    const z = -6.8 - Math.random() * 6.5;
    dummy.position.set(x, groundY, z);
    dummy.rotation.set(
      (Math.random() - 0.5) * 0.08,
      Math.random() * Math.PI,
      (Math.random() - 0.5) * 0.1
    );
    const scale = 0.85 + Math.random() * 0.32;
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    bambooInstanced.setMatrixAt(i, dummy.matrix);

    tintColor.setHSL(
      0.36 + (Math.random() - 0.5) * 0.04,
      0.58,
      0.24 + Math.random() * 0.14
    );
    bambooInstanced.setColorAt(i, tintColor);
  }
  bambooInstanced.instanceMatrix.needsUpdate = true;
  if (bambooInstanced.instanceColor) bambooInstanced.instanceColor.needsUpdate = true;
  bambooInstanced.computeBoundingSphere();
  envGroup.add(bambooInstanced);

  // 6. Animated Floating Sakura Blossom Petals & Spirit Fireflies (48 instances)
  const blossomCount = 48;
  const blossomGeo = new THREE.OctahedronGeometry(0.09, 0);
  blossomGeo.scale(1.3, 0.35, 0.9);
  const blossomMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.88,
  });
  const blossomInstanced = new THREE.InstancedMesh(blossomGeo, blossomMat, blossomCount);
  blossomInstanced.frustumCulled = false;

  const blossomStates = Array.from({ length: blossomCount }, (_, idx) => {
    const isFirefly = idx % 3 === 0;
    return {
      x: (Math.random() - 0.5) * 18,
      y: -4.2 + Math.random() * 11,
      z: -2.5 - Math.random() * 9.5,
      vx: isFirefly ? (Math.random() - 0.5) * 0.5 : -0.45 - Math.random() * 0.55,
      vy: isFirefly ? 0.25 + Math.random() * 0.35 : -0.35 - Math.random() * 0.4,
      phase: Math.random() * Math.PI * 2,
      scale: isFirefly ? 0.65 + Math.random() * 0.4 : 0.85 + Math.random() * 0.5,
      isFirefly,
    };
  });

  for (let i = 0; i < blossomCount; i++) {
    const st = blossomStates[i];
    if (st.isFirefly) {
      tintColor.setHex(i % 6 === 0 ? 0x38bdf8 : 0xfde047);
    } else {
      tintColor.setHex(i % 2 === 0 ? 0xfda4af : 0xf43f5e);
    }
    blossomInstanced.setColorAt(i, tintColor);
  }
  if (blossomInstanced.instanceColor) {
    blossomInstanced.instanceColor.needsUpdate = true;
  }
  envGroup.add(blossomInstanced);

  scene.add(envGroup);

  return {
    group: envGroup,
    update(nowSec: number, dt: number, tempoLevel: number) {
      // Scale ambient breeze and lantern glow with dynamic session tempoLevel (1..10)
      const tempoBoost = 1 + (tempoLevel - 1) * 0.18;

      // Gentle lantern sway & warm pulse
      for (let i = 0; i < lanternMeshes.length; i++) {
        const lg = lanternMeshes[i];
        lg.rotation.z = Math.sin(nowSec * 1.4 + i * Math.PI) * 0.045 * tempoBoost;
      }
      for (let i = 0; i < lanternCoreMaterials.length; i++) {
        lanternCoreMaterials[i].emissiveIntensity =
          1.45 + Math.sin(nowSec * 2.5 + i) * 0.25 + (tempoLevel - 1) * 0.1;
      }

      // Update drifting Sakura petals & rising Spirit Fireflies
      for (let i = 0; i < blossomCount; i++) {
        const b = blossomStates[i];
        b.x += (b.vx * tempoBoost + Math.sin(nowSec * 1.2 + b.phase) * 0.25) * dt;
        b.y += b.vy * tempoBoost * dt;

        if (b.x < -10) b.x = 10;
        if (b.x > 10) b.x = -10;
        if (b.y < -5.2) b.y = 6.8;
        if (b.y > 7.0) b.y = -4.8;

        dummy.position.set(b.x, b.y, b.z);
        dummy.rotation.set(
          nowSec * 1.5 + b.phase,
          nowSec * 2.1 + b.phase,
          Math.sin(nowSec + b.phase)
        );
        const pulse = b.isFirefly
          ? b.scale * (0.7 + 0.35 * Math.sin(nowSec * 4.5 + b.phase))
          : b.scale;
        dummy.scale.setScalar(pulse);
        dummy.updateMatrix();
        blossomInstanced.setMatrixAt(i, dummy.matrix);
      }
      blossomInstanced.instanceMatrix.needsUpdate = true;
    },
  };
}

