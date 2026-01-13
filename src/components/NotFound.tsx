import { Link } from "@tanstack/solid-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export function NotFound(props: { children?: any }) {
  return (
    <div class="grid place-items-center py-16">
      <Card class="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Page not found</CardTitle>
        </CardHeader>
        <CardContent class="grid gap-4">
          <div class="text-sm text-muted-foreground">
            {props.children || <p>The page you are looking for does not exist.</p>}
          </div>

          <div class="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => window.history.back()}>
              Go back
            </Button>
            <Link to="/">
              <Button>Home</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
