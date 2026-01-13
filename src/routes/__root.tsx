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
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";
import { SettingsStorageProvider } from "~/components/SettingsStorageProvider";
import { Button } from "~/components/ui/button";
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
            <div class="p-2 flex gap-2 text-lg items-center">
              <Link
                to="/"
                activeProps={{
                  class: "font-bold",
                }}
                activeOptions={{ exact: true }}
              >
                Home
              </Link>{" "}
              <Link
                // @ts-expect-error
                to="/this-route-does-not-exist"
                activeProps={{
                  class: "font-bold",
                }}
              >
                This Route Does Not Exist
              </Link>
              <div class="flex-1" />
              <ConnectedPeerCount />
              <ModeToggle />
            </div>
            <hr />
            <Outlet />
          </Peer2PeerSharing>
        </SettingsStorageProvider>
        <TanStackRouterDevtools position="bottom-right" />
      </ColorModeProvider>
    </>
  );
}

export function ModeToggle() {
  const { setColorMode } = useColorMode();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={Button<"button">}
        variant="ghost"
        size="sm"
        class="w-9 px-0"
      >
        <IconSun class="size-6 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <IconMoon class="absolute size-6 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span class="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => setColorMode("light")}>
          <IconSun class="mr-2 size-4" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode("dark")}>
          <IconMoon class="mr-2 size-4" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode("system")}>
          <IconLaptop class="mr-2 size-4" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConnectedPeerCount() {
  const ctx = usePeer2PeerOptional();

  return (
    <div
      class="flex items-center gap-1 text-sm text-muted-foreground"
      data-testid="connected-peer-count"
      title="Connected peers"
    >
      <IconUsers class="size-4" />
      <span data-testid="peer-count-value">
        {ctx?.connectedPeerCount() ?? 0}
      </span>
    </div>
  );
}
