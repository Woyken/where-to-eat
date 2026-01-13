import { createFileRoute, useRouter } from "@tanstack/solid-router";
import { createEffect, createSignal, Match, onMount, Switch } from "solid-js";
import * as v from "valibot";
import { useSettingsStorage } from "~/components/SettingsStorageProvider";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { usePeer2Peer } from "~/utils/peer2peerSharing";

const searchSchema = v.object({
  peerId: v.string(),
  connectionId: v.string(),
});

export const Route = createFileRoute("/connect-to")({
  component: RouteComponent,
  validateSearch: searchSchema,
});

function RouteComponent() {
  const connectionId = Route.useSearch({ select: (p) => p.connectionId });
  const peerId = Route.useSearch({ select: (p) => p.peerId });

  const [currentStatus, setCurrentStatus] = createSignal<
    "connecting" | "waiting-for-data" | "received-data"
  >();

  const peer = usePeer2Peer();

  // Add peer and start requesting storage - must run in browser only
  onMount(() => {
    setCurrentStatus("connecting");
    console.log("connect-to: adding peer (onMount)", {
      peerId: peerId(),
      connectionId: connectionId(),
    });
    peer.addNewPeer(peerId());

    // Start sending request-storage immediately
    setCurrentStatus("waiting-for-data");

    const sendRequest = () => {
      console.log("connect-to: sending request-storage", {
        peerId: peerId(),
        connectionId: connectionId(),
      });
      return peer.sendToPeer(peerId(), {
        type: "request-storage",
        data: { connectionId: connectionId() },
      });
    };

    // Send immediately, then retry until data arrives
    sendRequest();

    const interval = setInterval(() => {
      if (currentStatus() === "received-data") {
        clearInterval(interval);
        return;
      }
      sendRequest();
    }, 1000);

    return () => clearInterval(interval);
  });

  const router = useRouter();

  const storage = useSettingsStorage();
  const [hasNavigated, setHasNavigated] = createSignal(false);

  createEffect(() => {
    // Skip if we've already navigated
    if (hasNavigated()) return;

    if (storage.store.connections.find((c) => c.id === connectionId())) {
      setCurrentStatus("received-data");
      setHasNavigated(true);
      console.log("connect-to: received data, navigating", {
        connectionId: connectionId(),
      });
      router.navigate({
        to: "/wheel/$connectionId",
        params: { connectionId: connectionId() },
      });
    }
  });

  return (
    <div class="grid place-items-center py-16">
      <Card class="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Joining shared wheel…</CardTitle>
        </CardHeader>
        <CardContent class="grid gap-4">
          <Switch>
            <Match when={currentStatus() === "connecting"}>
              <StatusRow title="Connecting" description="Setting up a peer connection." />
            </Match>
            <Match when={currentStatus() === "waiting-for-data"}>
              <StatusRow title="Waiting for data" description="Requesting the room’s data from the host." />
            </Match>
            <Match when={currentStatus() === "received-data"}>
              <StatusRow title="Data received" description="Opening the wheel now." />
            </Match>
          </Switch>

          <div class="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
            <div>
              Connection: <span class="font-mono text-foreground">{connectionId()}</span>
            </div>
            <div>
              Peer: <span class="font-mono text-foreground">{peerId()}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow(props: { title: string; description: string }) {
  return (
    <div class="flex items-start gap-3">
      <div
        class="mt-0.5 size-4 rounded-full border-2 border-muted-foreground/50 border-t-transparent animate-spin"
        aria-hidden="true"
      />
      <div class="grid gap-1">
        <div class="text-sm font-medium">{props.title}</div>
        <div class="text-sm text-muted-foreground">{props.description}</div>
      </div>
    </div>
  );
}
