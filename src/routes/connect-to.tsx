import { createFileRoute, useRouter } from "@tanstack/solid-router";
import { createEffect, createMemo, createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import * as v from "valibot";
import { useSettingsStorage } from "~/components/SettingsStorageProvider";
import { logger } from "~/utils/logger";
import { usePeer2Peer } from "~/utils/peer2peerSharing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import Check from "lucide-solid/icons/check";
import Loader from "lucide-solid/icons/loader";
import Circle from "lucide-solid/icons/circle";
import Server from "lucide-solid/icons/server";
import Users from "lucide-solid/icons/users";
import Database from "lucide-solid/icons/database";
import Wifi from "lucide-solid/icons/wifi";
import WifiOff from "lucide-solid/icons/wifi-off";

const searchSchema = v.object({
  peerId: v.string(),
  connectionId: v.string(),
});

export const Route = createFileRoute("/connect-to")({
  component: RouteComponent,
  validateSearch: searchSchema,
});

type ConnectionStep = "server" | "peer" | "data" | "complete";

interface StepStatus {
  step: ConnectionStep;
  status: "pending" | "in-progress" | "completed" | "error";
  message: string;
}

function RouteComponent() {
  const connectionId = Route.useSearch({ select: (p) => p.connectionId });
  const peerId = Route.useSearch({ select: (p) => p.peerId });

  const peer = usePeer2Peer();
  const router = useRouter();
  const storage = useSettingsStorage();

  const [hasNavigated, setHasNavigated] = createSignal(false);
  const [requestsSent, setRequestsSent] = createSignal(0);
  const [peerConnected, setPeerConnected] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  // Derive the current step based on actual connection state
  const currentStep = createMemo<ConnectionStep>(() => {
    // Check if we already have the connection data
    if (storage.store.connections.find((c) => c.id === connectionId())) {
      return "complete";
    }
    // Check if peer is connected
    if (peerConnected()) {
      return "data";
    }
    // Check if server is connected
    if (peer.serverStatus() === "connected") {
      return "peer";
    }
    return "server";
  });

  // Build steps array for display
  const steps = createMemo<StepStatus[]>(() => {
    const step = currentStep();
    const serverStatus = peer.serverStatus();

    return [
      {
        step: "server",
        status: step === "server"
          ? (serverStatus === "connecting" ? "in-progress" : serverStatus === "disconnected" ? "error" : "completed")
          : "completed",
        message: serverStatus === "connecting"
          ? "Connecting to signaling server..."
          : serverStatus === "disconnected"
            ? "Server connection lost"
            : "Connected to server",
      },
      {
        step: "peer",
        status: step === "server"
          ? "pending"
          : step === "peer"
            ? "in-progress"
            : "completed",
        message: step === "server"
          ? "Waiting for server..."
          : step === "peer"
            ? "Establishing peer connection..."
            : "Peer connected",
      },
      {
        step: "data",
        status: step === "server" || step === "peer"
          ? "pending"
          : step === "data"
            ? "in-progress"
            : "completed",
        message: step === "data"
          ? `Syncing data... (${requestsSent()} requests sent)`
          : step === "complete"
            ? "Data received"
            : "Waiting for connection...",
      },
    ];
  });

  // Add peer and start requesting storage
  onMount(() => {
    logger.log("connect-to: adding peer (onMount)", {
      peerId: peerId(),
      connectionId: connectionId(),
    });
    peer.addNewPeer(peerId());

    const sendRequest = () => {
      logger.log("connect-to: sending request-storage", {
        peerId: peerId(),
        connectionId: connectionId(),
      });
      const sent = peer.sendToPeer(peerId(), {
        type: "request-storage",
        data: { connectionId: connectionId() },
      });
      setRequestsSent((prev) => prev + 1);
      return sent;
    };

    // Send immediately, then retry until data arrives
    sendRequest();

    const interval = setInterval(() => {
      if (currentStep() === "complete") {
        clearInterval(interval);
        return;
      }
      sendRequest();
    }, 1000);

    return () => clearInterval(interval);
  });

  // Track when peer is connected
  createEffect(() => {
    const connected = peer.isPeerConnected(peerId());
    setPeerConnected(connected);
  });

  // Navigate when data is received
  createEffect(() => {
    if (hasNavigated()) return;

    if (storage.store.connections.find((c) => c.id === connectionId())) {
      setHasNavigated(true);
      logger.log("connect-to: received data, navigating", {
        connectionId: connectionId(),
      });
      // Small delay to show the completion state
      setTimeout(() => {
        router.navigate({
          to: "/wheel/$connectionId",
          params: { connectionId: connectionId() },
        });
      }, 500);
    }
  });

  const StepIcon = (props: { status: StepStatus["status"] }) => (
    <Switch>
      <Match when={props.status === "pending"}>
        <Circle class="w-5 h-5 text-muted-foreground" />
      </Match>
      <Match when={props.status === "in-progress"}>
        <Loader class="w-5 h-5 text-primary animate-spin" />
      </Match>
      <Match when={props.status === "completed"}>
        <div class="w-5 h-5 rounded-full bg-success flex items-center justify-center">
          <Check class="w-3 h-3 text-success-foreground" />
        </div>
      </Match>
      <Match when={props.status === "error"}>
        <div class="w-5 h-5 rounded-full bg-error flex items-center justify-center">
          <WifiOff class="w-3 h-3 text-error-foreground" />
        </div>
      </Match>
    </Switch>
  );

  const StepLabel = (props: { step: ConnectionStep }) => (
    <Switch>
      <Match when={props.step === "server"}>
        <Server class="w-4 h-4" />
        <span>Signaling Server</span>
      </Match>
      <Match when={props.step === "peer"}>
        <Users class="w-4 h-4" />
        <span>Peer Connection</span>
      </Match>
      <Match when={props.step === "data"}>
        <Database class="w-4 h-4" />
        <span>Data Sync</span>
      </Match>
    </Switch>
  );

  return (
    <div class="min-h-[calc(100vh-theme(spacing.28))] py-12 px-4">
      <div class="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div class="text-center space-y-2">
          <h1 class="text-2xl font-bold text-foreground">Joining Session</h1>
          <p class="text-muted-foreground">
            Connecting to shared session...
          </p>
        </div>

        {/* Connection Status Card */}
        <Card class="food-card">
          <CardHeader class="pb-4">
            <div class="flex items-center justify-between">
              <div>
                <CardTitle class="text-lg">Connection Status</CardTitle>
                <CardDescription>
                  Establishing peer-to-peer connection
                </CardDescription>
              </div>
              <div class="flex items-center gap-2">
                <Show
                  when={peer.serverStatus() === "connected"}
                  fallback={
                    <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <WifiOff class="w-4 h-4" />
                      <span>Offline</span>
                    </div>
                  }
                >
                  <div class="flex items-center gap-1.5 text-sm text-success-foreground">
                    <Wifi class="w-4 h-4" />
                    <span>Online</span>
                  </div>
                </Show>
              </div>
            </div>
          </CardHeader>
          <CardContent class="space-y-4">
            {/* Steps */}
            <div class="space-y-3">
              <For each={steps()}>
                {(stepInfo, index) => (
                  <div class="flex items-start gap-3">
                    {/* Step indicator with vertical line */}
                    <div class="flex flex-col items-center">
                      <StepIcon status={stepInfo.status} />
                      <Show when={index() < steps().length - 1}>
                        <div
                          class="w-0.5 h-8 mt-1"
                          classList={{
                            "bg-success": stepInfo.status === "completed",
                            "bg-muted": stepInfo.status !== "completed",
                          }}
                        />
                      </Show>
                    </div>
                    {/* Step content */}
                    <div class="flex-1 pb-4">
                      <div class="flex items-center gap-2 font-medium text-sm">
                        <StepLabel step={stepInfo.step} />
                      </div>
                      <p
                        class="text-sm mt-0.5"
                        classList={{
                          "text-muted-foreground": stepInfo.status === "pending",
                          "text-foreground": stepInfo.status === "in-progress",
                          "text-success-foreground": stepInfo.status === "completed",
                          "text-error-foreground": stepInfo.status === "error",
                        }}
                      >
                        {stepInfo.message}
                      </p>
                    </div>
                  </div>
                )}
              </For>
            </div>

            {/* Connection details */}
            <div class="border-t pt-4 space-y-2">
              <h4 class="text-sm font-medium text-muted-foreground">Connection Details</h4>
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="space-y-1">
                  <span class="text-muted-foreground">Your ID</span>
                  <p class="font-mono text-xs truncate bg-muted px-2 py-1 rounded">
                    {peer.myPeerId()?.slice(0, 8)}...
                  </p>
                </div>
                <div class="space-y-1">
                  <span class="text-muted-foreground">Target Peer</span>
                  <p class="font-mono text-xs truncate bg-muted px-2 py-1 rounded">
                    {peerId().slice(0, 8)}...
                  </p>
                </div>
                <div class="space-y-1">
                  <span class="text-muted-foreground">Connected Peers</span>
                  <p class="font-mono text-xs bg-muted px-2 py-1 rounded">
                    {peer.connectedPeerCount()}
                  </p>
                </div>
                <div class="space-y-1">
                  <span class="text-muted-foreground">Session ID</span>
                  <p class="font-mono text-xs truncate bg-muted px-2 py-1 rounded">
                    {connectionId().slice(0, 8)}...
                  </p>
                </div>
              </div>
            </div>

            {/* Error message */}
            <Show when={errorMessage()}>
              <div class="bg-error/10 border border-error/20 rounded-md p-3">
                <p class="text-sm text-error-foreground">{errorMessage()}</p>
              </div>
            </Show>
          </CardContent>
        </Card>

        {/* Help text */}
        <p class="text-center text-sm text-muted-foreground">
          Make sure the person sharing the session has the app open.
          <br />
          Connection is automatic once both parties are online.
        </p>
      </div>
    </div>
  );
}
