import {
  ErrorComponent,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from "@tanstack/solid-router";
import type { ErrorComponentProps } from "@tanstack/solid-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export function DefaultCatchBoundary(props: ErrorComponentProps) {
  const router = useRouter();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });

  console.error("DefaultCatchBoundary Error:", props.error);

  return (
    <div class="py-10 sm:py-14">
      <div class="mx-auto max-w-2xl">
        <Card class="animate-paper-rise">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <span aria-hidden="true">⚠️</span>
              Something went wrong
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="rounded-2xl border border-border bg-card/40 p-4 text-sm">
              <ErrorComponent error={props.error} />
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => {
                  router.invalidate();
                }}
                class="ink-glow"
              >
                Try Again
              </Button>
              {isRoot() ? (
                <Link to="/">
                  <Button variant="outline">Home</Button>
                </Link>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    window.history.back();
                  }}
                >
                  Go Back
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
