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
    <div class="py-12 sm:py-16">
      <div class="mx-auto max-w-md">
        <Card class="animate-paper-rise">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <span aria-hidden="true">🔗</span>
              Join Connection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Switch>
              <Match when={currentStatus() === "connecting"}>
                <div class="space-y-2">
                  <div class="font-display text-xl font-semibold tracking-tight">
                    Connecting…
                  </div>
                  <div class="text-sm text-muted-foreground">
                    Finding your peer and opening a secure sync channel.
                  </div>
                </div>
              </Match>
              <Match when={currentStatus() === "waiting-for-data"}>
                <div class="space-y-2">
                  <div class="font-display text-xl font-semibold tracking-tight">
                    Waiting for data…
                  </div>
                  <div class="text-sm text-muted-foreground">
                    Hold tight — the wheel is being transferred.
                  </div>
                </div>
              </Match>
              <Match when={currentStatus() === "received-data"}>
                <div class="space-y-2">
                  <div class="font-display text-xl font-semibold tracking-tight">
                    Data received!
                  </div>
                  <div class="text-sm text-muted-foreground">
                    Redirecting you to the wheel.
                  </div>
                </div>
              </Match>
            </Switch>

            <div class="mt-5 rounded-2xl border border-border bg-card/40 p-3 text-xs text-muted-foreground">
              <div class="font-mono break-all">
                connectionId: {connectionId()}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
