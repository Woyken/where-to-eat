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
    <div class="grid place-items-center py-16">
      <Card class="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent class="grid gap-6">
          <div class="rounded-lg border bg-card p-4 text-sm">
            <ErrorComponent error={props.error} />
          </div>

          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                router.invalidate();
              }}
            >
              Try again
            </Button>
            {isRoot() ? (
              <Link to="/">
                <Button>Home</Button>
              </Link>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => window.history.back()}
              >
                Go back
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
