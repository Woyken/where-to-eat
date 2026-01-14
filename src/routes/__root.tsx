/// <reference types="vite/client" />

import {
  ColorModeProvider,
  ColorModeScript,
  useColorMode,
} from "@kobalte/core";
import { createRootRoute, Link, Outlet } from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import IconLaptop from "lucide-solid/icons/laptop-2";
import IconMoon from "lucide-solid/icons/moon";
import IconSun from "lucide-solid/icons/sun";
import IconUsers from "lucide-solid/icons/users";
import UtensilsCrossed from "lucide-solid/icons/utensils-crossed";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";
import { SettingsStorageProvider } from "~/components/SettingsStorageProvider";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Peer2PeerSharing,
  usePeer2PeerOptional,
} from "~/utils/peer2peerSharing";
import {
  subscribeToSwUpdate,
  updateServiceWorker,
} from "~/utils/serviceWorkerComm";

export const Route = createRootRoute({
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
});

function RootComponent() {
  return (
    <>
      <ColorModeScript />
      <ColorModeProvider>
        <SettingsStorageProvider>
          <Peer2PeerSharing>
            <div class="min-h-screen flex flex-col">
              {/* Header */}
              <header class="sticky top-0 z-50 backdrop-blur-md bg-background/95 border-b border-border">
                <div class="max-w-5xl mx-auto px-4 py-3">
                  <div class="flex items-center justify-between">
                    {/* Logo & Brand */}
                    <Link
                      to="/"
                      class="flex items-center gap-3 group"
                    >
                      <div class="w-9 h-9 rounded-lg bg-primary flex items-center justify-center group-hover:bg-primary/90 transition-colors">
                        <UtensilsCrossed class="w-5 h-5 text-primary-foreground" />
                      </div>
                      <div class="flex flex-col">
                        <span class="font-semibold text-lg text-foreground leading-none">
                          Where to Eat
                        </span>
                        <span class="text-xs text-muted-foreground">
                          Decide together
                        </span>
                      </div>
                    </Link>

                    {/* Navigation & Actions */}
                    <div class="flex items-center gap-1">
                      <ConnectedPeerCount />
                      <ModeToggle />
                    </div>
                  </div>
                </div>
              </header>

              <UpdateNotification />

              {/* Main Content */}
              <main class="flex-1">
                <Outlet />
              </main>

              {/* Footer */}
              <footer class="border-t border-border py-4 mt-auto">
                <div class="max-w-5xl mx-auto px-4 text-center">
                  <p class="text-xs text-muted-foreground">
                    Where to Eat — Collaborative restaurant decisions
                  </p>
                </div>
              </footer>
            </div>
          </Peer2PeerSharing>
        </SettingsStorageProvider>
        <TanStackRouterDevtools position="bottom-right" />
      </ColorModeProvider>
    </>
  );
function UpdateNotification() {
  const [showUpdate, setShowUpdate] = createSignal(false);

  onMount(() => {
    const unsub = subscribeToSwUpdate(() => {
      setShowUpdate(true);
    });
    onCleanup(unsub);
  });

  return (
    <Show when={showUpdate()}>
      <div class="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-5">
        <div class="bg-card text-card-foreground border border-border shadow-lg rounded-lg p-4 max-w-sm flex items-start gap-4">
          <div class="flex-1">
            <h4 class="text-sm font-semibold">Update Available</h4>
            <p class="text-xs text-muted-foreground mt-1">
              A new version of the app is available. Refresh to update.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => updateServiceWorker()}
            class="shrink-0"
          >
            Update
          </Button>
        </div>
      </div>
    </Show>
  );
}

}

export function ModeToggle() {
  const { setColorMode, colorMode } = useColorMode();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={Button<"button">}
        variant="ghost"
        size="icon"
        class="w-9 h-9"
      >
        <IconSun class="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <IconMoon class="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span class="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="min-w-[120px]">
        <DropdownMenuItem onSelect={() => setColorMode("light")} class="gap-2 cursor-pointer text-sm">
          <IconSun class="size-4" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode("dark")} class="gap-2 cursor-pointer text-sm">
          <IconMoon class="size-4" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode("system")} class="gap-2 cursor-pointer text-sm">
          <IconLaptop class="size-4" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConnectedPeerCount() {
  const ctx = usePeer2PeerOptional();
  const connectedPeerIds = () => ctx?.connectedPeerIds() ?? [];
  const peerCount = () => ctx?.connectedPeerCount() ?? 0;

  return (
    <Dialog>
      <DialogTrigger
        as={Button<"button">}
        variant="ghost"
        size="sm"
        class="h-9 px-2 gap-1.5"
        data-testid="connected-peer-count"
        title="Active connections"
      >
        <div class="relative">
          <IconUsers class="size-4 text-muted-foreground" />
          {peerCount() > 0 && (
            <span class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-[9px] font-medium text-primary-foreground flex items-center justify-center">
              {peerCount()}
            </span>
          )}
        </div>
        <span class="text-sm text-muted-foreground hidden sm:inline" data-testid="peer-count-value">
          {peerCount()}
        </span>
      </DialogTrigger>
      <DialogContent data-testid="active-connections-dialog" class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <IconUsers class="w-4 h-4 text-primary" />
            Active Connections
          </DialogTitle>
          <DialogDescription>
            Peers currently connected to your session
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 pt-2">
          <div class="p-3 rounded-md bg-muted border border-border">
            <p class="text-xs text-muted-foreground mb-1">Your Peer ID</p>
            <p class="font-mono text-xs break-all">{ctx?.myPeerId() ?? "—"}</p>
          </div>

          <div class="space-y-2">
            <p class="text-sm font-medium">Connected Peers</p>
            {connectedPeerIds().length === 0 ? (
              <div class="text-center py-6 text-muted-foreground border border-dashed border-border rounded-md">
                <p class="text-sm">No peers connected</p>
                <p class="text-xs mt-1">Share your session to invite others</p>
              </div>
            ) : (
              <ul class="space-y-1.5">
                {connectedPeerIds().map((peerId) => (
                  <li
                    class="flex items-center gap-2 p-2 rounded-md bg-muted border border-border"
                    data-testid="active-connection-item"
                  >
                    <div class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <IconUsers class="w-3 h-3 text-primary" />
                    </div>
                    <span class="font-mono text-xs truncate flex-1">{peerId}</span>
                    <span class="w-2 h-2 rounded-full bg-green-500" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
