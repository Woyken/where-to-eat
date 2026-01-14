import { Link } from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export function NotFound(props: { children?: JSX.Element }) {
  return (
    <div class="py-10 sm:py-14">
      <div class="mx-auto max-w-lg">
        <Card class="animate-paper-rise">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <span aria-hidden="true">🗺️</span>
              Not Found
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="text-sm text-muted-foreground">
              {props.children || <p>The page you are looking for does not exist.</p>}
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => window.history.back()}>
                Go back
              </Button>
              <Link to="/">
                <Button class="ink-glow">Start Over</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
