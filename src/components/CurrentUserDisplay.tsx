import { useLocation } from "@tanstack/solid-router";
import ChevronDown from "lucide-solid/icons/chevron-down";
import User from "lucide-solid/icons/user";
import { createMemo, For, Show } from "solid-js";
import { useCurrentUser } from "~/components/CurrentUserProvider";
import { useSettingsStorage } from "~/components/SettingsStorageProvider";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export function CurrentUserDisplay() {
  const settingsStorage = useSettingsStorage();
  const currentUserCtx = useCurrentUser();
  const location = useLocation();

  // Extract connectionId from the current route path
  const connectionId = createMemo(() => {
    const loc = location();
    const pathname = loc?.pathname ?? "";
    if (!pathname) return null;
    // Match patterns like /wheel/{connectionId} or /settings/{connectionId}
    const wheelMatch = pathname.match(/\/wheel\/([^/]+)/);
    const settingsMatch = pathname.match(/\/settings\/([^/]+)/);
    return wheelMatch?.[1] ?? settingsMatch?.[1] ?? null;
  });

  const currentConnection = createMemo(() => {
    const connId = connectionId();
    if (!connId) return null;
    return settingsStorage.store.connections.find((x) => x.id === connId);
  });

  const activeUsers = createMemo(
    () => currentConnection()?.settings.users.filter((u) => !u._deleted) ?? [],
  );

  const currentUserId = createMemo(() => {
    const connId = connectionId();
    if (!connId) return null;
    return currentUserCtx.getCurrentUser(connId);
  });

  const currentUser = createMemo(() => {
    const userId = currentUserId();
    if (!userId) return null;
    return activeUsers().find((u) => u.id === userId) ?? null;
  });

  const handleUserChange = (userId: string) => {
    const connId = connectionId();
    if (connId) {
      currentUserCtx.setCurrentUser(connId, userId);
    }
  };

  // Only show when we're on a connection route
  return (
    <Show when={connectionId() && currentConnection()}>
      <Show
        when={currentUser()}
        fallback={
          <div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-muted-foreground text-sm">
            <User class="w-4 h-4" />
            <span class="hidden sm:inline">Select identity</span>
          </div>
        }
      >
        {(user) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              as={Button<"button">}
              variant="ghost"
              size="sm"
              class="h-9 gap-2 px-2"
              data-testid="current-user-menu"
            >
              <div class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                {user().name.charAt(0).toUpperCase()}
              </div>
              <span class="hidden sm:inline text-sm font-medium max-w-[100px] truncate">
                {user().name}
              </span>
              <ChevronDown class="w-3 h-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="min-w-[160px]">
              <div class="px-2 py-1.5 text-xs text-muted-foreground">
                Signed in as
              </div>
              <div class="px-2 py-1 font-medium text-sm">{user().name}</div>
              <DropdownMenuSeparator />
              <div class="px-2 py-1.5 text-xs text-muted-foreground">
                Switch to
              </div>
              <For each={activeUsers().filter((u) => u.id !== user().id)}>
                {(otherUser) => (
                  <DropdownMenuItem
                    onSelect={() => handleUserChange(otherUser.id)}
                    class="gap-2 cursor-pointer text-sm"
                    data-testid={`switch-to-user-${otherUser.id}`}
                  >
                    <div class="w-6 h-6 rounded-full bg-secondary/50 flex items-center justify-center text-xs font-semibold">
                      {otherUser.name.charAt(0).toUpperCase()}
                    </div>
                    <span class="truncate">{otherUser.name}</span>
                  </DropdownMenuItem>
                )}
              </For>
              <Show
                when={
                  activeUsers().filter((u) => u.id !== user().id).length === 0
                }
              >
                <div class="px-2 py-2 text-xs text-muted-foreground text-center">
                  No other users
                </div>
              </Show>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </Show>
    </Show>
  );
}
