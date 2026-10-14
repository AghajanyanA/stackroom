import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import {
  BallCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import * as THREE from "three";
import { useStore, type BodySpec, type Kind } from "@/components/playground/store";

const MAT: Record<Kind, { color: string; metalness: number; roughness: number }> = {
  sphere: { color: "#d5dde4", metalness: 0.72, roughness: 0.22 },
  box: { color: "#d9d4cb", metalness: 0.04, roughness: 0.78 },
  cylinder: { color: "#8b98a3", metalness: 0.48, roughness: 0.36 },
};

const STIFFNESS = 16;
const MAX_SPEED = 8;
const FOLLOW = 0.72;

const _q = new THREE.Quaternion();
const _hit = new THREE.Vector3();
const _anchor = new THREE.Vector3();
const _target = new THREE.Vector3();
const _vel = { x: 0, y: 0, z: 0 };
const _ang = { x: 0, y: 0, z: 0 };

type Rig = {
  enabled: boolean;
  target: THREE.Vector3;
  update: () => void;
};

function metrics(kind: Kind, scale: number) {
  if (kind === "sphere") return { radius: 0.42 * scale };
  if (kind === "box") return { half: 0.4 * scale };
  return { radius: 0.34 * scale, halfHeight: 0.46 * scale };
}

function RoomColliders({ restitution }: { restitution: number }) {
  return (
    <RigidBody type="fixed" colliders={false} friction={1} restitution={restitution}>
      <CuboidCollider
        args={[5.5, 0.25, 5.5]}
        position={[0, -0.25, 0]}
        friction={1}
        restitution={restitution}
      />
      <CuboidCollider
        args={[5.8, 3.2, 0.3]}
        position={[0, 3.2, -5.5]}
        friction={0.25}
        restitution={restitution}
      />
      <CuboidCollider
        args={[5.8, 3.2, 0.3]}
        position={[0, 3.2, 5.5]}
        friction={0.25}
        restitution={restitution}
      />
      <CuboidCollider
        args={[0.3, 3.2, 5.8]}
        position={[-5.5, 3.2, 0]}
        friction={0.25}
        restitution={restitution}
      />
      <CuboidCollider
        args={[0.3, 3.2, 5.8]}
        position={[5.5, 3.2, 0]}
        friction={0.25}
        restitution={restitution}
      />
    </RigidBody>
  );
}

function ShapeBody({ spec, restitution }: { spec: BodySpec; restitution: number }) {
  const ref = useRef<RapierRigidBody>(null);
  const culled = useRef(false);
  const active = useStore((state) => state.dragId === spec.id);
  const size = metrics(spec.kind, spec.scale);
  const color = useMemo(() => {
    const next = new THREE.Color(MAT[spec.kind].color);
    next.offsetHSL(0, 0, spec.lift);
    return `#${next.getHexString()}`;
  }, [spec.kind, spec.lift]);

  useEffect(() => {
    const body = ref.current;
    if (!body) return;
    body.userData = { id: spec.id };
    if (!spec.kick) return;
    body.setLinvel(
      {
        x: (Math.random() - 0.5) * 0.6,
        y: -0.4,
        z: (Math.random() - 0.5) * 0.6,
      },
      true,
    );
  }, [spec.id, spec.kick]);

  useFrame(() => {
    const body = ref.current;
    if (!body || culled.current || !body.isValid()) return;
    const pos = body.translation();
    if (pos.y < -3 || Math.abs(pos.x) > 18 || Math.abs(pos.z) > 18) {
      culled.current = true;
      if (useStore.getState().dragId === spec.id) useStore.getState().setDragId(null);
      useStore.getState().remove(spec.id);
    }
  });

  return (
    <RigidBody
      ref={ref}
      position={spec.position}
      rotation={spec.rotation}
      colliders={false}
      ccd
      canSleep
      linearDamping={0.06}
      angularDamping={0.14}
      additionalSolverIterations={4}
    >
      {spec.kind === "sphere" && "radius" in size ? (
        <BallCollider args={[size.radius]} restitution={restitution} friction={0.72} />
      ) : null}
      {spec.kind === "box" && "half" in size ? (
        <CuboidCollider args={[size.half, size.half, size.half]} restitution={restitution} friction={0.86} />
      ) : null}
      {spec.kind === "cylinder" && "halfHeight" in size ? (
        <CylinderCollider
          args={[size.halfHeight, size.radius]}
          restitution={restitution}
          friction={0.7}
        />
      ) : null}
      <mesh castShadow receiveShadow>
        {spec.kind === "sphere" && "radius" in size ? (
          <sphereGeometry args={[size.radius, 28, 20]} />
        ) : null}
        {spec.kind === "box" && "half" in size ? (
          <boxGeometry args={[size.half * 2, size.half * 2, size.half * 2]} />
        ) : null}
        {spec.kind === "cylinder" && "halfHeight" in size ? (
          <cylinderGeometry args={[size.radius, size.radius, size.halfHeight * 2, 24]} />
        ) : null}
        <meshStandardMaterial
          color={color}
          metalness={MAT[spec.kind].metalness}
          roughness={MAT[spec.kind].roughness}
          emissive={active ? "#d5dde6" : "#000000"}
          emissiveIntensity={active ? 0.28 : 0}
        />
      </mesh>
    </RigidBody>
  );
}

function DragControls() {
  const { rapier, world } = useRapier();
  const { camera, raycaster, gl } = useThree();
  const getControls = useThree((state) => state.get);
  const dragBody = useRef<RapierRigidBody | null>(null);
  const localAnchor = useRef({ x: 0, y: 0, z: 0 });
  const grabDist = useRef(6);
  const ndc = useRef(new THREE.Vector2());
  const rayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);

  if (!rayRef.current) {
    rayRef.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
  }

  const rig = () => getControls().controls as Rig | null;

  useBeforePhysicsStep(() => {
    const body = dragBody.current;
    if (!body) return;
    if (!body.isValid()) {
      dragBody.current = null;
      const controls = rig();
      if (controls) controls.enabled = true;
      return;
    }
    if (useStore.getState().dragId === null) {
      dragBody.current = null;
      const controls = rig();
      if (controls) controls.enabled = true;
      return;
    }

    raycaster.setFromCamera(ndc.current, camera);
    _target
      .copy(raycaster.ray.origin)
      .addScaledVector(raycaster.ray.direction, grabDist.current);
    _target.x = THREE.MathUtils.clamp(_target.x, -4.9, 4.9);
    _target.y = THREE.MathUtils.clamp(_target.y, 0.25, 8);
    _target.z = THREE.MathUtils.clamp(_target.z, -4.9, 4.9);

    const translation = body.translation();
    const rotation = body.rotation();
    _q.set(rotation.x, rotation.y, rotation.z, rotation.w);
    _anchor.set(localAnchor.current.x, localAnchor.current.y, localAnchor.current.z).applyQuaternion(_q);
    _anchor.x += translation.x;
    _anchor.y += translation.y;
    _anchor.z += translation.z;

    const dx = _target.x - _anchor.x;
    const dy = _target.y - _anchor.y;
    const dz = _target.z - _anchor.z;
    const dist = Math.hypot(dx, dy, dz);
    let sx = 0;
    let sy = 0;
    let sz = 0;
    if (dist > 1e-5) {
      const speed = Math.min(dist * STIFFNESS, MAX_SPEED);
      const inv = speed / dist;
      sx = dx * inv;
      sy = dy * inv;
      sz = dz * inv;
    }
    const lin = body.linvel();
    _vel.x = lin.x + (sx - lin.x) * FOLLOW;
    _vel.y = lin.y + (sy - lin.y) * FOLLOW;
    _vel.z = lin.z + (sz - lin.z) * FOLLOW;
    body.setLinvel(_vel, true);
    const ang = body.angvel();
    _ang.x = ang.x * 0.9;
    _ang.y = ang.y * 0.9;
    _ang.z = ang.z * 0.9;
    body.setAngvel(_ang, true);
  });

  useEffect(() => {
    const el = gl.domElement;
    const ray = rayRef.current;
    if (!ray) return;

    const setNdc = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      ndc.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
    };

    const castDynamic = () => {
      raycaster.setFromCamera(ndc.current, camera);
      const origin = raycaster.ray.origin;
      const dir = raycaster.ray.direction;
      ray.origin.x = origin.x;
      ray.origin.y = origin.y;
      ray.origin.z = origin.z;
      ray.dir.x = dir.x;
      ray.dir.y = dir.y;
      ray.dir.z = dir.z;
      return world.castRay(
        ray,
        80,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        (collider) => {
          const parent = collider.parent();
          return !!parent && parent.bodyType() === rapier.RigidBodyType.Dynamic;
        },
      );
    };

    const release = () => {
      if (!dragBody.current && useStore.getState().dragId === null) return;
      dragBody.current = null;
      const controls = rig();
      if (controls) controls.enabled = true;
      document.body.style.cursor = "";
      useStore.getState().setDragId(null);
    };

    const onMove = (event: PointerEvent) => {
      setNdc(event);
      if (dragBody.current) {
        document.body.style.cursor = "grabbing";
        return;
      }
      const hit = castDynamic();
      el.style.cursor = hit ? "grab" : "";
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      setNdc(event);
      const hit = castDynamic();
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      const body = hit.collider.parent();
      if (!body) return;
      const point = ray.pointAt(hit.timeOfImpact);
      _hit.set(point.x, point.y, point.z);
      grabDist.current = raycaster.ray.origin.distanceTo(_hit);
      const translation = body.translation();
      const rotation = body.rotation();
      _q.set(rotation.x, rotation.y, rotation.z, rotation.w).invert();
      _anchor.set(point.x - translation.x, point.y - translation.y, point.z - translation.z);
      _anchor.applyQuaternion(_q);
      localAnchor.current = { x: _anchor.x, y: _anchor.y, z: _anchor.z };
      dragBody.current = body;
      body.wakeUp();
      const id = (body.userData as { id?: string } | undefined)?.id ?? null;
      useStore.getState().setDragId(id);
      const controls = rig();
      if (controls) controls.enabled = false;
      document.body.style.cursor = "grabbing";
      el.setPointerCapture(event.pointerId);
    };

    const onUp = () => release();

    el.addEventListener("pointerdown", onDown, { capture: true });
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown, { capture: true });
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      const controls = rig();
      if (controls) controls.enabled = true;
    };
  }, [camera, gl, rapier, raycaster, world]);

  return null;
}

function PoseProbe() {
  const { world, rapier } = useRapier();
  useFrame(() => {
    let dynamic = 0;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    world.forEachRigidBody((body) => {
      if (body.bodyType() !== rapier.RigidBodyType.Dynamic) return;
      dynamic += 1;
      const y = body.translation().y;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
    window.__stackroomPose = {
      dynamic,
      minY: dynamic ? minY : 0,
      maxY: dynamic ? maxY : 0,
      dragging: useStore.getState().dragId !== null,
    };
  });
  return null;
}

function CameraReset() {
  const token = useStore((state) => state.viewToken);
  const seen = useRef<number | null>(null);
  const camera = useThree((state) => state.camera);
  const get = useThree((state) => state.get);

  const frame = () => {
    camera.position.set(8.4, 6.4, 8.4);
    const controls = get().controls as Rig | null;
    if (!controls) return false;
    controls.target.set(0, 1.15, 0);
    controls.update();
    return true;
  };

  useFrame(() => {
    if (seen.current !== null) return;
    if (frame()) seen.current = token;
  });

  useEffect(() => {
    if (seen.current === null || seen.current === token) return;
    if (frame()) seen.current = token;
  }, [token]);

  return null;
}

function Simulation() {
  const bodies = useStore((state) => state.bodies);
  const restitution = useStore((state) => state.restitution);
  const gravity = useStore((state) => state.gravity);

  return (
    <Physics
      gravity={[0, -gravity, 0]}
      timeStep={1 / 60}
      numSolverIterations={8}
      numInternalPgsIterations={2}
    >
      <RoomColliders restitution={restitution} />
      {bodies.map((spec) => (
        <ShapeBody key={spec.id} spec={spec} restitution={restitution} />
      ))}
      <DragControls />
      <PoseProbe />
    </Physics>
  );
}

function Stage() {
  return (
    <>
      <color attach="background" args={["#101011"]} />
      <fog attach="fog" args={["#101011", 16, 38]} />
      <hemisphereLight args={["#e6e8ec", "#16161a", 0.55]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        position={[7.5, 14, 5.5]}
        intensity={2.7}
        color="#f6f4f0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={2}
        shadow-camera-far={36}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-bias={-0.00025}
        shadow-normalBias={0.04}
      />
      <directionalLight position={[-8, 6, -5]} intensity={0.55} color="#c9d3df" />

      <mesh position={[0, -0.2, 0]} receiveShadow>
        <boxGeometry args={[11, 0.4, 11]} />
        <meshStandardMaterial color="#1e1e24" roughness={0.94} metalness={0.02} />
      </mesh>
      {(
        [
          [0, 0.06, -5.44, 11, 0.12, 0.12],
          [0, 0.06, 5.44, 11, 0.12, 0.12],
          [-5.44, 0.06, 0, 0.12, 0.12, 11],
          [5.44, 0.06, 0, 0.12, 0.12, 11],
        ] as const
      ).map((box) => (
        <mesh key={box.join()} position={[box[0], box[1], box[2]]} receiveShadow castShadow>
          <boxGeometry args={[box[3], box[4], box[5]]} />
          <meshStandardMaterial color="#3a3a42" roughness={0.82} metalness={0.08} />
        </mesh>
      ))}
      <Grid
        args={[11, 11]}
        position={[0, 0.02, 0]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#3a3a44"
        sectionSize={2}
        sectionThickness={1.15}
        sectionColor="#8e96a1"
        fadeDistance={16}
        fadeStrength={1.5}
        fadeFrom={0}
        infiniteGrid={false}
        raycast={() => null}
      />

      <Suspense fallback={null}>
        <Simulation />
      </Suspense>

      <OrbitControls
        makeDefault
        enableDamping
        enablePan={false}
        dampingFactor={0.12}
        rotateSpeed={0.85}
        minDistance={5}
        maxDistance={16}
        minPolarAngle={0.18}
        maxPolarAngle={Math.PI / 2.05}
      />
      <CameraReset />
    </>
  );
}

export default function SceneCanvas() {
  return (
    <Canvas
      className="h-full w-full"
      shadows
      dpr={[1, 1.6]}
      camera={{ position: [8.4, 6.4, 8.4], fov: 40, near: 0.1, far: 80 }}
      gl={{ antialias: true, alpha: false, stencil: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.05;
      }}
    >
      <Stage />
    </Canvas>
  );
}
