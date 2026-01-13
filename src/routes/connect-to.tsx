import { createFileRoute, useRouter } from "@tanstack/solid-router";
import { createEffect, createSignal, Match, onMount, Switch } from "solid-js";
import * as v from "valibot";
import { useSettingsStorage } from "~/components/SettingsStorageProvider";
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
    <Switch>
      <Match when={currentStatus() === "connecting"}>
        <div>Connecting...</div>
      </Match>
      <Match when={currentStatus() === "waiting-for-data"}>
        <div>Waiting for data...</div>
      </Match>
      <Match when={currentStatus() === "received-data"}>
        <div>Data received!</div>
      </Match>
    </Switch>
  );
}
