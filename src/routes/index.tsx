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
    <div class="min-h-[calc(100vh-theme(spacing.32))] py-8 px-4">
      <div class="max-w-4xl mx-auto space-y-8">
        {/* Hero Section */}
        <div class="text-center space-y-6 page-section">
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Sparkles class="w-4 h-4" />
            <span>Collaborative Decision Making</span>
          </div>
          
          <h1 class="text-5xl md:text-6xl font-display text-primary leading-tight">
            Can't Decide<br />Where to Eat?
          </h1>
          
          <p class="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Spin the wheel with friends and let fate decide! Add your favorite restaurants, 
            rate them, and watch the wheel pick your next delicious adventure.
          </p>

          {/* Floating Food Emojis */}
          <div class="flex justify-center gap-4 text-4xl py-4">
            <span class="animate-float" style="animation-delay: 0s;">🍕</span>
            <span class="animate-float" style="animation-delay: 0.2s;">🍔</span>
            <span class="animate-float" style="animation-delay: 0.4s;">🌮</span>
            <span class="animate-float" style="animation-delay: 0.6s;">🍜</span>
            <span class="animate-float" style="animation-delay: 0.8s;">🍣</span>
            <span class="animate-float" style="animation-delay: 1s;">🥗</span>
          </div>
        </div>

        <div class="space-y-6">
          {/* Main Action Card */}
          <Card class="food-card border-2 border-primary/10 overflow-visible page-section">
            <CardHeader class="text-center pb-2">
              <Show
                when={connections().length > 0}
                fallback={
                  <>
                    <div class="mx-auto w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-4 shadow-food">
                      <span class="text-3xl">🎡</span>
                    </div>
                    <CardTitle class="text-2xl">Create Your First Wheel!</CardTitle>
                    <CardDescription class="text-base">
                      Start a new wheel and invite friends to join the fun
                    </CardDescription>
                  </>
                }
              >
                <CardTitle class="text-2xl flex items-center justify-center gap-2">
                  <span class="text-2xl">🎯</span>
                  Your Wheels
                </CardTitle>
                <CardDescription class="text-base">
                  {connections().length} {connections().length === 1 ? 'wheel' : 'wheels'} ready to spin
                </CardDescription>
              </Show>
            </CardHeader>

            <Show
              when={connections().length > 0}
              fallback={
                <>
                  <CardContent class="space-y-4 pt-4">
                    <TextField
                      id="connection-name-field"
                      value={connectionName()}
                      onChange={(e) => setConnectionName(e)}
                    >
                      <TextFieldLabel for="connection-name" class="text-base font-medium">
                        Give your wheel a name
                      </TextFieldLabel>
                      <TextFieldInput
                        type="text"
                        id="connection-name"
                        placeholder="e.g., Friday Lunch Gang 🍕"
                        class="h-12 text-base rounded-xl"
                      />
                    </TextField>
                  </CardContent>
                  <CardFooter class="pt-2 pb-6">
                    <Button
                      onClick={createFreshConnection}
                      class="w-full h-14 text-lg btn-glow"
                      data-testid="start-fresh"
                    >
                      <Plus class="w-5 h-5" />
                      Create New Wheel
                      <ArrowRight class="w-5 h-5 ml-auto" />
                    </Button>
                  </CardFooter>
                </>
              }
            >
              <CardContent class="space-y-3 pt-2">
                <For each={connections()}>
                  {(connection, index) => (
                    <div 
                      class="food-list-item flex items-center justify-between animate-slide-up"
                      style={`animation-delay: ${index() * 0.05}s`}
                    >
                      <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-2xl">
                          🎡
                        </div>
                        <div>
                          <h3 class="font-semibold text-lg">
                            {connection.settings.connection.name}
                          </h3>
                          <p class="text-sm text-muted-foreground flex items-center gap-1">
                            <Calendar class="w-3 h-3" />
                            {new Date(
                              connection.settings.connection.updatedAt,
                            ).toLocaleDateString()}
                            <span class="mx-1">•</span>
                            {connection.settings.eateries.filter(e => !e._deleted).length} places
                          </p>
                        </div>
                      </div>
                      <div class="flex gap-2">
                        <Link
                          to="/wheel/$connectionId"
                          params={{ connectionId: connection.id }}
                        >
                          <Button
                            onclick={() => {
                              localStorage.setItem(
                                "lastUsedConnectionId",
                                connection.id,
                              );
                            }}
                            class="gap-2"
                          >
                            <span>Spin</span>
                            <ArrowRight class="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteConnection(connection.id)}
                          class="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
            <Card class="food-card border-2 border-dashed border-primary/20 bg-primary/5 page-section">
              <CardHeader class="pb-2">
                <CardTitle class="text-lg flex items-center gap-2">
                  <Plus class="w-5 h-5 text-primary" />
                  Create Another Wheel
                </CardTitle>
              </CardHeader>
              <CardContent class="pt-0">
                <div class="flex flex-col sm:flex-row gap-3">
                  <div class="flex-1">
                    <TextField
                      value={connectionName()}
                      onChange={(e) => setConnectionName(e)}
                    >
                      <TextFieldInput
                        type="text"
                        id="new-connection-name"
                        placeholder="Wheel name (optional)"
                        class="h-11 rounded-xl"
                      />
                    </TextField>
                  </div>
                  <Button
                    onClick={createFreshConnection}
                    data-testid="start-fresh"
                    class="h-11"
                  >
                    <Plus class="w-4 h-4" />
                    Create
                  </Button>
                </div>
              </CardContent>
            </Card>
          </Show>

          {/* Features Section */}
          <div class="grid sm:grid-cols-3 gap-4 pt-4 page-section">
            <div class="text-center p-6 rounded-2xl bg-card border border-border shadow-card">
              <div class="text-4xl mb-3">🎲</div>
              <h3 class="font-semibold mb-1">Fair & Random</h3>
              <p class="text-sm text-muted-foreground">Weighted by everyone's preferences</p>
            </div>
            <div class="text-center p-6 rounded-2xl bg-card border border-border shadow-card">
              <div class="text-4xl mb-3">👥</div>
              <h3 class="font-semibold mb-1">Real-time Sync</h3>
              <p class="text-sm text-muted-foreground">Collaborate with friends instantly</p>
            </div>
            <div class="text-center p-6 rounded-2xl bg-card border border-border shadow-card">
              <div class="text-4xl mb-3">🚫</div>
              <h3 class="font-semibold mb-1">Veto Power</h3>
              <p class="text-sm text-muted-foreground">Block places you can't stand</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
