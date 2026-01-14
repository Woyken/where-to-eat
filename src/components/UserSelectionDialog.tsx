import Plus from "lucide-solid/icons/plus";
import User from "lucide-solid/icons/user";
import { createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import type { StorageSchemaType } from "~/utils/jsonStorage";

interface UserSelectionDialogProps {
  open: boolean;
  onSelect: (userId: string) => void;
  onAddNew: (name: string) => string;
  users: StorageSchemaType["settings"]["users"];
  connectionName?: string;
}

export function UserSelectionDialog(props: UserSelectionDialogProps) {
  const [showAddNew, setShowAddNew] = createSignal(false);
  const [newUserName, setNewUserName] = createSignal("");

  const activeUsers = () => props.users.filter((u) => !u._deleted);

  const handleAddNew = () => {
    const name = newUserName().trim();
    if (!name) return;
    const userId = props.onAddNew(name);
    setNewUserName("");
    setShowAddNew(false);
    props.onSelect(userId);
  };

  return (
    <Dialog open={props.open} onOpenChange={() => {}}>
      <DialogContent
        class="sm:max-w-md"
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <User class="w-5 h-5 text-primary" />
            Who are you?
          </DialogTitle>
          <DialogDescription>
            {props.connectionName
              ? `Select your identity for "${props.connectionName}"`
              : "Select your identity for this session"}
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 pt-2">
          <Show
            when={!showAddNew()}
            fallback={
              <div class="space-y-4">
                <TextField
                  value={newUserName()}
                  onChange={(e) => setNewUserName(e)}
                >
                  <TextFieldLabel
                    for="new-user-name"
                    class="text-sm font-medium"
                  >
                    Your Name
                  </TextFieldLabel>
                  <TextFieldInput
                    type="text"
                    id="new-user-name"
                    placeholder="Enter your name"
                    class="h-10"
                    data-testid="new-user-name-input"
                    autofocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddNew();
                      }
                    }}
                  />
                </TextField>
                <div class="flex gap-2">
                  <Button
                    variant="outline"
                    class="flex-1"
                    onClick={() => {
                      setShowAddNew(false);
                      setNewUserName("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    class="flex-1"
                    onClick={handleAddNew}
                    disabled={!newUserName().trim()}
                    data-testid="confirm-new-user"
                  >
                    <Plus class="w-4 h-4" />
                    Join
                  </Button>
                </div>
              </div>
            }
          >
            <div class="space-y-2">
              <Show
                when={activeUsers().length > 0}
                fallback={
                  <div class="text-center py-6 text-muted-foreground border border-dashed border-border rounded-md">
                    <p class="text-sm">No participants yet</p>
                    <p class="text-xs mt-1">Add yourself to get started</p>
                  </div>
                }
              >
                <p class="text-sm text-muted-foreground">Select your name:</p>
                <div class="space-y-2 max-h-60 overflow-y-auto">
                  <For each={activeUsers()}>
                    {(user) => (
                      <button
                        type="button"
                        class="w-full flex items-center gap-3 p-3 rounded-md border border-border hover:bg-muted/50 hover:border-primary/50 transition-colors text-left"
                        onClick={() => props.onSelect(user.id)}
                        data-testid={`select-user-${user.id}`}
                      >
                        <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="font-medium truncate">{user.name}</p>
                        </div>
                      </button>
                    )}
                  </For>
                </div>
              </Show>

              <div class="pt-2">
                <Button
                  variant="outline"
                  class="w-full"
                  onClick={() => setShowAddNew(true)}
                  data-testid="add-new-user-button"
                >
                  <Plus class="w-4 h-4" />
                  I'm someone new
                </Button>
              </div>
            </div>
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  );
}
