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
            <div class="min-h-screen flex flex-col food-pattern">
              {/* Playful Header */}
              <header class="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b-2 border-primary/10">
                <div class="max-w-6xl mx-auto px-4 py-3">
                  <div class="flex items-center justify-between">
                    {/* Logo & Brand */}
                    <Link
                      to="/"
                      class="flex items-center gap-3 group"
                    >
                      <div class="relative">
                        <div class="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-food group-hover:scale-110 transition-transform duration-300">
                          <UtensilsCrossed class="w-5 h-5 text-primary-foreground" />
                        </div>
                        <span class="absolute -top-1 -right-1 text-sm animate-float">🍕</span>
                      </div>
                      <div class="flex flex-col">
                        <span class="font-display text-2xl text-primary leading-none tracking-wide">
                          Where to Eat
                        </span>
                        <span class="text-xs text-muted-foreground font-medium">
                          Spin & Decide Together
                        </span>
                      </div>
                    </Link>

                    {/* Navigation & Actions */}
                    <div class="flex items-center gap-2">
                      <ConnectedPeerCount />
                      <ModeToggle />
                    </div>
                  </div>
                </div>
              </header>

              {/* Main Content */}
              <main class="flex-1">
                <Outlet />
              </main>

              {/* Footer */}
              <footer class="border-t border-border/50 py-6 mt-auto">
                <div class="max-w-6xl mx-auto px-4 text-center">
                  <p class="text-sm text-muted-foreground flex items-center justify-center gap-2">
                    Made with <span class="text-primary animate-pulse">❤️</span> for hungry friends
                    <span class="mx-2">•</span>
                    <span class="inline-flex gap-1">
                      🍔 🍕 🌮 🍜 🍣
                    </span>
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
}

export function ModeToggle() {
  const { setColorMode, colorMode } = useColorMode();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={Button<"button">}
        variant="ghost"
        size="sm"
        class="w-10 h-10 rounded-xl hover:bg-accent/50 transition-colors"
      >
        <IconSun class="size-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
        <IconMoon class="absolute size-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-indigo-400" />
        <span class="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="min-w-[140px]">
        <DropdownMenuItem onSelect={() => setColorMode("light")} class="gap-2 cursor-pointer">
          <IconSun class="size-4 text-amber-500" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode("dark")} class="gap-2 cursor-pointer">
          <IconMoon class="size-4 text-indigo-400" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode("system")} class="gap-2 cursor-pointer">
          <IconLaptop class="size-4 text-muted-foreground" />
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
        class="h-10 px-3 rounded-xl hover:bg-accent/50 transition-colors gap-2"
        data-testid="connected-peer-count"
        title="Active connections"
      >
        <div class="relative">
          <IconUsers class="size-5 text-muted-foreground" />
          {peerCount() > 0 && (
            <span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center animate-bounce-in">
              {peerCount()}
            </span>
          )}
        </div>
        <span class="text-sm text-muted-foreground hidden sm:inline" data-testid="peer-count-value">
          {peerCount()} {peerCount() === 1 ? 'peer' : 'peers'}
        </span>
      </DialogTrigger>
      <DialogContent data-testid="active-connections-dialog" class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <IconUsers class="w-5 h-5 text-primary" />
            Active Connections
          </DialogTitle>
          <DialogDescription>
            Friends currently connected to your session
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 pt-2">
          <div class="p-3 rounded-xl bg-muted/50 border border-border">
            <p class="text-xs text-muted-foreground mb-1">Your Peer ID</p>
            <p class="font-mono text-sm break-all">{ctx?.myPeerId() ?? "—"}</p>
          </div>

          <div class="space-y-2">
            <p class="text-sm font-medium">Connected Peers</p>
            {connectedPeerIds().length === 0 ? (
              <div class="text-center py-8 text-muted-foreground">
                <span class="text-3xl mb-2 block">👋</span>
                <p class="text-sm">No peers connected yet</p>
                <p class="text-xs mt-1">Share your wheel to invite friends!</p>
              </div>
            ) : (
              <ul class="space-y-2">
                {connectedPeerIds().map((peerId) => (
                  <li
                    class="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border animate-slide-up"
                    data-testid="active-connection-item"
                  >
                    <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span class="text-sm">👤</span>
                    </div>
                    <span class="font-mono text-sm truncate flex-1">{peerId}</span>
                    <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
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
