import { createRouter } from "@tanstack/solid-router";
import { DefaultCatchBoundary } from "./components/DefaultCatchBoundary";
import { NotFound } from "./components/NotFound";
import { routeTree } from "./routeTree.gen";

// Get the base path from Vite's import.meta.env
const basePath = import.meta.env.BASE_URL || "/";

export function getRouter() {
  const router = createRouter({
    routeTree,
    basepath: basePath,
    defaultPreload: "intent",
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
  });

  return router;
}

declare module "@tanstack/solid-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
