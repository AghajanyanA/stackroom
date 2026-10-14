import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Overlay } from "@/components/playground/toolbar";

const SceneCanvas = lazy(() => import("@/components/playground/scene"));

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);

  return (
    <main className="relative h-dvh w-full touch-none overflow-hidden bg-bg text-fg">
      <div className="absolute inset-0">
        {live ? (
          <Suspense fallback={null}>
            <SceneCanvas />
          </Suspense>
        ) : null}
      </div>
      <Overlay />
    </main>
  );
}
