import {
  createFileRoute,
  Link,
  Navigate,
  useRouter,
} from "@tanstack/solid-router";
import Home from "lucide-solid/icons/home";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
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
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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

interface Eatery {
  id: string;
  name: string;
  cuisine?: string;
}

interface User {
  id: string;
  name: string;
  scores: { [eateryId: string]: number };
}

interface WheelSettings {
  eateries: Eatery[];
  users: User[];
  currentUser: string | null;
}

function SettingsPage() {
  const connectionId = Route.useParams({ select: (p) => p.connectionId });
  const router = useRouter();

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

    const newEateryId = settingsStorage.addEatery(
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

  return (
    <Show when={currentConnection()} fallback={null}>
      <div class="min-h-screen p-4">
        <div class="max-w-4xl mx-auto space-y-6">
          <div class="flex items-center justify-between">
            <h1 class="text-3xl font-bold">Settings</h1>
            <div class="flex gap-2">
              <Link
                to="/wheel/$connectionId"
                params={{ connectionId: connectionId() }}
              >
                <Button variant="outline" size="sm">
                  Back to Wheel
                </Button>
              </Link>
              <Link to="/">
                <Button variant="outline" size="sm">
                  <Home class="w-4 h-4 mr-2" />
                  Home
                </Button>
              </Link>
            </div>
          </div>

          <div class="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle class="flex items-center justify-between">
                  Eateries ({activeEateries().length})
                  <Dialog
                    open={showAddEatery()}
                    onOpenChange={setShowAddEatery}
                  >
                    <DialogTrigger>
                      <Button size="sm" data-testid="add-eatery-open">
                        <Plus class="w-4 h-4 mr-2" />
                        Add
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Eatery</DialogTitle>
                        <DialogDescription>
                          Add a new restaurant or food place to the wheel
                        </DialogDescription>
                      </DialogHeader>
                      <div class="space-y-4">
                        <div class="space-y-2">
                          <TextField
                            value={newEateryName()}
                            onChange={(e) => setNewEateryName(e)}
                          >
                            <TextFieldLabel for="eatery-name">
                              Name *
                            </TextFieldLabel>
                            <TextFieldInput
                              type="text"
                              id="eatery-name"
                              placeholder="Restaurant name"
                              data-testid="add-eatery-name"
                            />
                          </TextField>
                        </div>
                        <div class="space-y-2">
                          <TextField
                            value={newEateryCuisine()}
                            onChange={(e) => setNewEateryCuisine(e)}
                          >
                            <TextFieldLabel for="eatery-cuisine">
                              Cuisine (Optional)
                            </TextFieldLabel>
                            <TextFieldInput
                              type="text"
                              id="eatery-cuisine"
                              placeholder="Italian, Chinese, etc."
                            />
                          </TextField>
                        </div>
                        <Button
                          onClick={addEatery}
                          class="w-full"
                          data-testid="add-eatery-submit"
                        >
                          Add Eatery
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div class="space-y-3 max-h-96 overflow-y-auto">
                  <Show
                    when={activeEateries().length > 0}
                    fallback={
                      <p class="text-muted-foreground text-center py-8">
                        No eateries added yet. Add some to get started!
                      </p>
                    }
                  >
                    <For each={activeEateries()}>
                      {(eatery) => (
                        <div
                          class="flex items-center justify-between p-3 border-[3px] rounded-lg"
                          data-eatery-name={eatery.name}
                        >
                          <div>
                            <h3 class="font-medium">{eatery.name}</h3>
                            {/* {eatery.cuisine && (
                            <p class="text-sm text-muted-foreground">
                              {eatery.cuisine}
                            </p>
                          )} */}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeEatery(eatery.id)}
                            data-testid="delete-eatery"
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

            <Card>
              <CardHeader>
                <CardTitle class="flex items-center justify-between">
                  Users ({currentConnection()?.settings.users.length})
                  <Dialog open={showAddUser()} onOpenChange={setShowAddUser}>
                    <DialogTrigger>
                      <Button size="sm" data-testid="add-user-open">
                        <Plus class="w-4 h-4 mr-2" />
                        Add
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New User</DialogTitle>
                        <DialogDescription>
                          Add a new user who can rate eateries
                        </DialogDescription>
                      </DialogHeader>
                      <div class="space-y-4">
                        <div class="space-y-2">
                          <TextField
                            value={newUserName()}
                            onChange={(e) => setNewUserName(e)}
                          >
                            <TextFieldLabel for="user-name">
                              Name *
                            </TextFieldLabel>
                            <TextFieldInput
                              type="text"
                              id="user-name"
                              placeholder="User name"
                              data-testid="add-user-name"
                            />
                          </TextField>
                        </div>
                        <Button
                          onClick={addUser}
                          class="w-full"
                          data-testid="add-user-submit"
                        >
                          Add User
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div class="space-y-3 max-h-96 overflow-y-auto">
                  <Show
                    when={activeUsers().length > 0}
                    fallback={
                      <p class="text-muted-foreground text-center py-8">
                        No users added yet. Add some to get started!
                      </p>
                    }
                  >
                    <For each={activeUsers()}>
                      {(user) => (
                        <div
                          class="flex items-center justify-between p-3 border-[3px] rounded-lg"
                          data-user-name={user.name}
                        >
                          <div>
                            <h3 class="font-medium">{user.name}</h3>
                            <p class="text-sm text-muted-foreground">
                              {selectedUserScores()?.length ?? 0} ratings
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeUser(user.id)}
                            data-testid="delete-user"
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

          <Show when={activeUsers().length > 0 && activeEateries().length > 0}>
            <Card>
              <CardHeader>
                <CardTitle>User Ratings</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="space-y-4">
                  <div class="space-y-2">
                    <ToggleGroup
                      multiple={false}
                      value={selectedUser()?.id ?? null}
                      onChange={(userId) =>
                        setSelectedUser(
                          activeUsers().find((x) => x.id === userId),
                        )
                      }
                      data-testid="user-selector"
                    >
                      <For each={activeUsers()}>
                        {(user) => (
                          <ToggleGroupItem value={user.id}>
                            {user.name}
                          </ToggleGroupItem>
                        )}
                      </For>
                    </ToggleGroup>
                  </div>

                  <Show when={selectedUser()}>
                    {(user) => (
                      <div class="space-y-3">
                        <h3 class="font-medium">
                          Rate Eateries for {user().name}
                        </h3>
                        <div class="grid gap-4">
                          <For each={activeEateries()}>
                            {(eatery) => (
                              <div
                                class="p-4 border-[3px] rounded-lg space-y-3"
                                data-eatery-name={eatery.name}
                              >
                                <div class="flex items-center justify-between">
                                  <div>
                                    <h4 class="font-medium">{eatery.name}</h4>
                                    {/* {eatery.cuisine && (
                                  <p class="text-sm text-muted-foreground">
                                    {eatery.cuisine}
                                  </p>
                                )} */}
                                  </div>
                                  <div class="text-lg font-bold text-blue-600">
                                    {selectedUserScores()?.find(
                                      (x) => x.eateryId === eatery.id,
                                    )?.score ?? 0}
                                  </div>
                                </div>
                                <div class="space-y-2">
                                  <div class="flex justify-between text-sm text-muted-foreground ">
                                    <span>🤮 (0)</span>
                                    <span>😍 (100)</span>
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
                                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                                    style={{
                                      background: `linear-gradient(to right, #ef4444 0%, #f97316 25%, #eab308 50%, #22c55e 75%, #16a34a 100%)`,
                                    }}
                                    data-testid="score-slider"
                                  />
                                  <div class="text-center text-sm text-muted-foreground">
                                    Score:{" "}
                                    {selectedUserScores()?.find(
                                      (x) => x.eateryId === eatery.id,
                                    )?.score ?? 0}
                                    /100
                                  </div>
                                </div>
                              </div>
                            )}
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
