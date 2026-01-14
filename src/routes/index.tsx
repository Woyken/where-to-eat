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
    <div class="py-8 sm:py-12">
      <div class="mx-auto max-w-3xl space-y-8">
        <div class="text-center space-y-3 animate-paper-rise">
          <div class="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs font-semibold text-foreground/80 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
            <span aria-hidden="true">✳︎</span>
            collaborative roulette for restaurants
          </div>
          <h1 class="text-5xl sm:text-6xl font-bold tracking-tight">
            Eatery Wheel
          </h1>
          <p class="text-muted-foreground max-w-xl mx-auto">
            Spin with friends, sync instantly, and stop debating where to eat.
          </p>
        </div>

        <div class="space-y-6">
          <Card>
            <CardHeader>
              <Show
                when={connections().length > 0}
                fallback={
                  <>
                    <CardTitle>Welcome!</CardTitle>
                    <CardDescription>
                      Get started by creating a new wheel or connecting to an
                      existing one
                    </CardDescription>
                  </>
                }
              >
                <CardTitle>Your Connections</CardTitle>
                <CardDescription>
                  Select a connection to continue or create a new one
                </CardDescription>
              </Show>
            </CardHeader>
            <Show
              when={connections().length > 0}
              fallback={
                <>
                  <CardContent class="space-y-4">
                    <div class="rounded-2xl border border-border bg-card/40 p-4 paper-soft">
                      <TextField
                        id="connection-name-field"
                        value={connectionName()}
                        onChange={(e) => setConnectionName(e)}
                      >
                        <TextFieldLabel for="connection-name">
                          Connection Name (Optional)
                        </TextFieldLabel>
                        <TextFieldInput
                          type="text"
                          id="connection-name"
                          placeholder="My Eatery Wheel"
                        />
                      </TextField>
                    </div>
                  </CardContent>
                  <CardFooter class="gap-2">
                    <AddConnectionOrConnectToExisting
                      connectId={connectId()}
                      // connectToExisting={connectToExisting}
                      connectionName={connectionName()}
                      createFreshConnection={createFreshConnection}
                      setConnectId={setConnectId}
                      setConnectionName={setConnectionName}
                      setShowConnectDialog={setShowConnectDialog}
                      setShowQRScanner={() => {}}
                      showConnectDialog={showConnectDialog()}
                    />
                  </CardFooter>
                </>
              }
            >
              <CardContent class="space-y-3">
                <For each={connections()}>
                  {(connection) => (
                    <div class="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/40 p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:bg-card/60">
                      <div>
                        <h3 class="font-display text-lg font-semibold tracking-tight">
                          {connection.settings.connection.name}
                        </h3>
                        <p class="text-sm text-muted-foreground">
                          Created{" "}
                          {new Date(
                            connection.settings.connection.updatedAt,
                          ).toLocaleDateString()}
                        </p>
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
                          class="!px-3"
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

          <Show when={connections().length > 0}>
            <Card>
              <CardHeader>
                <CardTitle>Create new connection</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="flex flex-col sm:flex-row gap-3">
                  <div class="space-y-2 flex-1">
                    <TextField
                      value={connectionName()}
                      onChange={(e) => setConnectionName(e)}
                    >
                      <TextFieldLabel for="new-connection-name">
                        New Connection Name
                      </TextFieldLabel>
                      <TextFieldInput
                        type="text"
                        id="new-connection-name"
                        placeholder="My New Wheel"
                      />
                    </TextField>
                  </div>
                </div>
              </CardContent>
              <CardFooter class="gap-2">
                <AddConnectionOrConnectToExisting
                  connectId={connectId()}
                  // connectToExisting={connectToExisting}
                  connectionName={connectionName()}
                  createFreshConnection={createFreshConnection}
                  setConnectId={setConnectId}
                  setConnectionName={setConnectionName}
                  setShowConnectDialog={setShowConnectDialog}
                  setShowQRScanner={() => {}}
                  showConnectDialog={showConnectDialog()}
                />
              </CardFooter>
            </Card>
          </Show>
        </div>
      </div>
    </div>
  );
}

function AddConnectionOrConnectToExisting(props: {
  createFreshConnection: () => void;
  showConnectDialog: boolean;
  setShowConnectDialog: (show: boolean) => void;
  connectId: string;
  setConnectId: (id: string) => void;
  connectionName: string;
  setConnectionName: (name: string) => void;
  // connectToExisting: () => void;
  setShowQRScanner: (show: boolean) => void;
}) {
  return (
    <>
      {/* <div class="flex flex-col sm:flex-row gap-3"> */}
      <Button
        onClick={props.createFreshConnection}
        class="flex-1"
        data-testid="start-fresh"
      >
        <Plus class="w-4 h-4 mr-2" />
        Start Fresh
      </Button>
      {/* <Dialog
        open={props.showConnectDialog}
        onOpenChange={props.setShowConnectDialog}
      >
        <DialogTrigger>
          <Button variant="outline" class="flex-1 bg-transparent">
            <Scan class="w-4 h-4 mr-2" />
            Connect to Existing
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect to Existing Wheel</DialogTitle>
            <DialogDescription>
              Enter the connection ID or scan a QR code
            </DialogDescription>
          </DialogHeader>
          <div class="space-y-4">
            <div class="space-y-2">
              <TextField
                value={props.connectId}
                onChange={(e) => props.setConnectId(e)}
              >
                <TextFieldLabel for="connection-uuid">
                  Connection ID
                </TextFieldLabel>
                <TextFieldInput
                  type="text"
                  id="connection-uuid"
                  placeholder="Enter UUID"
                />
              </TextField>
            </div>
            <div class="space-y-2">
              <TextField
                value={props.connectionName}
                onChange={(e) => props.setConnectionName(e)}
              >
                <TextFieldLabel for="connection-name">
                  Connection Name (Optional)
                </TextFieldLabel>
                <TextFieldInput
                  type="text"
                  id="connection-name"
                  placeholder="Name this connection"
                />
              </TextField>
            </div>
            <div class="flex gap-2">
              <Button onClick={props.connectToExisting} class="flex-1">
                Connect
              </Button>
              <Button
                variant="outline"
                onClick={() => props.setShowQRScanner(true)}
              >
                <QrCode class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog> */}
      {/* </div> */}
    </>
  );
}
