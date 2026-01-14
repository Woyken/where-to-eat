import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
import Sparkles from "lucide-solid/icons/sparkles";
import ArrowRight from "lucide-solid/icons/arrow-right";
import Calendar from "lucide-solid/icons/calendar";
import { createSignal, For, Show } from "solid-js";
import { useSettingsStorage } from "~/components/SettingsStorageProvider";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
  const [connectId, setConnectId] = createSignal("");
  const [connectionName, setConnectionName] = createSignal("");
  const [showConnectDialog, setShowConnectDialog] = createSignal(false);

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

  const deleteConnection = (id: string) => {
    settingsStorage.removeConnection(id);
  };

  const connections = () => settingsStorage.store.connections;

  return (
    <div class="min-h-[calc(100vh-theme(spacing.28))] py-12 px-4">
      <div class="max-w-3xl mx-auto space-y-8">
        {/* Hero Section */}
        <div class="text-center space-y-4 page-section">
          <h1 class="text-4xl md:text-5xl font-bold text-foreground leading-tight">
            Decide Where to Eat
          </h1>

          <p class="text-lg text-muted-foreground max-w-xl mx-auto">
            Spin the wheel with your team. Add restaurants, set preferences, and let the wheel pick for you.
          </p>
        </div>

        <div class="space-y-4">
          {/* Main Action Card */}
          <Card class="food-card page-section">
            <CardHeader class="pb-3">
              <Show
                when={connections().length > 0}
                fallback={
                  <>
                    <CardTitle class="text-xl">Get Started</CardTitle>
                    <CardDescription>
                      Create a new session to start making decisions together
                    </CardDescription>
                  </>
                }
              >
                <CardTitle class="text-xl">
                  Your Sessions
                </CardTitle>
                <CardDescription>
                  {connections().length} {connections().length === 1 ? 'session' : 'sessions'} available
                </CardDescription>
              </Show>
            </CardHeader>

            <Show
              when={connections().length > 0}
              fallback={
                <>
                  <CardContent class="space-y-4">
                    <TextField
                      id="connection-name-field"
                      value={connectionName()}
                      onChange={(e) => setConnectionName(e)}
                    >
                      <TextFieldLabel for="connection-name" class="text-sm font-medium">
                        Session name
                      </TextFieldLabel>
                      <TextFieldInput
                        type="text"
                        id="connection-name"
                        placeholder="e.g., Friday Lunch"
                        class="h-10"
                      />
                    </TextField>
                  </CardContent>
                  <CardFooter>
                    <Button
                      onClick={createFreshConnection}
                      class="w-full"
                      data-testid="start-fresh"
                    >
                      <Plus class="w-4 h-4" />
                      Create Session
                    </Button>
                  </CardFooter>
                </>
              }
            >
              <CardContent class="space-y-2">
                <For each={connections()}>
                  {(connection, index) => (
                    <div
                      class="food-list-item flex items-center justify-between"
                    >
                      <div class="flex items-center gap-3 min-w-0">
                        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span class="text-primary font-semibold text-sm">
                            {connection.settings.connection.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div class="min-w-0">
                          <h3 class="font-medium truncate">
                            {connection.settings.connection.name}
                          </h3>
                          <p class="text-xs text-muted-foreground flex items-center gap-1">
                            {connection.settings.eateries.filter(e => !e._deleted).length} restaurants
                            <span class="mx-1">·</span>
                            {new Date(
                              connection.settings.connection.updatedAt,
                            ).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div class="flex gap-1 flex-shrink-0">
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
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteConnection(connection.id)}
                          class="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 class="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </For>
              </CardContent>
            </Show>
          </Card>

          {/* Create New Wheel Card (shown when connections exist) */}
          <Show when={connections().length > 0}>
            <Card class="border border-dashed page-section">
              <CardContent class="pt-4">
                <div class="flex flex-col sm:flex-row gap-3">
                  <div class="flex-1">
                    <TextField
                      value={connectionName()}
                      onChange={(e) => setConnectionName(e)}
                    >
                      <TextFieldInput
                        type="text"
                        id="new-connection-name"
                        placeholder="New session name"
                        class="h-10"
                      />
                    </TextField>
                  </div>
                  <Button
                    onClick={createFreshConnection}
                    data-testid="start-fresh"
                  >
                    <Plus class="w-4 h-4" />
                    Create
                  </Button>
                </div>
              </CardContent>
            </Card>
          </Show>

          {/* Features Section */}
          <div class="grid sm:grid-cols-3 gap-3 pt-4 page-section">
            <div class="p-4 rounded-lg bg-muted/50 border border-border">
              <h3 class="font-medium text-sm mb-1">Weighted Random</h3>
              <p class="text-xs text-muted-foreground">Selection based on group preferences</p>
            </div>
            <div class="p-4 rounded-lg bg-muted/50 border border-border">
              <h3 class="font-medium text-sm mb-1">Real-time Sync</h3>
              <p class="text-xs text-muted-foreground">Collaborate with your team instantly</p>
            </div>
            <div class="p-4 rounded-lg bg-muted/50 border border-border">
              <h3 class="font-medium text-sm mb-1">Veto Option</h3>
              <p class="text-xs text-muted-foreground">Block restaurants you want to avoid</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
