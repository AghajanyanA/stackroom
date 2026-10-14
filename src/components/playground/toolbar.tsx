import { useEffect, useRef } from "react";
import * as Slider from "@radix-ui/react-slider";
import { Box, Circle, Cylinder, Layers, RotateCcw, Trash2 } from "lucide-react";
import { useStore, type Kind } from "@/components/playground/store";

const SHAPES: { kind: Kind; label: string; icon: typeof Circle; key: string }[] = [
  { kind: "sphere", label: "Sphere", icon: Circle, key: "1" },
  { kind: "box", label: "Box", icon: Box, key: "2" },
  { kind: "cylinder", label: "Cylinder", icon: Cylinder, key: "3" },
];

function Field({
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted">{display}</span>
      </span>
      <Slider.Root
        className="relative flex h-11 w-full touch-none items-center"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next);
        }}
      >
        <Slider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-elevated">
          <Slider.Range className="absolute h-full bg-fg" />
        </Slider.Track>
        <Slider.Thumb className="block size-5 rounded-full border border-border bg-accent shadow-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" />
      </Slider.Root>
    </label>
  );
}

function SpawnButton({
  kind,
  label,
  icon: Icon,
}: {
  kind: Kind;
  label: string;
  icon: typeof Circle;
}) {
  const spawn = useStore((state) => state.spawn);
  const timer = useRef<number | null>(null);

  const stop = () => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => stop, []);

  return (
    <button
      type="button"
      className="flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md border border-border bg-elevated text-fg hover:border-fg/30"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        spawn(kind);
        stop();
        timer.current = window.setInterval(() => spawn(kind), 190);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
    >
      <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

export function Overlay() {
  const count = useStore((state) => state.bodies.length);
  const gravity = useStore((state) => state.gravity);
  const restitution = useStore((state) => state.restitution);
  const setGravity = useStore((state) => state.setGravity);
  const setRestitution = useStore((state) => state.setRestitution);
  const clear = useStore((state) => state.clear);
  const dropTower = useStore((state) => state.dropTower);
  const requestResetView = useStore((state) => state.requestResetView);
  const loadSettings = useStore((state) => state.loadSettings);

  useEffect(() => {
    loadSettings();
    window.__stackroom = {
      spawn: (kind) => useStore.getState().spawn(kind),
      clear: () => useStore.getState().clear(),
      tower: () => useStore.getState().dropTower(),
      setGravity: (value) => useStore.getState().setGravity(value),
      setRestitution: (value) => useStore.getState().setRestitution(value),
      getState: () => {
        const state = useStore.getState();
        return {
          count: state.bodies.length,
          gravity: state.gravity,
          restitution: state.restitution,
          dragId: state.dragId,
        };
      },
    };
    return () => {
      delete window.__stackroom;
    };
  }, [loadSettings]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, [role='slider']")) return;
      if (event.code === "Digit1") useStore.getState().spawn("sphere");
      else if (event.code === "Digit2") useStore.getState().spawn("box");
      else if (event.code === "Digit3") useStore.getState().spawn("cylinder");
      else if (event.code === "KeyT" && !event.repeat) useStore.getState().dropTower();
      else if (event.code === "KeyC" && !event.repeat) useStore.getState().clear();
      else if (event.code === "KeyR" && !event.repeat) useStore.getState().requestResetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {count === 0 ? (
        <p className="pointer-events-none absolute inset-x-6 top-[28%] z-10 text-center text-sm text-muted md:top-[40%]">
          The room is empty.
        </p>
      ) : null}

      <aside className="panel-in absolute inset-x-3 bottom-3 z-10 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-panel md:inset-auto md:top-4 md:left-4 md:w-72">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-xl leading-tight font-medium tracking-tight md:text-2xl">
              Stackroom
            </h1>
            <p className="mt-1 hidden text-sm text-muted md:block">Drop, stack, and throw.</p>
          </div>
          <button
            type="button"
            className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-elevated text-fg hover:border-fg/30"
            aria-label="Reset view"
            onClick={requestResetView}
          >
            <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="flex gap-2">
          {SHAPES.map((shape) => (
            <SpawnButton key={shape.kind} kind={shape.kind} label={shape.label} icon={shape.icon} />
          ))}
        </div>

        <Field
          label="Gravity"
          display={gravity.toFixed(1)}
          value={gravity}
          min={0}
          max={24}
          step={0.1}
          onChange={setGravity}
        />
        <Field
          label="Bounce"
          display={`${Math.round(restitution * 100)}%`}
          value={restitution}
          min={0}
          max={0.9}
          step={0.01}
          onChange={setRestitution}
        />

        <div className="flex gap-2">
          <button
            type="button"
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-border bg-elevated text-sm font-medium hover:border-fg/30"
            onClick={dropTower}
          >
            <Layers className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Tower
          </button>
          <button
            type="button"
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-accent-fg disabled:opacity-40"
            onClick={clear}
            disabled={count === 0}
          >
            <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Clear
          </button>
        </div>

        <p className="flex items-baseline justify-between gap-3 text-xs text-muted">
          <span className="tabular-nums">{count} in the room</span>
          <span className="text-right">
            <span className="md:hidden">Drag a shape. Swipe empty space to look.</span>
            <span className="hidden md:inline">Drag a shape to throw it. 1–3 drop, C clears.</span>
          </span>
        </p>
      </aside>
    </>
  );
}
