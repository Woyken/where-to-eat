import * as Solid from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import type { StorageSchemaType } from "~/utils/jsonStorage";

type SettingsStorage = {
  store: { connections: StorageSchemaType[] };
  addNewConnection: (name: string) => string;
  removeConnection: (id: string) => void;
  updateConnection: (id: string, name: string, updatedAt?: number) => void;
  upsertConnectionInfo: (
    connectionId: string,
    connection: StorageSchemaType["settings"]["connection"],
  ) => void;
  setConnection: (connection: StorageSchemaType) => void;
  addUser: (connectionId: string, name: string, email?: string) => string;
  removeUser: (connectionId: string, userId: string) => void;
  updateUser: (
    connectionId: string,
    userId: string,
    name: string,
    email?: string,
  ) => void;
  updateScore: (
    connectionId: string,
    userId: string,
    eateryId: string,
    score: number,
  ) => void;
  addEatery: (
    connectionId: string,
    name: string,
  ) => {
    eateryId: string;
    createdScores: StorageSchemaType["settings"]["eateryScores"];
  };
  removeEatery: (connectionId: string, eateryId: string) => void;
  updateEatery: (connectionId: string, eateryId: string, name: string) => void;
  upsertEatery: (
    connectionId: string,
    eatery: StorageSchemaType["settings"]["eateries"][0],
  ) => void;
  upsertUser: (
    connectionId: string,
    user: StorageSchemaType["settings"]["users"][0],
  ) => void;
  upsertScore: (
    connectionId: string,
    score: StorageSchemaType["settings"]["eateryScores"][0],
  ) => void;
  toggleVeto: (
    connectionId: string,
    userId: string,
    eateryId: string,
  ) =>
    | NonNullable<StorageSchemaType["settings"]["eateryVetoes"]>[0]
    | undefined;
  upsertVeto: (
    connectionId: string,
    veto: NonNullable<StorageSchemaType["settings"]["eateryVetoes"]>[0],
  ) => void;
};

const SettingsStorageContext = Solid.createContext<SettingsStorage>();

export const useSettingsStorage = () => {
  const ctx = Solid.useContext(SettingsStorageContext);
  if (!ctx) throw new Error("missing storage settings provider");
  return ctx ?? { store: { connections: [] } };
};

export function SettingsStorageProvider(props: Solid.ParentProps) {
  const stored =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("wte-connections")
      : null;
  const initialConnections = stored ? JSON.parse(stored) : [];

  const [store, setSettings] = createStore<{
    connections: StorageSchemaType[];
  }>({
    connections: initialConnections,
  });

  Solid.onMount(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "wte-connections" && e.newValue) {
        try {
          const newData = JSON.parse(e.newValue);
          setSettings("connections", reconcile(newData));
        } catch (err) {
          console.error("Failed to parse storage update", err);
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    Solid.onCleanup(() => window.removeEventListener("storage", handleStorage));
  });

  Solid.createEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(
        "wte-connections",
        JSON.stringify(store.connections),
      );
    }
  });

  const ctxValue: SettingsStorage = {
    store: store,
    addNewConnection: (name: string) => {
      // TODO save all these to local storage

      // localStorage.setItem(
      //   `eatery-settings-${newId}`,
      //   JSON.stringify(initialSettings),
      // );

      const newId = crypto.randomUUID();

      const eateries = [
        {
          id: crypto.randomUUID(),
          name: "Pizza place on the corner",
          updatedAt: Date.now(),
        },
        {
          id: crypto.randomUUID(),
          name: "Chinese takeout",
          updatedAt: Date.now(),
        },
      ];
      const users = [
        {
          id: crypto.randomUUID(),
          name: "Ben",
          email: null,
          updatedAt: Date.now(),
        },
        {
          id: crypto.randomUUID(),
          name: "Daniel",
          email: null,
          updatedAt: Date.now(),
        },
      ];
      const scores = [
        {
          userId: users[0].id,
          eateryId: eateries[0].id,
          score: 75,
          updatedAt: Date.now(),
        },
        {
          userId: users[0].id,
          eateryId: eateries[1].id,
          score: 20,
          updatedAt: Date.now(),
        },
        {
          userId: users[1].id,
          eateryId: eateries[0].id,
          score: 25,
          updatedAt: Date.now(),
        },
        {
          userId: users[1].id,
          eateryId: eateries[1].id,
          score: 45,
          updatedAt: Date.now(),
        },
      ];

      // Initialize empty settings for new connection
      const initialSettings: StorageSchemaType = {
        id: newId,
        settings: {
          connection: {
            name: name,
            updatedAt: Date.now(),
          },
          eateries: eateries,
          eateryScores: scores,
          users: users,
          eateryVetoes: [],
        },
      };

      setSettings("connections", store.connections.length, {
        ...initialSettings,
      });

      return newId;
    },
    removeConnection: (id: string) => {
      setSettings(
        "connections",
        // TODO reconcile or not?
        store.connections.filter((x) => x.id !== id),
        //reconcile(store.connections.filter((x) => x.id !== id)),
      );
    },
    updateConnection: (id: string, name: string, updatedAt?: number) => {
      const connectionIdx = store.connections.findIndex((x) => x.id === id);
      if (connectionIdx === -1) return;

      setSettings(
        "connections",
        connectionIdx,
        "settings",
        "connection",
        reconcile({
          name,
          updatedAt: updatedAt ?? Date.now(),
        }),
      );
    },
    upsertConnectionInfo: (
      connectionId: string,
      connection: StorageSchemaType["settings"]["connection"],
    ) => {
      const connectionIdx = store.connections.findIndex(
        (x) => x.id === connectionId,
      );

      if (connectionIdx === -1) {
        const stub: StorageSchemaType = {
          id: connectionId,
          settings: {
            connection,
            eateries: [],
            users: [],
            eateryScores: [],
            eateryVetoes: [],
          },
        };
        setSettings("connections", store.connections.length, stub);
        return;
      }

      const existing = store.connections[connectionIdx].settings.connection;
      if ((connection.updatedAt ?? 0) <= (existing.updatedAt ?? 0)) return;

      setSettings(
        "connections",
        connectionIdx,
        "settings",
        "connection",
        reconcile(connection),
      );
    },
    setConnection: (connection: StorageSchemaType) => {
      const foundIdx = store.connections.findIndex(
        (x) => x.id === connection.id,
      );
      if (foundIdx !== -1) {
        // Reconcile all entities by id, keeping the latest updatedAt
        const existing = store.connections[foundIdx];

        const mergeByIdLastUpdatedAt = <
          T extends { id: string; updatedAt?: number },
        >(
          existingItems: T[],
          receivedItems: T[],
        ) => {
          const map = new Map<string, T>();
          for (const existingItem of existingItems)
            map.set(existingItem.id, existingItem);
          for (const receivedItem of receivedItems) {
            const exist = map.get(receivedItem.id);
            if (
              !exist ||
              (receivedItem.updatedAt ?? 0) > (exist.updatedAt ?? 0)
            ) {
              map.set(receivedItem.id, receivedItem);
            }
          }
          return Array.from(map.values());
        };

        const mergedUsers = mergeByIdLastUpdatedAt(
          existing.settings.users,
          connection.settings.users,
        );
        const mergedEateries = mergeByIdLastUpdatedAt(
          existing.settings.eateries,
          connection.settings.eateries,
        );

        const mergeScores = <
          T extends { userId: string; eateryId: string; updatedAt?: number },
        >(
          aArr: T[],
          bArr: T[],
        ) => {
          const map = new Map<string, T>();
          for (const item of aArr)
            map.set(`${item.userId}|${item.eateryId}`, item);
          for (const item of bArr) {
            const key = `${item.userId}|${item.eateryId}`;
            const exist = map.get(key);
            if (!exist || (item.updatedAt ?? 0) > (exist.updatedAt ?? 0)) {
              map.set(key, item);
            }
          }
          return Array.from(map.values());
        };

        setSettings(
          "connections",
          foundIdx,
          reconcile({
            id: existing.id,
            settings: {
              connection:
                connection.settings.connection.updatedAt >
                existing.settings.connection.updatedAt
                  ? connection.settings.connection
                  : existing.settings.connection,
              users: mergedUsers,
              eateries: mergedEateries,
              eateryScores: mergeScores(
                existing.settings.eateryScores,
                connection.settings.eateryScores,
              ),
              eateryVetoes: mergeScores(
                existing.settings.eateryVetoes ?? [],
                connection.settings.eateryVetoes ?? [],
              ),
            },
          }),
        );
      } else {
        setSettings("connections", store.connections.length, connection);
      }
    },
    addUser: (connectionId: string, name: string, email?: string) => {
      const connectionIdx = store.connections.findIndex(
        (x) => x.id === connectionId,
      );
      if (connectionIdx === -1) throw new Error("Connection not found");

      const newUser = {
        id: crypto.randomUUID(),
        name,
        email: email ?? null,
        updatedAt: Date.now(),
      };
      setSettings(
        "connections",
        connectionIdx,
        "settings",
        "users",
        store.connections[connectionIdx].settings.users.length,
        {
          ...newUser,
        },
      );

      return newUser.id;
    },
    removeUser: (connectionId: string, userId: string) => {
      const connectionIdx = store.connections.findIndex(
        (x) => x.id === connectionId,
      );
      if (connectionIdx === -1) return;

      const userIdx = store.connections[connectionIdx].settings.users.findIndex(
        (x) => x.id === userId,
      );
      if (userIdx !== -1) {
        const user = unwrap(
          store.connections[connectionIdx].settings.users[userIdx],
        );
        setSettings(
          "connections",
          connectionIdx,
          "settings",
          "users",
          userIdx,
          {
            ...user,
            _deleted: true,
            updatedAt: Date.now(),
          },
        );
      }

      // Soft delete scores
      // We can iterate and update all scores for this user
      const scores = store.connections[connectionIdx].settings.eateryScores;
      for (let i = 0; i < scores.length; i++) {
        if (scores[i].userId === userId) {
          setSettings(
            "connections",
            connectionIdx,
            "settings",
            "eateryScores",
            i,
            reconcile({
              ...scores[i],
              _deleted: true,
              updatedAt: Date.now(),
            }),
          );
        }
      }
    },
    updateUser: (
      connectionId: string,
      userId: string,
      name: string,
      email?: string,
    ) => {
      const connectionIdx = store.connections.findIndex(
        (x) => x.id === connectionId,
      );
      if (connectionIdx === -1) return;

      const userIdx = store.connections[connectionIdx].settings.users.findIndex(
        (x) => x.id === userId,
      );
      if (userIdx === -1) return;

      setSettings(
        "connections",
        connectionIdx,
        "settings",
        "users",
        userIdx,
        reconcile({
          id: userId,
          name,
          email: email ?? null,
          updatedAt: Date.now(),
        }),
      );
    },
    updateScore: (
      connectionId: string,
      userId: string,
      eateryId: string,
      score: number,
    ) => {
      const connectionIdx = store.connections.findIndex(
        (x) => x.id === connectionId,
      );
      if (connectionIdx === -1) return;

      const scoreIdx = store.connections[
        connectionIdx
      ].settings.eateryScores.findIndex(
        (x) => x.userId === userId && x.eateryId === eateryId,
      );

      const newScore = {
        userId,
        eateryId,
        score,
        updatedAt: Date.now(),
      };

      if (scoreIdx === -1) {
        setSettings(
          "connections",
          connectionIdx,
          "settings",
          "eateryScores",
          store.connections[connectionIdx].settings.eateryScores.length,
          newScore,
        );
      } else {
        setSettings(
          "connections",
          connectionIdx,
          "settings",
          "eateryScores",
          scoreIdx,
          reconcile(newScore),
        );
      }
    },
    addEatery: (connectionId, name) => {
      const connectionIdx = store.connections.findIndex(
        (x) => x.id === connectionId,
      );
      if (connectionIdx === -1) throw new Error("Connection not found");

      const newEatery = {
        id: crypto.randomUUID(),
        name,
        updatedAt: Date.now(),
      };

      const createdScores: StorageSchemaType["settings"]["eateryScores"] = [];

      setSettings(
        "connections",
        connectionIdx,
        "settings",
        "eateries",
        store.connections[connectionIdx].settings.eateries.length,
        {
          ...newEatery,
        },
      );

      return { eateryId: newEatery.id, createdScores: [] };
    },
    removeEatery: (connectionId, eateryId) => {
      const connectionIdx = store.connections.findIndex(
        (x) => x.id === connectionId,
      );
      if (connectionIdx === -1) return;

      const eateryIdx = store.connections[
        connectionIdx
      ].settings.eateries.findIndex((x) => x.id === eateryId);
      if (eateryIdx !== -1) {
        const eatery = unwrap(
          store.connections[connectionIdx].settings.eateries[eateryIdx],
        );
        setSettings(
          "connections",
          connectionIdx,
          "settings",
          "eateries",
          eateryIdx,
          {
            ...eatery,
            _deleted: true,
            updatedAt: Date.now(),
          },
        );
      }

      // Soft delete scores
      const scores = store.connections[connectionIdx].settings.eateryScores;
      for (let i = 0; i < scores.length; i++) {
        if (scores[i].eateryId === eateryId) {
          setSettings(
            "connections",
            connectionIdx,
            "settings",
            "eateryScores",
            i,
            reconcile({
              ...scores[i],
              _deleted: true,
              updatedAt: Date.now(),
            }),
          );
        }
      }
    },
    updateEatery: (connectionId, eateryId, name) => {
      const connectionIdx = store.connections.findIndex(
        (x) => x.id === connectionId,
      );
      if (connectionIdx === -1) return;

      const eateryIdx = store.connections[
        connectionIdx
      ].settings.eateries.findIndex((x) => x.id === eateryId);
      if (eateryIdx === -1) return;

      setSettings(
        "connections",
        connectionIdx,
        "settings",
        "eateries",
        eateryIdx,
        reconcile({
          id: eateryId,
          name,
          updatedAt: Date.now(),
        }),
      );
    },
    upsertEatery: (connectionId, eatery) => {
      const connectionIdx = store.connections.findIndex(
        (x) => x.id === connectionId,
      );
      if (connectionIdx === -1) return;

      const eateryIdx = store.connections[
        connectionIdx
      ].settings.eateries.findIndex((x) => x.id === eatery.id);

      if (eateryIdx === -1) {
        setSettings(
          "connections",
          connectionIdx,
          "settings",
          "eateries",
          store.connections[connectionIdx].settings.eateries.length,
          eatery,
        );
      } else {
        const existing =
          store.connections[connectionIdx].settings.eateries[eateryIdx];
        if (eatery.updatedAt > (existing.updatedAt ?? 0)) {
          setSettings(
            "connections",
            connectionIdx,
            "settings",
            "eateries",
            eateryIdx,
            eatery,
          );
        }
      }
    },
    upsertUser: (connectionId, user) => {
      const connectionIdx = store.connections.findIndex(
        (x) => x.id === connectionId,
      );
      if (connectionIdx === -1) return;

      const userIdx = store.connections[connectionIdx].settings.users.findIndex(
        (x) => x.id === user.id,
      );

      if (userIdx === -1) {
        setSettings(
          "connections",
          connectionIdx,
          "settings",
          "users",
          store.connections[connectionIdx].settings.users.length,
          user,
        );
      } else {
        const existing =
          store.connections[connectionIdx].settings.users[userIdx];
        if (user.updatedAt > (existing.updatedAt ?? 0)) {
          setSettings(
            "connections",
            connectionIdx,
            "settings",
            "users",
            userIdx,
            user,
          );
        }
      }
    },
    upsertScore: (connectionId, score) => {
      const connectionIdx = store.connections.findIndex(
        (x) => x.id === connectionId,
      );
      if (connectionIdx === -1) {
        return;
      }

      const scoreIdx = store.connections[
        connectionIdx
      ].settings.eateryScores.findIndex(
        (x) => x.userId === score.userId && x.eateryId === score.eateryId,
      );

      if (scoreIdx === -1) {
        setSettings(
          "connections",
          connectionIdx,
          "settings",
          "eateryScores",
          (scores) => [...scores, score],
        );
      } else {
        const existing =
          store.connections[connectionIdx].settings.eateryScores[scoreIdx];
        if (score.updatedAt > (existing.updatedAt ?? 0)) {
          setSettings(
            "connections",
            connectionIdx,
            "settings",
            "eateryScores",
            scoreIdx,
            score,
          );
        }
      }
    },

    toggleVeto: (connectionId, userId, eateryId) => {
      const connectionIdx = store.connections.findIndex(
        (x) => x.id === connectionId,
      );
      if (connectionIdx === -1) return undefined;

      const vetoes =
        store.connections[connectionIdx].settings.eateryVetoes ?? [];
      const vetoIdx = vetoes.findIndex(
        (x) => x.userId === userId && x.eateryId === eateryId,
      );

      const now = Date.now();

      if (vetoIdx === -1) {
        const newVeto = {
          userId,
          eateryId,
          updatedAt: now,
          _deleted: false,
        };
        setSettings(
          "connections",
          connectionIdx,
          "settings",
          "eateryVetoes",
          (v) => [...(v ?? []), newVeto],
        );
        return newVeto;
      }

      const existingVeto = vetoes[vetoIdx];
      const updatedVeto = {
        ...existingVeto,
        _deleted: !existingVeto._deleted,
        updatedAt: now,
      };

      setSettings(
        "connections",
        connectionIdx,
        "settings",
        "eateryVetoes",
        vetoIdx,
        reconcile(updatedVeto),
      );

      return updatedVeto;
    },

    upsertVeto: (connectionId, veto) => {
      const connectionIdx = store.connections.findIndex(
        (x) => x.id === connectionId,
      );
      if (connectionIdx === -1) return;

      const vetoes =
        store.connections[connectionIdx].settings.eateryVetoes ?? [];
      const vetoIdx = vetoes.findIndex(
        (x) => x.userId === veto.userId && x.eateryId === veto.eateryId,
      );

      if (vetoIdx === -1) {
        setSettings(
          "connections",
          connectionIdx,
          "settings",
          "eateryVetoes",
          (v) => [...(v ?? []), veto],
        );
      } else {
        const existing = vetoes[vetoIdx];
        if (veto.updatedAt > (existing.updatedAt ?? 0)) {
          setSettings(
            "connections",
            connectionIdx,
            "settings",
            "eateryVetoes",
            vetoIdx,
            veto,
          );
        }
      }
    },
  };

  return (
    <SettingsStorageContext.Provider value={ctxValue}>
      {props.children}
    </SettingsStorageContext.Provider>
  );
}
