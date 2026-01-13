import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
import { createSignal, For, Show } from "solid-js";
import { useSettingsStorage } from "~/components/SettingsStorageProvider";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [connectionName, setConnectionName] = createSignal("");

  const settingsStorage = useSettingsStorage();

  const createFreshConnection = () => {
    console.log("createFreshConnection called");
    try {
      const trimmedName = connectionName().trim();
      const newId = settingsStorage.addNewConnection(
        trimmedName ||
          `Connection ${settingsStorage.store.connections.length + 1}`,
      );
      console.log("Created connection", newId);

      setConnectionName("");

      router.navigate({
        to: "/wheel/$connectionId",
        params: {
          connectionId: newId,
        },
      });
      console.log("Navigating to wheel");
    } catch (e) {
      console.error("Error creating connection", e);
    }
  };

  const router = useRouter();

  // const connectToExisting = () => {
  //   if (!connectId().trim()) return;

  //   // Check if settings exist for this ID
  //   const existingSettings = localStorage.getItem(
  //     `eatery-settings-${connectId()}`,
  //   );
  //   if (!existingSettings) {
  //     alert("No settings found for this connection ID");
  //     return;
  //   }

  //   // Add to connections if not already there
  //   const existingConnection = connections().find((c) => c.id === connectId());
  //   if (!existingConnection) {
  //     const newConnection: Connection = {
  //       id: connectId(),
  //       name: connectionName() || `Connected ${connections().length + 1}`,
  //       updatedAt: Date.now(),
  //     };
  //     const newConnections = [...connections(), newConnection];
  //     saveConnections(newConnections);
  //   }

  //   // Redirect to wheel page
  //   router.navigate({
  //     to: "/wheel/$connectionId",
  //     params: { connectionId: connectId() },
  //   });
  // };

  const deleteConnection = (id: string) => {
    settingsStorage.removeConnection(id);
  };

  const connections = () => settingsStorage.store.connections;

  return (
    <div class="grid gap-8">
      <div class="grid gap-3">
        <h1 class="text-4xl font-semibold tracking-tight">Where to eat</h1>
        <p class="text-muted-foreground">
          Create a shared room, rate places, then spin the wheel together.
        </p>
      </div>

      <div class="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card class="overflow-hidden">
          <CardHeader class="border-b">
            <CardTitle>Start a new room</CardTitle>
            <CardDescription>
              Pick a name now, or rename later in settings.
            </CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4 pt-6">
            <TextField value={connectionName()} onChange={(e) => setConnectionName(e)}>
              <TextFieldLabel for="connection-name">Room name</TextFieldLabel>
              <TextFieldInput
                type="text"
                id="connection-name"
                placeholder="Friday lunch crew"
                autocomplete="off"
              />
            </TextField>

            <Button
              onClick={createFreshConnection}
              class="w-full"
              data-testid="start-fresh"
            >
              <Plus class="mr-2 size-4" />
              Create & open
            </Button>

            <div class="text-xs text-muted-foreground">
              Tip: share the room from the wheel screen.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="border-b">
            <CardTitle>Your rooms</CardTitle>
            <CardDescription>
              Continue where you left off.
            </CardDescription>
          </CardHeader>

          <CardContent class="grid gap-3 pt-6">
            <Show
              when={connections().length > 0}
              fallback={
                <div class="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                  No rooms yet. Create one to begin.
                </div>
              }
            >
              <For each={connections()}>
                {(connection) => (
                  <div class="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div class="min-w-0">
                      <div class="truncate text-base font-medium">
                        {connection.settings.connection.name}
                      </div>
                      <div class="text-sm text-muted-foreground">
                        Updated{" "}
                        {new Date(
                          connection.settings.connection.updatedAt,
                        ).toLocaleDateString()}
                      </div>
                    </div>

                    <div class="flex gap-2">
                      <Link
                        to="/wheel/$connectionId"
                        params={{ connectionId: connection.id }}
                      >
                        <Button
                          size="sm"
                          onclick={() => {
                            localStorage.setItem(
                              "lastUsedConnectionId",
                              connection.id,
                            );
                          }}
                        >
                          Open
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteConnection(connection.id)}
                        title="Remove from this browser"
                      >
                        <Trash2 class="size-4" />
                        <span class="sr-only">Delete</span>
                      </Button>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
