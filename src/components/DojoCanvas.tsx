import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BladeStyle,
  CutAnimationStyle,
  DifficultyId,
  FruitKind,
  PowerUpId,
} from '../types/game';
import { computeDynamicScaling, DIFFICULTIES, FRUIT_SPECS } from '../utils/storage';
import {
  buildDojoEnvironment,
  buildSlicedFruitHalf,
  buildWholeFruitModel,
  initProceduralTextures,
} from '../three/proceduralModels';
import { soundEngine } from '../utils/sound';

// Module-scope pre-allocated math objects to guarantee zero GC inside the 60fps loop
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _dummyObj = new THREE.Object3D();
const _rayPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

interface ActiveFruit {
  id: number;
  kind: FruitKind;
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  radius: number;
  baseScale: number;
  effectiveGravity: number;
  ageSec: number;
  maxLifespanSec: number;
  sliced: boolean;
  spawnTime: number;
}

interface SlicedHalfEntity {
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  peelOpenSpeed: number;
  inPlaneSpinSpeed: number;
  axialRollSpeed: number;
  cutStyle: CutAnimationStyle;
  age: number;
  maxAge: number;
}

interface SlashCleaveFlash {
  mesh: THREE.Mesh;
  age: number;
  maxAge: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  age: number;
  maxAge: number;
  maxScale: number;
}

interface ParticleData {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  size: number;
  age: number;
  maxAge: number;
  gravityScale: number;
}

export interface DojoCanvasProps {
  phase: 'title' | 'playing' | 'paused' | 'gameover';
  difficulty: DifficultyId;
  score: number;
  bladeStyle: BladeStyle;
  activePowerUps: Record<PowerUpId, number>;
  triggerFrenzySignal: number;
  onScoreChange: (
    deltaScore: number,
    kind: FruitKind,
    combo: number,
    cutStyleName: string,
    juiceHex: string,
    energyGain: number
  ) => void;
  onLifeLost: (reason: 'missed' | 'bomb') => void;
  onBombDeflected: () => void;
}

export const DojoCanvas: React.FC<DojoCanvasProps> = ({
  phase,
  difficulty,
  score,
  bladeStyle,
  activePowerUps,
  triggerFrenzySignal,
  onScoreChange,
  onLifeLost,
  onBombDeflected,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const stateRef = useRef({
    phase,
    difficulty,
    score,
    bladeStyle,
    activePowerUps,
    onScoreChange,
    onLifeLost,
    onBombDeflected,
  });

  useEffect(() => {
    stateRef.current = {
      phase,
      difficulty,
      score,
      bladeStyle,
      activePowerUps,
      onScoreChange,
      onLifeLost,
      onBombDeflected,
    };
  }, [
    phase,
    difficulty,
    score,
    bladeStyle,
    activePowerUps,
    onScoreChange,
    onLifeLost,
    onBombDeflected,
  ]);

  const frenzyBurstQueueRef = useRef(0);
  useEffect(() => {
    if (triggerFrenzySignal > 0) {
      // Controlled frenzy wave: 8 bonus fruits staggered smoothly
      frenzyBurstQueueRef.current = Math.min(frenzyBurstQueueRef.current + 8, 10);
    }
  }, [triggerFrenzySignal]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL detection from GPU renderer string
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Scene, Fog & Studio Environment Reflection (RoomEnvironment + PMREMGenerator)
    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x090d16);
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(0x090d16, 0.011);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    initProceduralTextures(maxAniso);

    // 3. Responsive Camera & Viewport Bounds (Adapts automatically for Mobile Portrait & Desktop Landscape)
    const camera = new THREE.PerspectiveCamera(
      48,
      container.clientWidth / container.clientHeight,
      0.1,
      120
    );
    const baseCamPos = new THREE.Vector3(0, 0.4, 13.5);
    const playBounds = {
      halfWidth: 5.5,
      bottomY: -5.5,
      topApexMin: 0.8,
      topApexMax: 3.2,
      isMobilePortrait: false,
    };

    function updateCameraAndBounds() {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      const aspect = w / h;
      camera.aspect = aspect;

      // On narrow mobile portrait screens, pull camera back slightly and widen FOV so the playfield is spacious
      if (aspect < 0.85) {
        playBounds.isMobilePortrait = true;
        camera.fov = 56;
        baseCamPos.set(0, 0.2, 15.8);
      } else if (aspect < 1.2) {
        playBounds.isMobilePortrait = false;
        camera.fov = 52;
        baseCamPos.set(0, 0.3, 14.5);
      } else {
        playBounds.isMobilePortrait = false;
        camera.fov = 48;
        baseCamPos.set(0, 0.4, 13.5);
      }

      camera.updateProjectionMatrix();
      renderer.setSize(w, h);

      // Compute exact visible world half-height and half-width at Z = 0 plane
      const vFovRad = THREE.MathUtils.degToRad(camera.fov);
      const visibleHalfHeight = Math.tan(vFovRad / 2) * baseCamPos.z;
      const visibleHalfWidth = visibleHalfHeight * aspect;

      // Keep fruits safely inside 74% of visible horizontal width so they never clip off screen edges
      playBounds.halfWidth = Math.min(6.2, Math.max(2.2, visibleHalfWidth * 0.74));
      playBounds.bottomY = -visibleHalfHeight - 0.55;
      playBounds.topApexMin = visibleHalfHeight * 0.08;
      playBounds.topApexMax = visibleHalfHeight * 0.54;
    }

    updateCameraAndBounds();
    camera.position.copy(baseCamPos);
    camera.lookAt(0, 0.2, 0);

    // 4. Balanced 3-Point Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e1b4b, 0.85);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.25);
    keyLight.position.set(6, 12, 9);
    keyLight.castShadow = !isSoftwareGl;
    const d = 11;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 35;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xf59e0b, 1.45);
    rimLight.position.set(-8, 6, -6);
    scene.add(rimLight);

    // 5. Build Moonlit Dojo Courtyard & Sanctuary Environment
    const envController = buildDojoEnvironment(scene, maxAniso);

    // 6. Title Screen Hero Showcase Group
    const titleShowcaseGroup = new THREE.Group();
    const showcaseKinds: FruitKind[] = ['watermelon', 'pineapple', 'dragonfruit', 'golden_yuzu'];
    const showcaseMeshes: THREE.Group[] = [];
    showcaseKinds.forEach((k, idx) => {
      const m = buildWholeFruitModel(k);
      const angle = (idx / showcaseKinds.length) * Math.PI * 2;
      m.position.set(Math.cos(angle) * 2.4, Math.sin(angle) * 0.8 + 0.2, 0);
      showcaseMeshes.push(m);
      titleShowcaseGroup.add(m);
    });
    scene.add(titleShowcaseGroup);

    // 7. Pooled InstancedMesh Particle System (240 droplets/seeds/sparks)
    const PARTICLE_COUNT = 240;
    const particleGeo = new THREE.DodecahedronGeometry(0.11, 0);
    const particleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.15,
    });
    const particleInstanced = new THREE.InstancedMesh(
      particleGeo,
      particleMat,
      PARTICLE_COUNT
    );
    particleInstanced.frustumCulled = false;
    particleInstanced.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(PARTICLE_COUNT * 3),
      3
    );
    scene.add(particleInstanced);

    const particles: ParticleData[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      active: false,
      position: new THREE.Vector3(0, -999, 0),
      velocity: new THREE.Vector3(),
      color: new THREE.Color(0xffffff),
      size: 1,
      age: 0,
      maxAge: 1,
      gravityScale: 1,
    }));

    function spawnParticleBurst(
      origin: THREE.Vector3,
      style: CutAnimationStyle,
      primaryHex: number,
      secondaryHex: number,
      count: number,
      cutDirXY?: THREE.Vector2
    ) {
      let spawned = 0;
      const tx = cutDirXY ? cutDirXY.x : 0;
      const ty = cutDirXY ? cutDirXY.y : 0;
      for (let i = 0; i < PARTICLE_COUNT && spawned < count; i++) {
        const p = particles[i];
        if (!p.active) {
          p.active = true;
          p.position.copy(origin);
          p.age = 0;
          p.maxAge = 0.55 + Math.random() * 0.45;

          const theta = Math.random() * Math.PI * 2;
          const phi = (Math.random() - 0.35) * Math.PI;
          let speed = 4.2 + Math.random() * 6.0;

          if (style === 'magenta_starburst') {
            const starAngle = ((spawned % 12) / 12) * Math.PI * 2;
            p.velocity.set(
              Math.cos(starAngle) * 7.2 + tx * 3.2,
              Math.sin(starAngle) * 7.2 + ty * 3.2,
              (Math.random() - 0.5) * 3
            );
            p.gravityScale = 0.35;
            p.size = 1.25;
          } else if (style === 'jewel_scatter') {
            speed = 6.2 + Math.random() * 6.5;
            p.velocity.set(
              Math.cos(theta) * Math.cos(phi) * speed + tx * 3.6,
              Math.sin(phi) * speed + ty * 3.6 + 1.2,
              Math.sin(theta) * Math.cos(phi) * speed
            );
            p.gravityScale = 1.15;
            p.size = 1.1;
          } else if (style === 'celestial_nova') {
            speed = 8.0 + Math.random() * 4.5;
            p.velocity.set(
              Math.cos(theta) * speed + tx * 2.8,
              Math.sin(theta) * speed + ty * 2.8,
              (Math.random() - 0.5) * 4
            );
            p.gravityScale = 0.15;
            p.size = 1.4;
          } else {
            // Directional juice spray biased along the katana chop direction
            const dirBoost = (spawned % 2 === 0 ? 4.2 : 2.0) * (0.7 + Math.random() * 0.6);
            p.velocity.set(
              Math.cos(theta) * Math.cos(phi) * speed * 0.75 + tx * dirBoost,
              Math.sin(phi) * speed * 0.75 + ty * dirBoost + 0.8,
              Math.sin(theta) * Math.cos(phi) * speed
            );
            p.gravityScale = 1.0;
            p.size = 0.85 + Math.random() * 0.75;
          }

          p.color.setHex(spawned % 3 === 0 ? secondaryHex : primaryHex);
          spawned++;
        }
      }
    }

    // 8. Expanding 3D Shockwave Rings & Directional Katana Slash Cleave Flashes on Cuts
    const shockwaves: ShockwaveRing[] = [];
    const slashFlashes: SlashCleaveFlash[] = [];
    const ringGeo = new THREE.RingGeometry(0.42, 0.58, 32);
    const slashFlashGeo = new THREE.PlaneGeometry(3.4, 0.16);

    function spawnShockwave(pos: THREE.Vector3, colorHex: string, maxScale: number = 3.0) {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.position.copy(pos);
      scene.add(mesh);
      shockwaves.push({
        mesh,
        age: 0,
        maxAge: 0.32,
        maxScale,
      });
    }

    function spawnSlashCleaveFlash(
      pos: THREE.Vector3,
      cutAngle: number,
      colorHex: string
    ) {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(slashFlashGeo, mat);
      mesh.position.set(pos.x, pos.y, pos.z + 0.25);
      mesh.rotation.z = cutAngle;
      mesh.renderOrder = 22;
      scene.add(mesh);
      slashFlashes.push({
        mesh,
        age: 0,
        maxAge: 0.22,
      });
    }

    // 9. Katana Blade Ribbon Trail
    const MAX_TRAIL_PTS = 18;
    const trailPoints: { pos: THREE.Vector3; time: number }[] = [];
    const trailPositions = new Float32Array((MAX_TRAIL_PTS - 1) * 6 * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMat = new THREE.MeshBasicMaterial({
      color: stateRef.current.bladeStyle.primaryColor,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const trailMesh = new THREE.Mesh(trailGeo, trailMat);
    trailMesh.frustumCulled = false;
    trailMesh.renderOrder = 20;
    scene.add(trailMesh);

    // 10. Active Fruits, Staggered Wave Queue & Sliced Halves
    let nextFruitId = 1;
    const activeFruits: ActiveFruit[] = [];
    const slicedHalves: SlicedHalfEntity[] = [];

    // Staggered launch queue so fruits in a wave launch one by one ("pop... pop... pop") instead of all at once
    const pendingWaveQueue: { forceNoBomb: boolean }[] = [];
    let staggerLaunchTimerMs = 0;
    let waveCooldownMs = 900;
    let wavesSpawnedInRun = 0;
    let lastKnownPhase = stateRef.current.phase;

    let hitstopTimerSec = 0;
    let cameraShakeIntensity = 0;
    let comboDecayTimerSec = 0;
    let runningCombo = 0;

    const regularFruits: FruitKind[] = [
      'watermelon',
      'pineapple',
      'dragonfruit',
      'mango',
      'coconut',
      'pomegranate',
    ];

    function spawnSingleFruit(forceNoBomb: boolean = false) {
      const diff = DIFFICULTIES[stateRef.current.difficulty];
      const scaling = computeDynamicScaling(
        stateRef.current.difficulty,
        stateRef.current.score
      );
      let kind: FruitKind;

      // Never spawn bombs on the first 2 waves of a run or if there is already a bomb on screen
      const bombAlreadyActive = activeFruits.some((f) => f.kind === 'bomb_oni' && !f.sliced);
      const allowBomb = !forceNoBomb && wavesSpawnedInRun > 2 && !bombAlreadyActive;

      const roll = Math.random();
      if (allowBomb && roll < diff.bombChance) {
        kind = 'bomb_oni';
      } else if (roll > 0.92) {
        kind = 'golden_yuzu';
      } else {
        kind = regularFruits[Math.floor(Math.random() * regularFruits.length)];
      }

      const spec = FRUIT_SPECS[kind];
      const mesh = buildWholeFruitModel(kind);

      // Scale down slightly on narrow mobile portrait screens so fruits have generous space
      const mobileScale = playBounds.isMobilePortrait ? 0.88 : 1.0;
      mesh.scale.setScalar(mobileScale);

      // Pick startX and apex targetX strictly within playBounds.halfWidth
      const hw = playBounds.halfWidth;
      const startX = (Math.random() * 2 - 1) * hw * 0.85;
      const startY = playBounds.bottomY;
      const startZ = (Math.random() - 0.5) * 0.9;
      mesh.position.set(startX, startY, startZ);

      // Target apex X leans gently toward the opposite half of the screen so the arc stays centered
      const targetApexX =
        -startX * (0.25 + Math.random() * 0.35) + (Math.random() - 0.5) * (hw * 0.35);
      const clampedApexX = THREE.MathUtils.clamp(targetApexX, -hw * 0.8, hw * 0.8);

      // Desired peak height well inside the comfortable middle-upper zone of the screen
      const targetApexY =
        playBounds.topApexMin +
        Math.random() * (playBounds.topApexMax - playBounds.topApexMin);
      const heightDelta = Math.max(3.5, targetApexY - startY);

      // Dynamic projectile lifespan scaling:
      // effectiveGravity scales with 1 / (lifespanMultiplier^2) so the projectile reaches the exact same
      // comfortable peak height targetApexY, while timeToApex and total airborne lifespan shrink by lifespanMultiplier!
      const g = scaling.effectiveGravity;
      const vy = Math.sqrt(2 * g * heightDelta);
      const timeToApex = vy / g;
      const vx = (clampedApexX - startX) / timeToApex;
      const vz = -startZ * 0.3;

      // Hard projectile lifespan cap (in seconds) that decreases as session score climbs
      const maxLifespanSec = Math.min(
        scaling.maxProjectileLifespanSec,
        timeToApex * 2.08
      );

      const rotBoost = 1 / scaling.lifespanMultiplier;
      const angularVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 4.5 * rotBoost,
        (Math.random() - 0.5) * 4.5 * rotBoost,
        (Math.random() - 0.5) * 3.8 * rotBoost
      );

      scene.add(mesh);
      if (kind === 'bomb_oni') {
        soundEngine.playBombSpawnWarning();
      }
      activeFruits.push({
        id: nextFruitId++,
        kind,
        mesh,
        velocity: new THREE.Vector3(vx, vy, vz),
        angularVelocity,
        radius: spec.radius * mobileScale,
        baseScale: mobileScale,
        effectiveGravity: g,
        ageSec: 0,
        maxLifespanSec,
        sliced: false,
        spawnTime: performance.now(),
      });
    }

    function executeFruitCut(
      fruit: ActiveFruit,
      cutDirXY: THREE.Vector2,
      cutSpeedRatio: number = 1.0
    ) {
      fruit.sliced = true;
      const spec = FRUIT_SPECS[fruit.kind];
      const pos = fruit.mesh.position.clone();
      const scaling = computeDynamicScaling(
        stateRef.current.difficulty,
        stateRef.current.score
      );

      scene.remove(fruit.mesh);

      // Check if Oni Bomb
      if (fruit.kind === 'bomb_oni') {
        const hasAegis = (stateRef.current.activePowerUps.aegis_ward || 0) > 0;
        if (hasAegis) {
          soundEngine.playBombExplosion(true);
          spawnShockwave(pos, '#a855f7', 4.2);
          spawnParticleBurst(pos, 'celestial_nova', 0xa855f7, 0x38bdf8, 34, cutDirXY);
          stateRef.current.onBombDeflected();
        } else {
          soundEngine.playBombExplosion(false);
          hitstopTimerSec = 0.06;
          cameraShakeIntensity = 0.55;
          runningCombo = 0;
          spawnShockwave(pos, '#ef4444', 5.0);
          spawnParticleBurst(pos, 'bomb_detonate', 0xef4444, 0xf97316, 44, cutDirXY);
          stateRef.current.onLifeLost('bomb');
        }
        return;
      }

      // Advance Combo
      runningCombo = Math.min(runningCombo + 1, 25);
      comboDecayTimerSec = 1.5;

      // Play fruit-specific Katana Knife blade slash + fruit chop sound
      soundEngine.playFruitSlice(spec.cutStyle, runningCombo, fruit.kind, cutSpeedRatio);
      if (runningCombo >= 3 && runningCombo % 2 === 1) {
        soundEngine.playComboChord(runningCombo);
      }

      if (
        spec.cutStyle === 'shell_shatter' ||
        spec.cutStyle === 'celestial_nova' ||
        runningCombo >= 4
      ) {
        hitstopTimerSec = spec.cutStyle === 'shell_shatter' ? 0.042 : 0.028;
        cameraShakeIntensity = Math.max(cameraShakeIntensity, 0.2);
      } else {
        cameraShakeIntensity = Math.max(cameraShakeIntensity, 0.07);
      }

      // Exact chop angle & orthonormal basis in the XY playfield plane:
      // T = (tx, ty) is the exact unit direction the user chopped the fruit
      // N = (nx, ny) is the unit normal perpendicular to the user's chop line
      const cutAngle = Math.atan2(cutDirXY.y, cutDirXY.x);
      const tx = Math.cos(cutAngle);
      const ty = Math.sin(cutAngle);
      const nx = -ty;
      const ny = tx;

      const burstCount =
        spec.cutStyle === 'jewel_scatter'
          ? 38
          : spec.cutStyle === 'celestial_nova'
          ? 42
          : 26;
      spawnParticleBurst(
        pos,
        spec.cutStyle,
        spec.fleshColor,
        spec.rindColor,
        burstCount,
        cutDirXY
      );
      spawnShockwave(
        pos,
        spec.juiceHex,
        spec.cutStyle === 'celestial_nova' ? 4.4 : 2.6
      );
      // Spawn glowing 3D directional katana slash line right along the user's chop angle
      spawnSlashCleaveFlash(
        pos,
        cutAngle,
        stateRef.current.bladeStyle.primaryColor
      );

      // Create Two 3D Sliced Fruit Halves Aligned Precisely with the User's Chop Angle
      const topHalf = buildSlicedFruitHalf(fruit.kind, true);
      const botHalf = buildSlicedFruitHalf(fruit.kind, false);
      const mobileScale = playBounds.isMobilePortrait ? 0.88 : 1.0;
      topHalf.scale.setScalar(mobileScale);
      botHalf.scale.setScalar(mobileScale);

      // Orient both halves so their flat cross-section cut faces lie strictly along cutAngle,
      // then tilt each half slightly around its local X axis (the cut line itself) so the juicy
      // interior cross-section gleams toward the camera without altering the cut line angle.
      topHalf.rotation.set(0, 0, cutAngle);
      botHalf.rotation.set(0, 0, cutAngle + Math.PI);
      topHalf.rotateX(-0.34);
      botHalf.rotateX(-0.34);

      // Immediate positional cleave offset along N=(nx, ny) and slight shear along T=(tx, ty)
      // so the cut gap opens cleanly along the user's chop line on the very first frame.
      const cleaveGap = fruit.radius * 0.22;
      topHalf.position.set(
        pos.x + nx * cleaveGap + tx * 0.09,
        pos.y + ny * cleaveGap + ty * 0.09,
        pos.z + 0.08
      );
      botHalf.position.set(
        pos.x - nx * cleaveGap - tx * 0.09,
        pos.y - ny * cleaveGap - ty * 0.09,
        pos.z - 0.08
      );

      // Directional Physics:
      // 1. Retain 30% of the fruit's pre-cut velocity so the user's chop direction (tx, ty) dominates!
      // 2. Drive BOTH halves in the direction of the user's chop (tx * chopDrive, ty * chopDrive),
      //    so chopping downward drives the halves downward, chopping left drives them left, etc.
      // 3. Split the two halves apart perpendicular to the cut line (±nx * splitSpeed, ±ny * splitSpeed)
      //    plus a blade-shear differential (±tx * shearSpeed, ±ty * shearSpeed).
      const speedClamp = Math.min(Math.max(cutSpeedRatio, 0.8), 1.65);
      const chopDrive = 4.2 * speedClamp;
      const baseCarryX = fruit.velocity.x * 0.28 + tx * chopDrive;
      const baseCarryY = fruit.velocity.y * 0.28 + ty * chopDrive;
      const baseCarryZ = fruit.velocity.z * 0.3;

      let splitSpeed = 3.1;
      let shearSpeed = 1.15;
      let zSplit = 1.05;
      let peelOpenSpeed = -2.4;
      let inPlaneSpinSpeed = 2.8;
      let axialRollSpeed = 1.8;

      if (spec.cutStyle === 'radial_cleave') {
        splitSpeed = 3.4;
        shearSpeed = 1.25;
        zSplit = 1.15;
        peelOpenSpeed = -2.6;
        inPlaneSpinSpeed = 3.1;
      } else if (spec.cutStyle === 'crown_spin') {
        splitSpeed = 3.0;
        shearSpeed = 1.4;
        zSplit = 0.95;
        peelOpenSpeed = -2.2;
        inPlaneSpinSpeed = 3.4;
        axialRollSpeed = 9.5; // Signature spinning pineapple crown
      } else if (spec.cutStyle === 'tangential_glide') {
        splitSpeed = 2.5;
        shearSpeed = 2.6; // Extra-long silky glide along the user's blade direction
        zSplit = 0.85;
        peelOpenSpeed = -2.0;
        inPlaneSpinSpeed = 3.8;
      } else if (spec.cutStyle === 'shell_shatter') {
        splitSpeed = 4.5; // Explosive coconut shell split perpendicular to chop
        shearSpeed = 1.5;
        zSplit = 1.75;
        peelOpenSpeed = -3.6;
        inPlaneSpinSpeed = 4.6;
      } else if (spec.cutStyle === 'celestial_nova') {
        splitSpeed = 3.8;
        shearSpeed = 1.6;
        zSplit = 1.3;
        peelOpenSpeed = -2.8;
        inPlaneSpinSpeed = 3.5;
        axialRollSpeed = 4.2;
      }

      const vTop = new THREE.Vector3(
        baseCarryX + nx * splitSpeed + tx * shearSpeed,
        baseCarryY + ny * splitSpeed + ty * shearSpeed,
        baseCarryZ + zSplit
      );
      const vBot = new THREE.Vector3(
        baseCarryX - nx * splitSpeed - tx * (shearSpeed * 0.75),
        baseCarryY - ny * splitSpeed - ty * (shearSpeed * 0.75),
        baseCarryZ - zSplit
      );

      scene.add(topHalf);
      scene.add(botHalf);

      const halfLifespan = 2.0 * scaling.lifespanMultiplier;
      slicedHalves.push(
        {
          mesh: topHalf,
          velocity: vTop,
          peelOpenSpeed,
          inPlaneSpinSpeed: -inPlaneSpinSpeed,
          axialRollSpeed,
          cutStyle: spec.cutStyle,
          age: 0,
          maxAge: halfLifespan,
        },
        {
          mesh: botHalf,
          velocity: vBot,
          peelOpenSpeed,
          inPlaneSpinSpeed: inPlaneSpinSpeed,
          axialRollSpeed: -axialRollSpeed,
          cutStyle: spec.cutStyle,
          age: 0,
          maxAge: halfLifespan,
        }
      );

      const diffCfg = DIFFICULTIES[stateRef.current.difficulty];
      const hasDouble = (stateRef.current.activePowerUps.twin_katana || 0) > 0;
      const comboBonus = runningCombo > 1 ? 1 + (runningCombo - 1) * 0.25 : 1;
      const totalPoints = Math.round(
        spec.points * diffCfg.scoreMultiplier * (hasDouble ? 2 : 1) * comboBonus
      );
      const energyGain = fruit.kind === 'golden_yuzu' ? 35 : 9;

      stateRef.current.onScoreChange(
        totalPoints,
        fruit.kind,
        runningCombo,
        spec.cutStyleName,
        spec.juiceHex,
        energyGain
      );
    }

    // 11. Pointer & Touch Slicing Input Handler (Dual Pointer + Native Touch Events with Screen-Space & World-Space Hit Detection)
    let isPointerDown = false;
    const lastWorldPoint = new THREE.Vector3();
    let hasLastPoint = false;
    let lastClientX = 0;
    let lastClientY = 0;
    let hasLastScreenPoint = false;
    let lastSwingSoundTime = 0;
    const raycaster = new THREE.Raycaster();
    const ndcMouse = new THREE.Vector2();

    function isInteractiveUiElement(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false;
      return (
        target.closest(
          'button, input, textarea, select, a, [role="button"], [data-ui-interactive="true"]'
        ) !== null
      );
    }

    function screenToPlayPlane(clientX: number, clientY: number, out: THREE.Vector3): boolean {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      ndcMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndcMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndcMouse, camera);
      return raycaster.ray.intersectPlane(_rayPlane, out) !== null;
    }

    function distToSegmentXY(
      px: number,
      py: number,
      ax: number,
      ay: number,
      bx: number,
      by: number
    ): number {
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 0.0001) {
        return Math.hypot(px - ax, py - ay);
      }
      const t = THREE.MathUtils.clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
      const projX = ax + t * dx;
      const projY = ay + t * dy;
      return Math.hypot(px - projX, py - projY);
    }

    function checkFruitHit(
      f: ActiveFruit,
      worldA: THREE.Vector3,
      worldB: THREE.Vector3,
      screenAx: number,
      screenAy: number,
      screenBx: number,
      screenBy: number,
      isTouch: boolean,
      hasSegment: boolean
    ): boolean {
      const hasWideBlade = (stateRef.current.activePowerUps.twin_katana || 0) > 0;
      const baseHitbox = isTouch ? 1.55 : 1.25;
      const hitboxScale = hasWideBlade ? baseHitbox * 1.35 : baseHitbox;
      const effectiveWorldRadius = Math.max(f.radius * hitboxScale, isTouch ? 0.95 : 0.72);

      // 1. 3D World-Space XY Segment / Point check
      const worldDist = hasSegment
        ? distToSegmentXY(
            f.mesh.position.x,
            f.mesh.position.y,
            worldA.x,
            worldA.y,
            worldB.x,
            worldB.y
          )
        : Math.hypot(f.mesh.position.x - worldB.x, f.mesh.position.y - worldB.y);

      if (worldDist <= effectiveWorldRadius) {
        return true;
      }

      // 2. Direct 2D Screen-Space Projection check (eliminates any perspective/FOV parallax on mobile)
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        _vec3B.copy(f.mesh.position).project(camera);
        const fx = rect.left + (_vec3B.x + 1) * 0.5 * rect.width;
        const fy = rect.top + (1 - _vec3B.y) * 0.5 * rect.height;

        const camDist = Math.max(1, camera.position.z - f.mesh.position.z);
        const fovHalfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
        const projectedRadiusPx =
          (f.radius / (fovHalfTan * camDist)) * (rect.height * 0.5);
        const pixelHitRadius = Math.max(
          projectedRadiusPx * hitboxScale,
          isTouch ? 44 : 30
        );

        const screenDist = hasSegment
          ? distToSegmentXY(fx, fy, screenAx, screenAy, screenBx, screenBy)
          : Math.hypot(fx - screenBx, fy - screenBy);

        if (screenDist <= pixelHitRadius) {
          return true;
        }
      }

      return false;
    }

    const lastCutDirXY = new THREE.Vector2(0, -1);

    function computeActiveChopDirection(
      currentWorldPos: THREE.Vector3,
      fallbackFruitVel?: THREE.Vector3
    ): THREE.Vector2 {
      // Walk backward through recent trailPoints to get a clean, stable vector of the user's stroke
      for (let i = trailPoints.length - 1; i >= Math.max(0, trailPoints.length - 6); i--) {
        const pt = trailPoints[i].pos;
        const dx = currentWorldPos.x - pt.x;
        const dy = currentWorldPos.y - pt.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= 0.045) {
          lastCutDirXY.set(dx / dist, dy / dist);
          return lastCutDirXY.clone();
        }
      }
      if (hasLastPoint) {
        const dx = currentWorldPos.x - lastWorldPoint.x;
        const dy = currentWorldPos.y - lastWorldPoint.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= 0.008) {
          lastCutDirXY.set(dx / dist, dy / dist);
          return lastCutDirXY.clone();
        }
      }
      if (fallbackFruitVel) {
        const rx = -fallbackFruitVel.x;
        const ry = -fallbackFruitVel.y;
        const rLen = Math.hypot(rx, ry);
        if (rLen > 0.1) {
          return new THREE.Vector2(rx / rLen, ry / rLen);
        }
      }
      return lastCutDirXY.clone();
    }

    function handleSliceInput(clientX: number, clientY: number, isTouch: boolean) {
      if (!screenToPlayPlane(clientX, clientY, _vec3A)) return;

      const now = performance.now();
      const moveDist = hasLastPoint ? _vec3A.distanceTo(lastWorldPoint) : 999;

      if (hasLastPoint && hasLastScreenPoint) {
        const speedRatio = Math.min(Math.max(moveDist * 1.35, 0.7), 2.0);
        if (moveDist > 0.32 && now - lastSwingSoundTime > 75) {
          lastSwingSoundTime = now;
          soundEngine.playSwing(speedRatio);
        }

        if (stateRef.current.phase === 'playing') {
          const cutDir = computeActiveChopDirection(_vec3A);

          for (let i = activeFruits.length - 1; i >= 0; i--) {
            const f = activeFruits[i];
            if (f.sliced) continue;
            if (
              checkFruitHit(
                f,
                lastWorldPoint,
                _vec3A,
                lastClientX,
                lastClientY,
                clientX,
                clientY,
                isTouch,
                true
              )
            ) {
              executeFruitCut(f, cutDir, speedRatio);
            }
          }
        }
      } else if (stateRef.current.phase === 'playing') {
        // Direct tap / touch-down on a fruit
        for (let i = activeFruits.length - 1; i >= 0; i--) {
          const f = activeFruits[i];
          if (f.sliced) continue;
          if (
            checkFruitHit(
              f,
              _vec3A,
              _vec3A,
              clientX,
              clientY,
              clientX,
              clientY,
              isTouch,
              false
            )
          ) {
            const tapCutDir = computeActiveChopDirection(_vec3A, f.velocity);
            executeFruitCut(f, tapCutDir, 1.0);
          }
        }
      }

      // Avoid pushing duplicate trail vertices if pointermove and touchmove fire at the exact same coordinate
      if (moveDist > 0.004) {
        trailPoints.push({ pos: _vec3A.clone(), time: now });
        if (trailPoints.length > MAX_TRAIL_PTS) {
          trailPoints.shift();
        }
      }

      if (moveDist > 0.004 || !hasLastPoint) {
        lastWorldPoint.copy(_vec3A);
        hasLastPoint = true;
        lastClientX = clientX;
        lastClientY = clientY;
        hasLastScreenPoint = true;
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (isInteractiveUiElement(e.target)) return;
      soundEngine.unlock();
      isPointerDown = true;
      hasLastPoint = false;
      hasLastScreenPoint = false;
      handleSliceInput(e.clientX, e.clientY, e.pointerType !== 'mouse');
    };

    const onPointerMove = (e: PointerEvent) => {
      // On touch or pen devices, any pointermove is an active touch drag
      if (
        e.pointerType === 'touch' ||
        e.pointerType === 'pen' ||
        isPointerDown ||
        e.buttons > 0 ||
        e.pointerType === 'mouse'
      ) {
        const isTouchInput = e.pointerType !== 'mouse';
        const events =
          typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
        if (events.length > 0) {
          for (let i = 0; i < events.length; i++) {
            handleSliceInput(events[i].clientX, events[i].clientY, isTouchInput);
          }
        } else {
          handleSliceInput(e.clientX, e.clientY, isTouchInput);
        }
      }
    };

    const onPointerUp = () => {
      isPointerDown = false;
      hasLastPoint = false;
      hasLastScreenPoint = false;
    };

    // Native Touch Event listeners guarantee responsive touch slicing across all mobile WebViews & iOS/Android browsers
    const onTouchStart = (e: TouchEvent) => {
      if (isInteractiveUiElement(e.target)) return;
      soundEngine.unlock();
      if (e.cancelable) {
        e.preventDefault();
      }
      isPointerDown = true;
      hasLastPoint = false;
      hasLastScreenPoint = false;
      if (e.touches.length > 0) {
        const t = e.touches[0];
        handleSliceInput(t.clientX, t.clientY, true);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (stateRef.current.phase !== 'playing' && isInteractiveUiElement(e.target)) {
        return;
      }
      if (e.cancelable) {
        e.preventDefault();
      }
      isPointerDown = true;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        handleSliceInput(t.clientX, t.clientY, true);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        isPointerDown = false;
        hasLastPoint = false;
        hasLastScreenPoint = false;
      }
    };

    const onWindowBlur = () => {
      isPointerDown = false;
      hasLastPoint = false;
      hasLastScreenPoint = false;
      trailPoints.length = 0;
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('blur', onWindowBlur);

    // 12. Resize Handler
    const onResize = () => {
      updateCameraAndBounds();
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 13. Main 60fps Game Loop with Software-WebGL Pacing Guard
    let frameId = 0;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function updateTrailGeometry(now: number) {
      while (trailPoints.length > 0 && now - trailPoints[0].time > 135) {
        trailPoints.shift();
      }

      trailMat.color.set(stateRef.current.bladeStyle.primaryColor);
      const posAttr = trailGeo.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      arr.fill(0);

      if (trailPoints.length >= 2) {
        const hasWide = (stateRef.current.activePowerUps.twin_katana || 0) > 0;
        const maxThick = hasWide ? 0.28 : 0.16;

        for (let i = 0; i < trailPoints.length - 1; i++) {
          const p0 = trailPoints[i].pos;
          const p1 = trailPoints[i + 1].pos;
          const ratio0 = i / (trailPoints.length - 1);
          const ratio1 = (i + 1) / (trailPoints.length - 1);

          const dx = p1.x - p0.x;
          const dy = p1.y - p0.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = (-dy / len) * maxThick;
          const ny = (dx / len) * maxThick;

          const w0 = Math.sin(ratio0 * Math.PI);
          const w1 = Math.sin(ratio1 * Math.PI);

          const idx = i * 18;
          arr[idx] = p0.x + nx * w0;
          arr[idx + 1] = p0.y + ny * w0;
          arr[idx + 2] = 0.2;

          arr[idx + 3] = p0.x - nx * w0;
          arr[idx + 4] = p0.y - ny * w0;
          arr[idx + 5] = 0.2;

          arr[idx + 6] = p1.x + nx * w1;
          arr[idx + 7] = p1.y + ny * w1;
          arr[idx + 8] = 0.2;

          arr[idx + 9] = p0.x - nx * w0;
          arr[idx + 10] = p0.y - ny * w0;
          arr[idx + 11] = 0.2;

          arr[idx + 12] = p1.x - nx * w1;
          arr[idx + 13] = p1.y - ny * w1;
          arr[idx + 14] = 0.2;

          arr[idx + 15] = p1.x + nx * w1;
          arr[idx + 16] = p1.y + ny * w1;
          arr[idx + 17] = 0.2;
        }
      }
      posAttr.needsUpdate = true;
    }

    function tick() {
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      const currentPhase = stateRef.current.phase;
      const diff = DIFFICULTIES[stateRef.current.difficulty];
      const scaling = computeDynamicScaling(
        stateRef.current.difficulty,
        currentPhase === 'playing' ? stateRef.current.score : 0
      );

      // Update animated Sakura petals, Spirit Fireflies & Torii Lanterns in the 3D background
      envController.update(now * 0.001, dt, scaling.tempoLevel);

      // Reset wave counters when starting a fresh run
      if (currentPhase === 'playing' && lastKnownPhase !== 'playing') {
        if (lastKnownPhase === 'title' || lastKnownPhase === 'gameover') {
          activeFruits.forEach((f) => scene.remove(f.mesh));
          activeFruits.length = 0;
          pendingWaveQueue.length = 0;
          wavesSpawnedInRun = 0;
          waveCooldownMs = 600;
          staggerLaunchTimerMs = 0;
          runningCombo = 0;
        }
      }
      lastKnownPhase = currentPhase;

      updateTrailGeometry(now);

      // Update Title Showcase Visibility & Orbit
      if (currentPhase === 'title') {
        titleShowcaseGroup.visible = true;
        const t = now * 0.001;
        const orbitRadius = Math.min(2.6, playBounds.halfWidth * 0.68);
        showcaseMeshes.forEach((m, idx) => {
          const a = t * 0.65 + (idx / showcaseKinds.length) * Math.PI * 2;
          m.position.x = Math.cos(a) * orbitRadius;
          m.position.y = Math.sin(a * 1.5) * 0.75 + 0.1;
          m.position.z = Math.sin(a) * 1.1;
          m.rotation.x += dt * 0.9;
          m.rotation.y += dt * 1.2;
        });

        const targetCamX = Math.sin(t * 0.4) * 0.6;
        const targetCamY = baseCamPos.y + Math.cos(t * 0.3) * 0.2;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCamX, 4, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCamY, 4, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, baseCamPos.z, 4, dt);
        camera.lookAt(0, 0.1, 0);
      } else {
        titleShowcaseGroup.visible = false;
      }

      if (currentPhase === 'title' && activeFruits.length > 0) {
        activeFruits.forEach((f) => scene.remove(f.mesh));
        activeFruits.length = 0;
        pendingWaveQueue.length = 0;
      }

      // Advance active gameplay simulation
      if (currentPhase === 'playing') {
        if (hitstopTimerSec > 0) {
          hitstopTimerSec -= dt;
        } else {
          const hasChrono = (stateRef.current.activePowerUps.chrono_lotus || 0) > 0;
          const timeScale = hasChrono ? 0.42 : 1.0;
          const simDt = dt * timeScale;

          if (comboDecayTimerSec > 0) {
            comboDecayTimerSec -= dt;
            if (comboDecayTimerSec <= 0) {
              runningCombo = 0;
            }
          }

          // Max simultaneous fruits allowed on screen scales gently with session score
          const baseMaxOnScreen =
            diff.id === 'apprentice'
              ? 3
              : diff.id === 'shinobi'
              ? 4
              : diff.id === 'shogun'
              ? 5
              : 6;
          const maxOnScreen = baseMaxOnScreen + scaling.bonusMaxOnScreen;

          // 1. Transfer any Frenzy power-up bonus fruits into the staggered queue
          while (frenzyBurstQueueRef.current > 0) {
            frenzyBurstQueueRef.current--;
            pendingWaveQueue.push({ forceNoBomb: true });
          }

          // 2. Dynamic Wave Spawn Rate: waveCooldownMs uses scaling.effectiveSpawnIntervalMs
          if (pendingWaveQueue.length === 0 && activeFruits.length <= 1) {
            waveCooldownMs -= dt * 1000 * (hasChrono ? 0.65 : 1.0);
            if (waveCooldownMs <= 0) {
              wavesSpawnedInRun++;
              waveCooldownMs =
                scaling.effectiveSpawnIntervalMs * (0.88 + Math.random() * 0.24);

              const scaledMaxBurst = Math.min(
                6,
                diff.maxBurst + scaling.bonusMaxBurst
              );
              const maxWaveBurst =
                wavesSpawnedInRun <= 2
                  ? Math.min(2, diff.maxBurst)
                  : scaledMaxBurst;
              const burstCount =
                diff.minBurst +
                Math.floor(Math.random() * Math.max(1, maxWaveBurst - diff.minBurst + 1));

              for (let b = 0; b < burstCount; b++) {
                pendingWaveQueue.push({ forceNoBomb: wavesSpawnedInRun <= 2 });
              }
              staggerLaunchTimerMs = 0;
            }
          }

          // 3. Dynamic Intra-Wave Stagger: launches fruits with scaling.effectiveStaggerMs
          if (pendingWaveQueue.length > 0 && activeFruits.length < maxOnScreen) {
            staggerLaunchTimerMs -= dt * 1000 * (hasChrono ? 0.65 : 1.0);
            if (staggerLaunchTimerMs <= 0) {
              const nextItem = pendingWaveQueue.shift()!;
              spawnSingleFruit(nextItem.forceNoBomb);
              staggerLaunchTimerMs = nextItem.forceNoBomb
                ? Math.min(210, scaling.effectiveStaggerMs)
                : scaling.effectiveStaggerMs * (0.9 + Math.random() * 0.22);
            }
          }

          // Update Whole Fruits (with Dynamic Projectile Lifespan & Gravity)
          for (let i = activeFruits.length - 1; i >= 0; i--) {
            const f = activeFruits[i];
            if (f.sliced) {
              activeFruits.splice(i, 1);
              continue;
            }

            f.ageSec += simDt;
            f.mesh.position.addScaledVector(f.velocity, simDt);
            f.velocity.y -= f.effectiveGravity * simDt;

            // Gentle wall bounce if a fruit ever approaches the horizontal playBounds
            if (f.mesh.position.x > playBounds.halfWidth && f.velocity.x > 0) {
              f.velocity.x *= -0.6;
              f.mesh.position.x = playBounds.halfWidth;
            } else if (f.mesh.position.x < -playBounds.halfWidth && f.velocity.x < 0) {
              f.velocity.x *= -0.6;
              f.mesh.position.x = -playBounds.halfWidth;
            }

            f.mesh.rotation.x += f.angularVelocity.x * simDt;
            f.mesh.rotation.y += f.angularVelocity.y * simDt;
            f.mesh.rotation.z += f.angularVelocity.z * simDt;

            // Visual urgency pulse when projectile enters the final 28% of its reduced lifespan
            const lifeRatio = f.ageSec / f.maxLifespanSec;
            if (lifeRatio > 0.72 && f.kind !== 'bomb_oni') {
              const urgencyPulse =
                f.baseScale * (1 + Math.sin(now * 0.045) * 0.065);
              f.mesh.scale.setScalar(urgencyPulse);
            }

            if (f.kind === 'bomb_oni') {
              const spark = f.mesh.getObjectByName('bomb_spark');
              if (spark) {
                const s = 0.85 + Math.sin(now * 0.03) * 0.35;
                spark.scale.setScalar(s);
              }
            }

            // If finger/blade is actively held on screen and a fruit flies into it, slice along the active chop or relative motion vector
            if (
              isPointerDown &&
              hasLastPoint &&
              hasLastScreenPoint &&
              checkFruitHit(
                f,
                lastWorldPoint,
                lastWorldPoint,
                lastClientX,
                lastClientY,
                lastClientX,
                lastClientY,
                true,
                false
              )
            ) {
              const heldCutDir = computeActiveChopDirection(lastWorldPoint, f.velocity);
              executeFruitCut(f, heldCutDir, 1.0);
              continue;
            }

            // Check if projectile lifespan expired OR fell below bottom of viewport without being sliced
            const fellBelow =
              f.mesh.position.y < playBounds.bottomY - 1.0 && f.velocity.y < 0;
            const lifespanExpired = f.ageSec >= f.maxLifespanSec && f.velocity.y < 0;

            if (fellBelow || lifespanExpired) {
              scene.remove(f.mesh);
              activeFruits.splice(i, 1);
              if (f.kind !== 'bomb_oni' && f.kind !== 'golden_yuzu') {
                const hasAegis = (stateRef.current.activePowerUps.aegis_ward || 0) > 0;
                if (!hasAegis) {
                  runningCombo = 0;
                  soundEngine.playMissFruit();
                  stateRef.current.onLifeLost('missed');
                }
              }
            }
          }

          // Update Sliced Fruit Halves (preserving local cut-plane orientation as halves peel apart)
          for (let i = slicedHalves.length - 1; i >= 0; i--) {
            const h = slicedHalves[i];
            h.age += dt;
            h.mesh.position.addScaledVector(h.velocity, simDt);
            h.velocity.y -= scaling.effectiveGravity * 1.02 * simDt;

            // Rotate around local axes so the cut edge stays faithful to the user's chop angle
            h.mesh.rotateX(h.peelOpenSpeed * simDt);
            h.mesh.rotateZ(h.inPlaneSpinSpeed * simDt);
            h.mesh.rotateY(h.axialRollSpeed * simDt);

            if (h.age > h.maxAge - 0.35) {
              const shrink = Math.max(0.01, (h.maxAge - h.age) / 0.35);
              h.mesh.scale.setScalar(shrink);
            }

            if (h.age >= h.maxAge || h.mesh.position.y < playBounds.bottomY - 2.5) {
              scene.remove(h.mesh);
              slicedHalves.splice(i, 1);
            }
          }
        }
      }

      // Update Shockwave Rings
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.age += dt;
        const progress = Math.min(1, sw.age / sw.maxAge);
        const s = 0.5 + progress * sw.maxScale;
        sw.mesh.scale.setScalar(s);
        const mat = sw.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = (1 - progress) * 0.85;
        if (sw.age >= sw.maxAge) {
          scene.remove(sw.mesh);
          mat.dispose();
          shockwaves.splice(i, 1);
        }
      }

      // Update Directional Katana Slash Cleave Flashes
      for (let i = slashFlashes.length - 1; i >= 0; i--) {
        const sf = slashFlashes[i];
        sf.age += dt;
        const progress = Math.min(1, sf.age / sf.maxAge);
        sf.mesh.scale.set(0.75 + progress * 0.95, Math.max(0.05, 1 - progress), 1);
        const mat = sf.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = (1 - progress) * 0.95;
        if (sf.age >= sf.maxAge) {
          scene.remove(sf.mesh);
          mat.dispose();
          slashFlashes.splice(i, 1);
        }
      }

      // Update Pooled InstancedMesh Particles
      let activeParticleCount = 0;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i];
        if (p.active) {
          p.age += dt;
          if (p.age >= p.maxAge) {
            p.active = false;
            _dummyObj.position.set(0, -999, 0);
            _dummyObj.scale.setScalar(0.001);
            _dummyObj.updateMatrix();
            particleInstanced.setMatrixAt(i, _dummyObj.matrix);
          } else {
            p.position.addScaledVector(p.velocity, dt);
            p.velocity.y -= 11.0 * p.gravityScale * dt;
            const lifeRatio = 1 - p.age / p.maxAge;
            _dummyObj.position.copy(p.position);
            _dummyObj.rotation.set(p.age * 4, p.age * 6, 0);
            _dummyObj.scale.setScalar(p.size * lifeRatio);
            _dummyObj.updateMatrix();
            particleInstanced.setMatrixAt(i, _dummyObj.matrix);
            particleInstanced.setColorAt(i, p.color);
            activeParticleCount++;
          }
        } else {
          _dummyObj.position.set(0, -999, 0);
          _dummyObj.scale.setScalar(0.001);
          _dummyObj.updateMatrix();
          particleInstanced.setMatrixAt(i, _dummyObj.matrix);
        }
      }
      if (activeParticleCount > 0 || currentPhase === 'playing') {
        particleInstanced.instanceMatrix.needsUpdate = true;
        if (particleInstanced.instanceColor) {
          particleInstanced.instanceColor.needsUpdate = true;
        }
      }

      // Decaying Camera Shake & Damped Return to Base Position
      if (currentPhase !== 'title') {
        if (cameraShakeIntensity > 0.005) {
          camera.position.x =
            baseCamPos.x + (Math.random() - 0.5) * cameraShakeIntensity;
          camera.position.y =
            baseCamPos.y + (Math.random() - 0.5) * cameraShakeIntensity;
          cameraShakeIntensity = THREE.MathUtils.damp(
            cameraShakeIntensity,
            0,
            10,
            dt
          );
        } else {
          camera.position.x = THREE.MathUtils.damp(
            camera.position.x,
            baseCamPos.x,
            6,
            dt
          );
          camera.position.y = THREE.MathUtils.damp(
            camera.position.y,
            baseCamPos.y,
            6,
            dt
          );
          camera.position.z = THREE.MathUtils.damp(
            camera.position.z,
            baseCamPos.z,
            6,
            dt
          );
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full overflow-hidden z-0 cursor-crosshair touch-none"
      aria-label="Katana Nectar 3D Interactive Viewport"
    />
  );
};
