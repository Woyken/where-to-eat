import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import Ban from "lucide-solid/icons/ban";
import Home from "lucide-solid/icons/home";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Save from "lucide-solid/icons/save";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { useSettingsStorage } from "~/components/SettingsStorageProvider";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import type { StorageSchemaType } from "~/utils/jsonStorage";
import { usePeer2Peer } from "~/utils/peer2peerSharing";

export const Route = createFileRoute("/settings/$connectionId")({
  component: SettingsPage,
});

function SettingsPage() {
  const connectionId = Route.useParams({ select: (p) => p.connectionId });
  const router = useRouter();

  const [connectionName, setConnectionName] = createSignal("");

  const [newEateryName, setNewEateryName] = createSignal("");
  const [newEateryCuisine, setNewEateryCuisine] = createSignal("");
  const [newUserName, setNewUserName] = createSignal("");
  const [showAddEatery, setShowAddEatery] = createSignal(false);
  const [showAddUser, setShowAddUser] = createSignal(false);

  const settingsStorage = useSettingsStorage();
  const peer = usePeer2Peer();

  const currentConnection = createMemo(() =>
    settingsStorage.store.connections.find((x) => x.id === connectionId()),
  );

  createEffect(() => {
    const conn = currentConnection();
    if (!conn) return;
    setConnectionName(conn.settings.connection.name ?? "");
  });

  const activeEateries = createMemo(
    () =>
      currentConnection()?.settings.eateries.filter((x) => !x._deleted) ?? [],
  );
  const activeUsers = createMemo(
    () => currentConnection()?.settings.users.filter((x) => !x._deleted) ?? [],
  );

  // Redirect if connection not found
  createEffect(() => {
    const conn = currentConnection();
    if (conn === undefined) {
      console.log("settings: redirecting - connection not found");
      router.navigate({ to: "/", replace: true });
    } else {
      console.log("settings: loaded connection", {
        id: conn.id,
        users: conn.settings.users.length,
        activeUsers: activeUsers().length,
        eateries: conn.settings.eateries.length,
        activeEateries: activeEateries().length,
      });
    }
  });

  const [selectedUser, setSelectedUser] = createSignal<
    StorageSchemaType["settings"]["users"][0] | undefined
  >(currentConnection()?.settings.users[0]);

  const addEatery = () => {
    if (!newEateryName().trim()) return;

    const { eateryId: newEateryId, createdScores } = settingsStorage.addEatery(
      connectionId(),
      newEateryName().trim(),
    );

    setNewEateryName("");
    setNewEateryCuisine("");
    setShowAddEatery(false);

    const newEatery = currentConnection()?.settings.eateries.find(
      (x) => x.id === newEateryId,
    );
    if (!newEatery) return;

    peer.broadcast({
      type: "updated-eatery",
      data: {
        connectionId: connectionId(),
        eatery: newEatery,
      },
    });

    // When adding a new eatery, initialize scores for all existing users.
    for (const eateryScore of createdScores) {
      peer.broadcast({
        type: "updated-eateryScore",
        data: {
          connectionId: connectionId(),
          eateryScore,
        },
      });
    }
  };

  const removeEatery = (id: string) => {
    settingsStorage.removeEatery(connectionId(), id);
    peer.broadcast({
      type: "removed-eatery",
      data: {
        connectionId: connectionId(),
        eateryId: id,
      },
    });
  };

  const addUser = () => {
    if (!newUserName().trim()) return;

    const newUserId = settingsStorage.addUser(
      connectionId(),
      newUserName().trim(),
      undefined,
    );

    setNewUserName("");
    setShowAddUser(false);
    const newUser = currentConnection()?.settings.users.find(
      (x) => x.id === newUserId,
    );
    setSelectedUser(newUser);
    if (newUser) {
      peer.broadcast({
        type: "updated-user",
        data: {
          connectionId: connectionId(),
          user: newUser,
        },
      });
    }
  };

  const removeUser = (id: string) => {
    settingsStorage.removeUser(connectionId(), id);
    const users = currentConnection()?.settings.users;
    if (selectedUser()?.id === id && users && users.length !== 0) {
      setSelectedUser(users[0]);
    }
    peer.broadcast({
      type: "removed-user",
      data: {
        connectionId: connectionId(),
        userId: id,
      },
    });
  };

  const updateUserScore = (userId: string, eateryId: string, score: number) => {
    settingsStorage.updateScore(connectionId(), userId, eateryId, score);
    peer.broadcast({
      type: "updated-eateryScore",
      data: {
        connectionId: connectionId(),
        eateryScore: {
          eateryId,
          userId,
          score,
          updatedAt: Date.now(),
        },
      },
    });
  };

  const selectedUserScores = createMemo(() =>
    currentConnection()?.settings.eateryScores.filter(
      (x) => x.userId === selectedUser()?.id,
    ),
  );

  const activeVetoes = createMemo(() =>
    (currentConnection()?.settings.eateryVetoes ?? []).filter(
      (x) => !x._deleted,
    ),
  );

  const isEateryVetoed = (userId: string, eateryId: string) =>
    activeVetoes().some((v) => v.userId === userId && v.eateryId === eateryId);

  const toggleVeto = (userId: string, eateryId: string) => {
    const veto = settingsStorage.toggleVeto(connectionId(), userId, eateryId);
    if (veto) {
      peer.broadcast({
        type: "updated-eateryVeto",
        data: {
          connectionId: connectionId(),
          eateryVeto: veto,
        },
      });
    }
  };

  const saveConnectionName = () => {
    const nextName = connectionName().trim();
    const conn = currentConnection();
    if (!conn) return;
    if (!nextName) return;
    if (nextName === conn.settings.connection.name) return;

    const updatedAt = Date.now();
    settingsStorage.updateConnection(connectionId(), nextName, updatedAt);
    peer.broadcast({
      type: "updated-connection",
      data: {
        connectionId: connectionId(),
        connection: {
          name: nextName,
          updatedAt,
        },
      },
    });
  };

  return (
    <Show when={currentConnection()} fallback={null}>
      <div class="py-6 px-4">
        <div class="max-w-5xl mx-auto space-y-6">
          {/* Page Header */}
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 page-section">
            <div>
              <h1 class="text-3xl font-bold flex items-center gap-3">
                <span class="text-3xl">⚙️</span>
                Settings
              </h1>
              <p class="text-muted-foreground mt-1">
                Manage restaurants, users, and preferences
              </p>
            </div>
            <div class="flex gap-2">
              <Link
                to="/wheel/$connectionId"
                params={{ connectionId: connectionId() }}
              >
                <Button variant="outline" size="sm" class="gap-2">
                  <ArrowLeft class="w-4 h-4" />
                  Back to Wheel
                </Button>
              </Link>
              <Link to="/">
                <Button variant="ghost" size="sm" class="gap-2">
                  <Home class="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Connection Name Card */}
          <Card class="food-card border-2 page-section">
            <CardHeader class="pb-3">
              <CardTitle class="flex items-center gap-2 text-lg">
                <span class="text-xl">📝</span>
                Wheel Name
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div class="flex-1">
                  <TextField
                    value={connectionName()}
                    onChange={(e) => setConnectionName(e)}
                  >
                    <TextFieldLabel for="connection-name" class="text-sm font-medium">Name</TextFieldLabel>
                    <TextFieldInput
                      type="text"
                      id="connection-name"
                      placeholder="Friday Lunch Gang 🍕"
                      class="h-11 rounded-xl"
                      data-testid="connection-name-input"
                    />
                  </TextField>
                </div>
                <Button
                  onClick={saveConnectionName}
                  data-testid="connection-name-save"
                  class="gap-2"
                >
                  <Save class="w-4 h-4" />
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Eateries & Users Grid */}
          <div class="grid md:grid-cols-2 gap-6 page-section">
            {/* Eateries Card */}
            <Card class="food-card border-2">
              <CardHeader class="pb-3">
                <CardTitle class="flex items-center justify-between">
                  <span class="flex items-center gap-2 text-lg">
                    <span class="text-xl">🍽️</span>
                    Restaurants ({activeEateries().length})
                  </span>
                  <Dialog
                    open={showAddEatery()}
                    onOpenChange={setShowAddEatery}
                  >
                    <DialogTrigger>
                      <Button size="sm" data-testid="add-eatery-open" class="gap-2">
                        <Plus class="w-4 h-4" />
                        Add
                      </Button>
                    </DialogTrigger>
                    <DialogContent class="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle class="flex items-center gap-2">
                          <span class="text-xl">🍕</span>
                          Add Restaurant
                        </DialogTitle>
                        <DialogDescription>
                          Add a new restaurant or food place to the wheel
                        </DialogDescription>
                      </DialogHeader>
                      <div class="space-y-4 pt-2">
                        <TextField
                          value={newEateryName()}
                          onChange={(e) => setNewEateryName(e)}
                        >
                          <TextFieldLabel for="eatery-name" class="text-sm font-medium">
                            Restaurant Name *
                          </TextFieldLabel>
                          <TextFieldInput
                            type="text"
                            id="eatery-name"
                            placeholder="e.g., Pizza Palace"
                            class="h-11 rounded-xl"
                            data-testid="add-eatery-name"
                          />
                        </TextField>
                        <TextField
                          value={newEateryCuisine()}
                          onChange={(e) => setNewEateryCuisine(e)}
                        >
                          <TextFieldLabel for="eatery-cuisine" class="text-sm font-medium">
                            Cuisine Type (Optional)
                          </TextFieldLabel>
                          <TextFieldInput
                            type="text"
                            id="eatery-cuisine"
                            placeholder="e.g., Italian, Chinese, Mexican"
                            class="h-11 rounded-xl"
                          />
                        </TextField>
                        <Button
                          onClick={addEatery}
                          class="w-full gap-2"
                          data-testid="add-eatery-submit"
                        >
                          <Plus class="w-4 h-4" />
                          Add Restaurant
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
                  <Show
                    when={activeEateries().length > 0}
                    fallback={
                      <div class="text-center py-10 text-muted-foreground">
                        <span class="text-4xl block mb-3">🍽️</span>
                        <p class="font-medium">No restaurants yet</p>
                        <p class="text-sm">Add your favorite places to get started!</p>
                      </div>
                    }
                  >
                    <For each={activeEateries()}>
                      {(eatery, index) => (
                        <div
                          class="food-list-item flex items-center justify-between animate-slide-up"
                          style={`animation-delay: ${index() * 0.03}s`}
                          data-eatery-name={eatery.name}
                        >
                          <div class="flex items-center gap-3 flex-1 min-w-0">
                            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-lg flex-shrink-0">
                              🍴
                            </div>
                            <div class="min-w-0">
                              <h3 class="font-semibold truncate">{eatery.name}</h3>
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeEatery(eatery.id)}
                            data-testid="delete-eatery"
                            class="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                          >
                            <Trash2 class="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </CardContent>
            </Card>

            {/* Users Card */}
            <Card class="food-card border-2">
              <CardHeader class="pb-3">
                <CardTitle class="flex items-center justify-between">
                  <span class="flex items-center gap-2 text-lg">
                    <span class="text-xl">👥</span>
                    People ({activeUsers().length})
                  </span>
                  <Dialog open={showAddUser()} onOpenChange={setShowAddUser}>
                    <DialogTrigger>
                      <Button size="sm" data-testid="add-user-open" class="gap-2">
                        <Plus class="w-4 h-4" />
                        Add
                      </Button>
                    </DialogTrigger>
                    <DialogContent class="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle class="flex items-center gap-2">
                          <span class="text-xl">👤</span>
                          Add Person
                        </DialogTitle>
                        <DialogDescription>
                          Add someone who will rate and vote on restaurants
                        </DialogDescription>
                      </DialogHeader>
                      <div class="space-y-4 pt-2">
                        <TextField
                          value={newUserName()}
                          onChange={(e) => setNewUserName(e)}
                        >
                          <TextFieldLabel for="user-name" class="text-sm font-medium">
                            Name *
                          </TextFieldLabel>
                          <TextFieldInput
                            type="text"
                            id="user-name"
                            placeholder="e.g., Alex"
                            class="h-11 rounded-xl"
                            data-testid="add-user-name"
                          />
                        </TextField>
                        <Button
                          onClick={addUser}
                          class="w-full gap-2"
                          data-testid="add-user-submit"
                        >
                          <Plus class="w-4 h-4" />
                          Add Person
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
                  <Show
                    when={activeUsers().length > 0}
                    fallback={
                      <div class="text-center py-10 text-muted-foreground">
                        <span class="text-4xl block mb-3">👥</span>
                        <p class="font-medium">No people yet</p>
                        <p class="text-sm">Add your hungry friends!</p>
                      </div>
                    }
                  >
                    <For each={activeUsers()}>
                      {(user, index) => (
                        <div
                          class="food-list-item flex items-center justify-between animate-slide-up"
                          style={`animation-delay: ${index() * 0.03}s`}
                          data-user-name={user.name}
                        >
                          <div class="flex items-center gap-3 flex-1 min-w-0">
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-accent/30 flex items-center justify-center text-lg flex-shrink-0">
                              👤
                            </div>
                            <div class="min-w-0">
                              <h3 class="font-semibold truncate">{user.name}</h3>
                              <p class="text-xs text-muted-foreground">
                                {selectedUserScores()?.length ?? 0} ratings
                              </p>
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeUser(user.id)}
                            data-testid="delete-user"
                            class="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                          >
                            <Trash2 class="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ratings Section */}
          <Show when={activeUsers().length > 0 && activeEateries().length > 0}>
            <Card class="food-card border-2 page-section">
              <CardHeader class="pb-3">
                <CardTitle class="flex items-center gap-2 text-lg">
                  <span class="text-xl">⭐</span>
                  Rate Restaurants
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div class="space-y-6">
                  {/* User Selector */}
                  <div class="space-y-3">
                    <p class="text-sm font-medium text-muted-foreground">Select a person to rate for:</p>
                    <ToggleGroup
                      multiple={false}
                      value={selectedUser()?.id ?? null}
                      onChange={(userId) =>
                        setSelectedUser(
                          activeUsers().find((x) => x.id === userId),
                        )
                      }
                      data-testid="user-selector"
                      class="flex flex-wrap gap-2"
                    >
                      <For each={activeUsers()}>
                        {(user) => (
                          <ToggleGroupItem 
                            value={user.id}
                            class="px-4 py-2 rounded-full border-2 data-[pressed]:bg-primary data-[pressed]:text-primary-foreground data-[pressed]:border-primary transition-all"
                          >
                            <span class="mr-1">👤</span> {user.name}
                          </ToggleGroupItem>
                        )}
                      </For>
                    </ToggleGroup>
                  </div>

                  <Show when={selectedUser()}>
                    {(user) => (
                      <div class="space-y-4">
                        <div class="flex items-center gap-2">
                          <span class="text-lg">📝</span>
                          <h3 class="font-semibold">
                            Rating as {user().name}
                          </h3>
                        </div>
                        <div class="grid gap-3">
                          <For each={activeEateries()}>
                            {(eatery, index) => {
                              const vetoed = () =>
                                isEateryVetoed(user().id, eatery.id);
                              return (
                                <div
                                  class="food-list-item p-4 space-y-3 animate-slide-up"
                                  classList={{
                                    "!border-destructive/50 !bg-destructive/5":
                                      vetoed(),
                                  }}
                                  style={`animation-delay: ${index() * 0.03}s`}
                                  data-eatery-name={eatery.name}
                                >
                                  <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-lg flex-shrink-0">
                                        🍽️
                                      </div>
                                      <div>
                                        <h4 class="font-semibold">{eatery.name}</h4>
                                        <Show when={vetoed()}>
                                          <span class="text-xs text-destructive font-medium flex items-center gap-1">
                                            <Ban class="w-3 h-3" /> Never pick
                                          </span>
                                        </Show>
                                      </div>
                                    </div>
                                    <div class="flex items-center gap-3">
                                      <Button
                                        size="icon"
                                        variant={
                                          vetoed() ? "destructive" : "ghost"
                                        }
                                        onClick={() =>
                                          toggleVeto(user().id, eatery.id)
                                        }
                                        title={
                                          vetoed()
                                            ? "Remove never pick"
                                            : "Never pick this place"
                                        }
                                        data-testid="veto-toggle"
                                        class="rounded-full"
                                      >
                                        <Ban class="w-4 h-4" />
                                      </Button>
                                      <Show when={!vetoed()}>
                                        <div class="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent min-w-[3ch] text-right">
                                          {selectedUserScores()?.find(
                                            (x) => x.eateryId === eatery.id,
                                          )?.score ?? 0}
                                        </div>
                                      </Show>
                                    </div>
                                  </div>
                                  <Show
                                    when={!vetoed()}
                                    fallback={
                                      <div class="text-sm text-muted-foreground italic flex items-center gap-2 mt-2">
                                        <span>🚫</span> This restaurant won't appear in wheel spins
                                      </div>
                                    }
                                  >
                                    <div class="space-y-2 mt-3 pt-3 border-t border-border/50">
                                      <div class="flex justify-between text-xs font-medium text-muted-foreground">
                                        <span>🤮 Nope</span>
                                        <span>😍 Love it!</span>
                                      </div>
                                      <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={
                                          selectedUserScores()?.find(
                                            (x) => x.eateryId === eatery.id,
                                          )?.score ?? 0
                                        }
                                        onChange={(e) =>
                                          updateUserScore(
                                            user().id,
                                            eatery.id,
                                            Number.parseInt(e.target.value),
                                          )
                                        }
                                        class="w-full h-3 rounded-full appearance-none cursor-pointer accent-primary"
                                        style={{
                                          background: `linear-gradient(to right, oklch(65% 0.2 25) 0%, oklch(75% 0.15 60) 50%, oklch(70% 0.18 145) 100%)`,
                                        }}
                                        data-testid="score-slider"
                                      />
                                    </div>
                                  </Show>
                                </div>
                              );
                            }}
                          </For>
                        </div>
                      </div>
                    )}
                  </Show>
                </div>
              </CardContent>
            </Card>
          </Show>
        </div>
      </div>
    </Show>
  );
}
