import {
  type CollectionConfig,
  createCollection,
  type DeleteMutationFnParams,
  type InsertMutationFnParams,
  type SyncConfig,
  type UpdateMutationFnParams,
  type UtilsRecord,
} from "@tanstack/db";
import localforage from "localforage";
import * as v from "valibot";
import { sendMessageToSW } from "./serviceWorkerComm";
import { addSwToClientMessageListener } from "./serviceWorkerMessages";

// Type for tombstone
type Tombstone = { deletedAt: number };

// Type guard for tombstone (no 'any')
function isTombstone(obj: unknown): obj is Tombstone {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "deletedAt" in obj &&
    typeof obj.deletedAt === "number"
  );
}

// Use sendMessageToSW from serviceWorkerComm for messaging

// Use subscribeToSWMessages from serviceWorkerComm to listen for parsed SW messages

// Strict message types for main <-> service worker
const MutationTypeSchema = v.union([
  v.literal("insert"),
  v.literal("update"),
  v.literal("delete"),
]);

// PeerMutationMessageSchema, GetPeersRequestSchema, and PeerMessageSchema are unused and removed.

interface PeerjsLocalForageCollectionConfig<TItem extends object>
  extends Omit<
    CollectionConfig<TItem, string>,
    "onInsert" | "onUpdate" | "onDelete" | "sync" | "id"
  > {
  id: string;
  peerId: string;
  serviceWorkerUrl?: string; // e.g. "/sw.js"
}

interface PeerjsLocalForageUtils extends UtilsRecord {
  clearStorage: () => Promise<void>;
  getStorageSize: () => Promise<number>;
}

type MutationType = v.InferOutput<typeof MutationTypeSchema>;

export function peerjsLocalForageCollectionOptions<TItem extends object>(
  config: PeerjsLocalForageCollectionConfig<TItem>
): CollectionConfig<TItem, string> & { utils: PeerjsLocalForageUtils } {
  const store = localforage.createInstance({
    name: config.id,
  });
  // SyncConfig for @tanstack/db
  const sync: SyncConfig<TItem, string>["sync"] = (params) => {
    const { begin, write, commit, markReady } = params;

    // Initial load from localForage
    (async () => {
      const keys = await store.keys();
      begin();
      const promises = [];
      for (const key of keys) {
        promises.push(
          store.getItem<TItem | Tombstone>(key).then((value) => {
            if (value && !isTombstone(value)) write({ type: "insert", value });
            if (value && isTombstone(value))
              write({ type: "delete", value: value as unknown as TItem });
          })
        );
      }
      await Promise.all(promises);
      commit();
      markReady();
    })();

    // Listen for service worker messages and handle only valid ones for this collection
    const cleanup = addSwToClientMessageListener((msg) => {
      // Only handle mutation messages for this collection
      if (
        (msg.type === "db-collection-share-insert" ||
          msg.type === "db-collection-share-update" ||
          msg.type === "db-collection-share-delete") &&
        msg.data.collectionId === config.id
      ) {
        const getMsgType = () => {
          switch (msg.type) {
            case "db-collection-share-insert":
              return "insert";
            case "db-collection-share-update":
              return "update";
            case "db-collection-share-delete":
              return "delete";
            default:
              throw new Error(
                `Unknown message type ${
                  // @ts-expect-error message type is expected to be `never`
                  msg.type
                }`
              );
          }
        };
        begin();
        // If message is a delete, store tombstone
        if (msg.type === "db-collection-share-delete") {
          store.setItem(msg.data.key, msg.data.data);
        } else if (!isTombstone(msg.data.data)) {
          // Only write non-tombstoned items
          store.setItem(msg.data.key, msg.data.data);
        }
        write({ type: getMsgType(), value: msg.data.data as TItem });
        commit();
      }
    });

    return () => cleanup();
  };

  // Mutation handlers
  // Helper: mark as tombstone
  function makeTombstone(item: TItem): Tombstone & TItem {
    return {
      ...item,
      deletedAt: Date.now(),
    };
  }

  // Insert: ignore tombstoned items
  const onInsert = async (params: InsertMutationFnParams<TItem, string>) => {
    for (const mutation of params.transaction.mutations) {
      if (isTombstone(mutation.modified)) continue;
      await store.setItem(String(mutation.key), mutation.modified);
      sendMessageToSW({
        type: "db-collection-share-insert",
        data: {
          collectionId: config.id,
          data: mutation.modified,
          key: mutation.key,
        },
      });
    }
  };

  // Update: ignore tombstoned items
  const onUpdate = async (params: UpdateMutationFnParams<TItem, string>) => {
    for (const mutation of params.transaction.mutations) {
      if (isTombstone(mutation.modified)) continue;
      await store.setItem(String(mutation.key), mutation.modified);
      sendMessageToSW({
        type: "db-collection-share-update",
        data: {
          collectionId: config.id,
          data: mutation.modified,
          key: mutation.key,
        },
      });
    }
  };

  // Delete: mark as tombstone instead of removing
  const onDelete = async (params: DeleteMutationFnParams<TItem, string>) => {
    for (const mutation of params.transaction.mutations) {
      const tombstone = makeTombstone(mutation.original);
      await store.setItem(String(mutation.key), tombstone);
      sendMessageToSW({
        type: "db-collection-share-delete",
        data: {
          collectionId: config.id,
          data: tombstone,
          key: mutation.key,
        },
      });
    }
  };

  // Utils
  const clearStorage = async () => {
    await store.clear();
  };
  const getStorageSize = async () => {
    let size = 0;
    const keys = await store.keys();
    for (const key of keys) {
      const value = await store.getItem(key);
      if (value) size += new Blob([JSON.stringify(value)]).size;
    }
    return size;
  };

  return {
    id: config.id,
    schema: config.schema,
    getKey: config.getKey,
    sync: { sync },
    onInsert,
    onUpdate,
    onDelete,
    utils: { clearStorage, getStorageSize },
  };
}
