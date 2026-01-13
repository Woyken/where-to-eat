import type {
  CollectionConfig,
  DeleteMutationFnParams,
  InsertMutationFnParams,
  SyncConfig,
  UpdateMutationFnParams,
  UtilsRecord,
} from "@tanstack/db";

interface WebSocketMessage<T> {
  type: "insert" | "update" | "delete" | "sync" | "transaction" | "ack";
  data?: T | T[];
  mutations?: Array<{
    type: "insert" | "update" | "delete";
    data: T;
    id?: string;
  }>;
  transactionId?: string;
  id?: string;
}

interface WebSocketCollectionConfig<TItem extends object>
  extends Omit<
    CollectionConfig<TItem>,
    "onInsert" | "onUpdate" | "onDelete" | "sync"
  > {
  url: string;
  reconnectInterval?: number;

  // Note: onInsert/onUpdate/onDelete are handled by the WebSocket connection
  // Users don't provide these handlers
}

interface WebSocketUtils extends UtilsRecord {
  reconnect: () => void;
  getConnectionState: () => "connected" | "disconnected" | "connecting";
}

export function webSocketCollectionOptions<TItem extends object>(
  config: WebSocketCollectionConfig<TItem>,
): CollectionConfig<TItem> & { utils: WebSocketUtils } {
  let ws: WebSocket | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let connectionState: "connected" | "disconnected" | "connecting" =
    "disconnected";

  // Track pending transactions awaiting acknowledgment
  const pendingTransactions = new Map<
    string,
    {
      resolve: () => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  // Sync state setters (will be assigned when sync is called)
  let syncParams: Parameters<SyncConfig<TItem>["sync"]>[0] | null = null;

  // Connect function - defined at module level so it can be used by reconnect
  const connect = () => {
    connectionState = "connecting";
    ws = new WebSocket(config.url);

    ws.onopen = () => {
      connectionState = "connected";
      // Request initial sync
      if (ws) ws.send(JSON.stringify({ type: "sync" }));
    };

    ws.onmessage = (event) => {
      const message: WebSocketMessage<TItem> = JSON.parse(event.data);

      switch (message.type) {
        case "sync":
          // Initial sync with array of items
          if (syncParams) {
            syncParams.begin();
            if (Array.isArray(message.data)) {
              for (const item of message.data) {
                syncParams.write({ type: "insert", value: item });
              }
            }
            syncParams.commit();
            syncParams.markReady();
          }
          break;

        case "insert":
        case "update":
        case "delete":
          // Real-time updates from other clients
          if (syncParams) {
            syncParams.begin();
            syncParams.write({
              type: message.type,
              value: message.data as TItem,
            });
            syncParams.commit();
          }
          break;

        case "ack":
          // Server acknowledged our transaction
          if (message.transactionId) {
            const pending = pendingTransactions.get(message.transactionId);
            if (pending) {
              clearTimeout(pending.timeout);
              pendingTransactions.delete(message.transactionId);
              pending.resolve();
            }
          }
          break;

        case "transaction":
          // Server sending back the actual data after processing our transaction
          if (message.mutations && syncParams) {
            syncParams.begin();
            for (const mutation of message.mutations) {
              syncParams.write({
                type: mutation.type,
                value: mutation.data,
              });
            }
            syncParams.commit();
          }
          break;
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      connectionState = "disconnected";
    };

    ws.onclose = () => {
      connectionState = "disconnected";
      // Auto-reconnect
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, config.reconnectInterval || 5000);
      }
    };
  };

  // Sync is called once on initialization of the collection
  const sync: SyncConfig<TItem>["sync"] = (params) => {
    syncParams = params;

    // Start connection
    connect();

    // Return cleanup function
    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
    };
  };

  // Helper function to send transaction and wait for server acknowledgment
  const sendTransaction = async (
    params:
      | InsertMutationFnParams<TItem>
      | UpdateMutationFnParams<TItem>
      | DeleteMutationFnParams<TItem>,
  ): Promise<void> => {
    if (ws?.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    const transactionId = crypto.randomUUID();

    // Convert all mutations in the transaction to the wire format
    const mutations = params.transaction.mutations.map((mutation) => ({
      type: mutation.type,
      id: mutation.key,
      data:
        mutation.type === "delete"
          ? undefined
          : mutation.type === "update"
            ? mutation.changes
            : mutation.modified,
    }));

    // Send the entire transaction at once
    ws.send(
      JSON.stringify({
        type: "transaction",
        transactionId,
        mutations,
      }),
    );

    // Wait for server acknowledgment
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingTransactions.delete(transactionId);
        reject(new Error(`Transaction ${transactionId} timed out`));
      }, 10000); // 10 second timeout

      pendingTransactions.set(transactionId, {
        resolve,
        reject,
        timeout,
      });
    });
  };

  // All mutation handlers use the same transaction sender
  const onInsert = async (params: InsertMutationFnParams<TItem>) => {
    await sendTransaction(params);
  };

  const onUpdate = async (params: UpdateMutationFnParams<TItem>) => {
    await sendTransaction(params);
  };

  const onDelete = async (params: DeleteMutationFnParams<TItem>) => {
    await sendTransaction(params);
  };

  return {
    id: config.id,
    schema: config.schema,
    getKey: config.getKey,
    sync: { sync },
    onInsert,
    onUpdate,
    onDelete,
    utils: {
      reconnect: () => {
        if (ws) ws.close();
        connect();
      },
      getConnectionState: () => connectionState,
    },
  };
}
