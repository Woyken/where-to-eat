import * as Solid from "solid-js";
import { createStore, reconcile } from "solid-js/store";

type CurrentUserStore = {
  /** Map of connectionId -> userId */
  userByConnection: Record<string, string>;
};

type CurrentUserContext = {
  store: CurrentUserStore;
  getCurrentUser: (connectionId: string) => string | null;
  setCurrentUser: (connectionId: string, userId: string) => void;
  clearCurrentUser: (connectionId: string) => void;
};

const CurrentUserContext = Solid.createContext<CurrentUserContext>();

export const useCurrentUser = () => {
  const ctx = Solid.useContext(CurrentUserContext);
  if (!ctx) throw new Error("missing CurrentUserProvider");
  return ctx;
};

const STORAGE_KEY = "wte-current-users";

export function CurrentUserProvider(props: Solid.ParentProps) {
  const stored =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
      : null;
  const initialData: CurrentUserStore = stored
    ? JSON.parse(stored)
    : { userByConnection: {} };

  const [store, setStore] = createStore<CurrentUserStore>(initialData);

  // Sync to localStorage
  Solid.createEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    }
  });

  // Listen for changes from other tabs
  Solid.onMount(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const newData = JSON.parse(e.newValue);
          setStore(reconcile(newData));
        } catch (err) {
          console.error("Failed to parse current user storage update", err);
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    Solid.onCleanup(() => window.removeEventListener("storage", handleStorage));
  });

  const ctxValue: CurrentUserContext = {
    store,
    getCurrentUser: (connectionId: string) => {
      return store.userByConnection[connectionId] ?? null;
    },
    setCurrentUser: (connectionId: string, userId: string) => {
      setStore("userByConnection", connectionId, userId);
    },
    clearCurrentUser: (connectionId: string) => {
      setStore(
        "userByConnection",
        connectionId,
        undefined as unknown as string,
      );
    },
  };

  return (
    <CurrentUserContext.Provider value={ctxValue}>
      {props.children}
    </CurrentUserContext.Provider>
  );
}
