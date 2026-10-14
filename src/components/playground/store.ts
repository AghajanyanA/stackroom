import { create } from "zustand";

export type Kind = "sphere" | "box" | "cylinder";

export type BodySpec = {
  id: string;
  kind: Kind;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  lift: number;
  kick: boolean;
};

export const MAX_BODIES = 48;

const SETTINGS_KEY = "stackroom-settings";

type Settings = { gravity: number; restitution: number };

type StackState = {
  bodies: BodySpec[];
  gravity: number;
  restitution: number;
  dragId: string | null;
  viewToken: number;
  spawn: (kind: Kind) => void;
  dropTower: () => void;
  clear: () => void;
  remove: (id: string) => void;
  setGravity: (gravity: number) => void;
  setRestitution: (restitution: number) => void;
  setDragId: (id: string | null) => void;
  requestResetView: () => void;
  loadSettings: () => void;
};

function uid() {
  return crypto.randomUUID();
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function makeBody(
  kind: Kind,
  position: [number, number, number],
  rotation: [number, number, number],
  scale: number,
  lift: number,
  kick: boolean,
): BodySpec {
  return { id: uid(), kind, position, rotation, scale, lift, kick };
}

function randomDrop(kind: Kind): BodySpec {
  return makeBody(
    kind,
    [(Math.random() - 0.5) * 3.2, 4.4 + Math.random() * 2.2, (Math.random() - 0.5) * 3.2],
    [(Math.random() - 0.5) * 0.5, Math.random() * Math.PI, (Math.random() - 0.5) * 0.5],
    0.88 + Math.random() * 0.28,
    (Math.random() - 0.5) * 0.06,
    true,
  );
}

function makeTower(): BodySpec[] {
  const ox = (Math.random() - 0.5) * 1.4;
  const oz = (Math.random() - 0.5) * 1.4;
  const half = 0.4;
  const out: BodySpec[] = [];
  for (let i = 0; i < 6; i++) {
    const lean = (i - 2.5) * 0.04;
    out.push(
      makeBody(
        "box",
        [ox + lean, half + i * (half * 2 + 0.035) + 0.2, oz + lean * 0.35],
        [0.01 * i, i * 0.22, i > 4 ? 0.1 : 0.015],
        1,
        i % 2 === 0 ? 0.03 : -0.025,
        false,
      ),
    );
  }
  out.push(
    makeBody(
      "sphere",
      [ox + 0.06, half + 6 * (half * 2 + 0.035) + 0.55, oz],
      [0, 0, 0],
      0.96,
      0.02,
      false,
    ),
  );
  return out;
}

function createStarter(): BodySpec[] {
  const half = 0.4;
  const boxes = [0, 1, 2, 3].map((i) =>
    makeBody(
      "box",
      [i * 0.055, half + i * (half * 2 + 0.045), i * 0.03],
      [0.02, 0.18 * i, i === 3 ? 0.14 : 0.02],
      1,
      i % 2 === 0 ? 0.025 : -0.02,
      false,
    ),
  );
  return [
    ...boxes,
    makeBody("cylinder", [1.7, 1.35, 0.25], [1.05, 0.2, 0.35], 1, 0.01, false),
    makeBody("sphere", [-1.35, 2.6, 0.35], [0, 0, 0], 1.05, 0.02, false),
    makeBody("sphere", [0.15, 4.8, -0.1], [0, 0, 0], 0.92, -0.01, false),
  ];
}

function readSettings(): Settings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; gravity?: number; restitution?: number };
    if (parsed.v !== 1) return null;
    if (typeof parsed.gravity !== "number" || typeof parsed.restitution !== "number") return null;
    return {
      gravity: clamp(parsed.gravity, 0, 24),
      restitution: clamp(parsed.restitution, 0, 0.9),
    };
  } catch {
    return null;
  }
}

function writeSettings(gravity: number, restitution: number) {
  if (typeof window === "undefined") return;
  try {
    const payload: Settings & { v: number } = { v: 1, gravity, restitution };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
}

function trim(bodies: BodySpec[], dragId: string | null) {
  if (bodies.length <= MAX_BODIES) return { bodies, dragId };
  const next = bodies.slice(bodies.length - MAX_BODIES);
  const kept = new Set(next.map((body) => body.id));
  return { bodies: next, dragId: dragId && kept.has(dragId) ? dragId : null };
}

export const useStore = create<StackState>((set, get) => ({
  bodies: createStarter(),
  gravity: 9.8,
  restitution: 0.28,
  dragId: null,
  viewToken: 0,
  spawn: (kind) =>
    set((state) => {
      const added = trim([...state.bodies, randomDrop(kind)], state.dragId);
      return added;
    }),
  dropTower: () =>
    set((state) => trim([...state.bodies, ...makeTower()], state.dragId)),
  clear: () => set({ bodies: [], dragId: null }),
  remove: (id) =>
    set((state) => ({
      bodies: state.bodies.filter((body) => body.id !== id),
      dragId: state.dragId === id ? null : state.dragId,
    })),
  setGravity: (gravity) => {
    const next = clamp(gravity, 0, 24);
    writeSettings(next, get().restitution);
    set({ gravity: next });
  },
  setRestitution: (restitution) => {
    const next = clamp(restitution, 0, 0.9);
    writeSettings(get().gravity, next);
    set({ restitution: next });
  },
  setDragId: (dragId) => set({ dragId }),
  requestResetView: () => set((state) => ({ viewToken: state.viewToken + 1 })),
  loadSettings: () => {
    const saved = readSettings();
    if (!saved) return;
    set(saved);
  },
}));

declare global {
  interface Window {
    __stackroom?: {
      spawn: (kind: Kind) => void;
      clear: () => void;
      tower: () => void;
      setGravity: (gravity: number) => void;
      setRestitution: (restitution: number) => void;
      getState: () => { count: number; gravity: number; restitution: number; dragId: string | null };
    };
    __stackroomPose?: { dynamic: number; minY: number; maxY: number; dragging: boolean };
  }
}
