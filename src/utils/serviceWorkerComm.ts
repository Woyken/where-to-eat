import type * as v from "valibot";
import { Workbox } from "workbox-window";
import {
  addSwToClientMessageListener,
  type Peer2PeerDataSchemaType,
  type swFromClientMessageSchema,
} from "./serviceWorkerMessages";

// Declare window for TypeScript in non-browser contexts (like service workers)
declare const window: (Window & typeof globalThis) | undefined;

// Lazy-load Workbox service worker to avoid SSR issues
let wb: Workbox | null = null;
let wbRegistered = false;

function getWorkbox(): Workbox | null {
  if (typeof window === "undefined") return null;
  if (!wb) {
    wb = new Workbox("/sw.js");
  }
  if (!wbRegistered) {
    wbRegistered = true;
    wb.register();

    // On activation, request status from service worker
    wb.addEventListener("activated", () => {
      console.log("SW activated, requesting P2P status");
      // Request current status from service worker
      p2pRequestStatus();

      // Send known peers from localStorage to service worker
      const knownPeersStr = localStorage.getItem("knownPeers");
      const knownPeers = knownPeersStr
        ? (JSON.parse(knownPeersStr) as string[])
        : [];

      if (knownPeers.length > 0) {
        sendMessageToSW({
          type: "set-known-peer-ids",
          data: knownPeers,
        });
      }
    });
  }
  return wb;
}

// Helper to send messages to the service worker using Workbox
export function sendMessageToSW(
  data: v.InferOutput<typeof swFromClientMessageSchema>,
) {
  const workbox = getWorkbox();
  if (workbox) {
    void workbox.messageSW(data);
  }
}

// P2P communication helpers

// Broadcast a P2P message to all connected peers via service worker
export function p2pBroadcast(message: Peer2PeerDataSchemaType) {
  sendMessageToSW({
    type: "p2p-broadcast",
    data: message,
  });
}

// Send a P2P message to a specific peer via service worker
export function p2pSendToPeer(
  peerId: string,
  message: Peer2PeerDataSchemaType,
) {
  sendMessageToSW({
    type: "p2p-send-to-peer",
    data: { peerId, message },
  });
}

// Add a known peer ID to the service worker
export function p2pAddKnownPeer(peerId: string) {
  sendMessageToSW({
    type: "p2p-add-known-peer",
    data: peerId,
  });
}

// Request current P2P status from service worker
export function p2pRequestStatus() {
  sendMessageToSW({
    type: "p2p-request-status",
  });
}

// Subscribe to peer count updates
export function subscribeToPeerCount(
  callback: (count: number) => void,
): () => void {
  return addSwToClientMessageListener((data) => {
    if (data.type === "p2p-peer-count") {
      callback(data.data);
    }
  });
}

// Subscribe to P2P status updates
export function subscribeToPeerStatus(
  callback: (status: {
    status: "connecting" | "connected" | "disconnected";
    peerId?: string;
  }) => void,
): () => void {
  return addSwToClientMessageListener((data) => {
    if (data.type === "p2p-status") {
      callback(data.data);
    }
  });
}

// Subscribe to P2P received messages
export function subscribeToP2PMessages(
  callback: (message: Peer2PeerDataSchemaType) => void,
): () => void {
  return addSwToClientMessageListener((data) => {
    if (data.type === "p2p-received") {
      callback(data.data);
    }
  });
}

// Subscribe to debug messages from service worker
export function subscribeToDebugMessages(): () => void {
  return addSwToClientMessageListener((data) => {
    if (data.type === "p2p-debug") {
      console.log("[SW DEBUG]", data.data);
    }
  });
}

// Ensure workbox is initialized on first use in client
if (typeof window !== "undefined") {
  getWorkbox();
  // Auto-subscribe to debug messages
  subscribeToDebugMessages();
}

// Re-export message listener for backwards compatibility
export { addSwToClientMessageListener } from "./serviceWorkerMessages";
