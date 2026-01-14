/// <reference no-default-lib="true"/>
/// <reference lib="WebWorker" />
/// <reference lib="ESNEXT" />

import * as v from "valibot";
import { clientsClaim, skipWaiting } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { logger } from "./utils/logger";
import {
  broadcastToSwClients,
  swFromClientMessageSchema,
} from "./utils/serviceWorkerMessages";

declare let self: ServiceWorkerGlobalScope;

// Take control immediately on install and activate
skipWaiting();
clientsClaim();

// Precache static assets (injected by workbox-build)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigation requests: NetworkFirst with offline fallback
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: "pages-cache",
      networkTimeoutSeconds: 3,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        }),
      ],
    }),
  ),
);

// Static assets: CacheFirst for performance
registerRoute(
  ({ request }) =>
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font",
  new CacheFirst({
    cacheName: "static-assets",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      }),
    ],
  }),
);

// Images: CacheFirst
registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "images-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  }),
);

// IndexedDB helper for persisting browser-wide peer ID
const DB_NAME = "wte-peer-db";
const STORE_NAME = "peer-config";
const PEER_ID_KEY = "browser-peer-id";

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getStoredPeerId(): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(PEER_ID_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as string | null);
  });
}

async function storePeerId(peerId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(peerId, PEER_ID_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Initialize or get browser-wide peer ID
async function initPeerId(): Promise<string> {
  let peerId = await getStoredPeerId();
  if (!peerId) {
    peerId = crypto.randomUUID();
    await storePeerId(peerId);
    logger.log("SW: Generated new browser-wide peer ID:", peerId);
  } else {
    logger.log("SW: Restored browser-wide peer ID:", peerId);
  }
  return peerId;
}

// Store the browser-wide peer ID
let browserPeerId: string | null = null;

// Handle messages from client tabs
// Note: PeerJS/WebRTC is NOT supported in Service Workers.
// P2P connections must be managed in the main thread (client).
// The SW only provides the browser-wide peer ID and can relay messages between tabs.
globalThis.addEventListener("message", async (event: MessageEvent) => {
  const parsedData = v.safeParse(swFromClientMessageSchema, event.data);
  if (!parsedData.success) {
    logger.log("SW: Failed to parse message from client", event.data);
    return;
  }
  const data = parsedData.output;

  switch (data.type) {
    case "p2p-request-status":
      // Initialize peer ID if needed
      if (!browserPeerId) {
        browserPeerId = await initPeerId();
      }
      // Send peer ID to requesting client
      // The client manages the actual P2P connection status
      broadcastToSwClients({
        type: "p2p-status",
        data: { status: "disconnected", peerId: browserPeerId },
      });
      return;

    case "p2p-broadcast":
    case "p2p-send-to-peer":
    case "p2p-add-known-peer":
    case "set-known-peer-ids":
      // These are now handled by the client-side P2P code
      // SW can relay these to other tabs if needed
      logger.log("SW: Received P2P message (client handles):", data.type);
      return;

    case "db-collection-share-insert":
    case "db-collection-share-delete":
    case "db-collection-share-update":
      // These should be handled by the client-side P2P code
      logger.log("SW: Received DB sync message (client handles):", data.type);
      return;

    default:
      logger.warn(
        "SW: Unknown message type received:",
        // @ts-expect-error data type is expected to be `never`
        data.type,
      );
  }
});

// Initialize peer ID on SW startup
(async () => {
  try {
    browserPeerId = await initPeerId();
    logger.log("SW: Peer ID initialized:", browserPeerId);
    // Broadcast to any existing clients
    broadcastToSwClients({
      type: "p2p-status",
      data: { status: "disconnected", peerId: browserPeerId },
    });
  } catch (err) {
    logger.error("SW: Failed to initialize peer ID:", err);
  }
})();

logger.log("SW: Service worker loaded (P2P handled in client)");
