import * as v from "valibot";

// Storage schemas for P2P data sync - aligned with jsonStorage.ts
export const storageEaterySchema = v.object({
  id: v.string(),
  name: v.string(),
  updatedAt: v.number(),
  _deleted: v.optional(v.boolean()),
});

export const storageUserSchema = v.object({
  id: v.string(),
  name: v.string(),
  email: v.nullable(v.pipe(v.string(), v.email())),
  updatedAt: v.number(),
  _deleted: v.optional(v.boolean()),
});

export const storageEateryScoreSchema = v.object({
  userId: v.string(),
  eateryId: v.string(),
  score: v.number(),
  updatedAt: v.number(),
  _deleted: v.optional(v.boolean()),
});

export const storageEateryVetoSchema = v.object({
  userId: v.string(),
  eateryId: v.string(),
  updatedAt: v.number(),
  _deleted: v.optional(v.boolean()),
});

export const storageSchema = v.object({
  id: v.string(),
  settings: v.object({
    connection: v.object({
      name: v.string(),
      updatedAt: v.number(),
    }),
    eateries: v.array(storageEaterySchema),
    users: v.array(storageUserSchema),
    eateryScores: v.array(storageEateryScoreSchema),
    eateryVetoes: v.optional(v.array(storageEateryVetoSchema)),
  }),
});

// P2P data schema - messages sent between peers
export const peer2PeerDataSchema = v.variant("type", [
  v.object({
    type: v.literal("request-known-peers"),
  }),
  v.object({
    type: v.literal("known-peers"),
    data: v.array(v.string()),
  }),
  v.object({
    type: v.literal("request-connection-ids"),
  }),
  v.object({
    type: v.literal("connection-ids"),
    data: v.array(v.string()),
  }),
  v.object({
    type: v.literal("request-storage"),
    data: v.object({ connectionId: v.string() }),
  }),
  v.object({
    type: v.literal("storage"),
    data: storageSchema,
  }),
  v.object({
    type: v.literal("updated-eatery"),
    data: v.object({ connectionId: v.string(), eatery: storageEaterySchema }),
  }),
  v.object({
    type: v.literal("updated-eateryScore"),
    data: v.object({
      connectionId: v.string(),
      eateryScore: storageEateryScoreSchema,
    }),
  }),
  v.object({
    type: v.literal("updated-eateryVeto"),
    data: v.object({
      connectionId: v.string(),
      eateryVeto: storageEateryVetoSchema,
    }),
  }),
  v.object({
    type: v.literal("updated-user"),
    data: v.object({ connectionId: v.string(), user: storageUserSchema }),
  }),
  v.object({
    type: v.literal("updated-connection"),
    data: v.object({
      connectionId: v.string(),
      connection: v.object({
        name: v.string(),
        updatedAt: v.number(),
      }),
    }),
  }),
  v.object({
    type: v.literal("removed-user"),
    data: v.object({ connectionId: v.string(), userId: v.string() }),
  }),
  v.object({
    type: v.literal("removed-eatery"),
    data: v.object({ connectionId: v.string(), eateryId: v.string() }),
  }),
]);

export type Peer2PeerDataSchemaType = v.InferOutput<typeof peer2PeerDataSchema>;

export const swFromClientMessageSchema = v.variant("type", [
  // P2P messages from client to SW
  v.object({
    type: v.literal("p2p-broadcast"),
    data: peer2PeerDataSchema,
  }),
  v.object({
    type: v.literal("p2p-send-to-peer"),
    data: v.object({
      peerId: v.string(),
      message: peer2PeerDataSchema,
    }),
  }),
  v.object({
    type: v.literal("p2p-add-known-peer"),
    data: v.string(),
  }),
  v.object({
    type: v.literal("p2p-request-status"),
  }),
  // Legacy messages for db-collection sync (still needed)
  v.object({
    type: v.literal("set-known-peer-ids"),
    data: v.array(v.string()),
  }),
  v.object({
    type: v.literal("db-collection-share-insert"),
    data: v.object({
      collectionId: v.string(),
      data: v.unknown(),
      key: v.string(),
    }),
  }),
  v.object({
    type: v.literal("db-collection-share-delete"),
    data: v.object({
      collectionId: v.string(),
      data: v.object({
        deletedAt: v.number(),
      }),
      key: v.string(),
    }),
  }),
  v.object({
    type: v.literal("db-collection-share-update"),
    data: v.object({
      collectionId: v.string(),
      data: v.unknown(),
      key: v.string(),
    }),
  }),
]);

// Lazy-load the BroadcastChannel to avoid SSR issues
let broadcastToClientsChannel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!broadcastToClientsChannel) {
    broadcastToClientsChannel = new BroadcastChannel("peer-data-to-client");
  }
  return broadcastToClientsChannel;
}

export function broadcastToSwClients(
  data: v.InferOutput<typeof swToClientMessageSchema>,
) {
  getChannel()?.postMessage(data);
}

export function addSwToClientMessageListener(
  listener: (data: v.InferOutput<typeof swToClientMessageSchema>) => void,
) {
  const channel = getChannel();
  if (!channel) return () => {};

  const handler = (event: MessageEvent) => {
    const parsedData = v.safeParse(swToClientMessageSchema, event.data);
    if (!parsedData.success) return;
    listener(parsedData.output);
  };

  channel.addEventListener("message", handler);

  return () => {
    channel.removeEventListener("message", handler);
  };
}

export const swToClientMessageSchema = v.variant("type", [
  // P2P status messages from SW to clients
  v.object({
    type: v.literal("p2p-peer-count"),
    data: v.number(),
  }),
  v.object({
    type: v.literal("p2p-status"),
    data: v.object({
      status: v.union([
        v.literal("connecting"),
        v.literal("connected"),
        v.literal("disconnected"),
      ]),
      peerId: v.optional(v.string()),
    }),
  }),
  v.object({
    type: v.literal("p2p-debug"),
    data: v.string(),
  }),
  v.object({
    type: v.literal("p2p-received"),
    data: peer2PeerDataSchema,
  }),
  // Legacy messages for db-collection sync
  v.object({
    type: v.literal("db-collection-share-insert"),
    data: v.object({
      collectionId: v.string(),
      data: v.unknown(),
      key: v.string(),
    }),
  }),
  v.object({
    type: v.literal("db-collection-share-delete"),
    data: v.object({
      collectionId: v.string(),
      data: v.object({
        deletedAt: v.number(),
      }),
      key: v.string(),
    }),
  }),
  v.object({
    type: v.literal("db-collection-share-update"),
    data: v.object({
      collectionId: v.string(),
      data: v.unknown(),
      key: v.string(),
    }),
  }),
  v.object({
    type: v.literal("share-known-peers"),
    data: v.object({
      peers: v.array(v.string()),
    }),
  }),
]);

// Data that can be sent to peers - includes P2P data schema plus db-collection messages
export const peerSendDataSchema = v.union([
  peer2PeerDataSchema,
  v.object({
    type: v.literal("db-collection-share-insert"),
    data: v.object({
      collectionId: v.string(),
      data: v.unknown(),
      key: v.string(),
    }),
  }),
  v.object({
    type: v.literal("db-collection-share-delete"),
    data: v.object({
      collectionId: v.string(),
      data: v.object({
        deletedAt: v.number(),
      }),
      key: v.string(),
    }),
  }),
  v.object({
    type: v.literal("db-collection-share-update"),
    data: v.object({
      collectionId: v.string(),
      data: v.unknown(),
      key: v.string(),
    }),
  }),
  v.object({
    type: v.literal("share-known-peers"),
    data: v.object({
      peers: v.array(v.string()),
    }),
  }),
]);
