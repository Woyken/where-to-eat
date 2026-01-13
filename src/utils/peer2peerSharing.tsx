import Peer, { type DataConnection } from "peerjs";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type ParentProps,
  useContext,
} from "solid-js";
import { unwrap } from "solid-js/store";
import * as v from "valibot";
import { useSettingsStorage } from "~/components/SettingsStorageProvider";
import { p2pRequestStatus, subscribeToPeerStatus } from "./serviceWorkerComm";
import {
  type Peer2PeerDataSchemaType,
  peer2PeerDataSchema,
} from "./serviceWorkerMessages";

// Re-export for backwards compatibility
export {
  type Peer2PeerDataSchemaType,
  peer2PeerDataSchema,
} from "./serviceWorkerMessages";

// ============================================================================
// Leader Election via BroadcastChannel
// Only one tab per browser maintains the PeerJS connection (the "leader").
// Other tabs ("followers") relay messages through the leader.
// ============================================================================

const LEADER_CHANNEL_NAME = "wte-p2p-leader";
const HEARTBEAT_INTERVAL = 1000;
const LEADER_TIMEOUT = 3000;

// Message types for leader election
type LeaderMessage =
  | { type: "heartbeat"; tabId: string; timestamp: number }
  | { type: "claim-leader"; tabId: string }
  | { type: "leader-announce"; tabId: string }
  | { type: "p2p-outgoing"; data: Peer2PeerDataSchemaType }
  | { type: "p2p-incoming"; data: Peer2PeerDataSchemaType }
  | { type: "add-known-peer"; peerId: string }
  | { type: "peer-count-update"; count: number }
  | { type: "open-connections"; peerIds: string[] };

// Generate a unique ID for this tab
const TAB_ID = crypto.randomUUID();

// Get peer ID from service worker (browser-wide, stored in IndexedDB)
const [globalPeerId, setGlobalPeerId] = createSignal<string | undefined>();

// Subscribe to peer status globally to get the peer ID from SW
if (typeof window !== "undefined") {
  subscribeToPeerStatus((status) => {
    if (status.peerId) {
      setGlobalPeerId(status.peerId);
    }
  });
  // Request initial status
  p2pRequestStatus();
}

/**
 * Get the browser-wide peer ID from the service worker.
 * All tabs in the same browser share this peer ID.
 */
export function usePeer2PeerId(): string {
  const peerId = globalPeerId();
  if (peerId) return peerId;

  // Fallback: use sessionStorage while waiting for SW
  const fallbackId =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("fallback-peer-id") ||
        (() => {
          const id = crypto.randomUUID();
          sessionStorage.setItem("fallback-peer-id", id);
          return id;
        })()
      : crypto.randomUUID();

  return fallbackId;
}

const peer2PeerContext = createContext<{
  broadcast: (event: Peer2PeerDataSchemaType) => void;
  sendToPeer: (peerId: string, event: Peer2PeerDataSchemaType) => boolean;
  addNewPeer: (peerId: string) => void;
  isPeerConnected: (peerId: string) => boolean;
  connectedPeerCount: () => number;
  myPeerId: () => string | undefined;
}>();

export function usePeer2Peer() {
  const ctx = useContext(peer2PeerContext);
  if (!ctx) throw new Error("Missing peer2peer provider");
  return ctx;
}

export function usePeer2PeerOptional() {
  return useContext(peer2PeerContext);
}

export function Peer2PeerSharing(props: ParentProps) {
  const settingsStorage = useSettingsStorage();

  // Leader election state
  const [isLeader, setIsLeader] = createSignal(false);
  const [currentLeaderId, setCurrentLeaderId] = createSignal<string | null>(
    null,
  );
  const [lastLeaderHeartbeat, setLastLeaderHeartbeat] = createSignal(0);

  // P2P state (only used by leader, but tracked by all for UI)
  const [knownPeerIds, setKnownPeerIds] = createSignal<Set<string>>(new Set(), {
    equals(prev, next) {
      return prev.symmetricDifference(next).size === 0;
    },
  });
  const [myPeerId, setMyPeerId] = createSignal<string | undefined>();
  const [peer, setPeer] = createSignal<Peer>();
  const [peerStatus, setPeerStatus] = createSignal<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [incomingConnections, setIncomingConnections] = createSignal<
    DataConnection[]
  >([]);
  const [outgoingConnections, setOutgoingConnections] = createSignal<
    DataConnection[]
  >([]);
  const [openConnections, setOpenConnections] = createSignal<Set<string>>(
    new Set(),
  );

  // Peer count (synchronized across all tabs via BroadcastChannel)
  const [peerCount, setPeerCount] = createSignal(0);

  // BroadcastChannel for leader election and message relay
  let leaderChannel: BroadcastChannel | null = null;

  // Computed: currently connected peer IDs (leader only)
  const currentlyConnectedPeerIds = createMemo(
    () => {
      const open = openConnections();
      return new Set(
        [...incomingConnections(), ...outgoingConnections()]
          .filter((conn) => open.has(conn.peer))
          .map((x) => x.peer),
      );
    },
    undefined,
    {
      equals(prev, next) {
        return prev.symmetricDifference(next).size === 0;
      },
    },
  );

  // Computed: connected peer count (leader calculates, followers receive via broadcast)
  const connectedPeerCount = createMemo(() => {
    if (isLeader()) {
      return currentlyConnectedPeerIds().size;
    }
    return peerCount();
  });

  // Broadcast peer count to followers when it changes (leader only)
  createEffect(() => {
    if (!isLeader()) return;
    const count = currentlyConnectedPeerIds().size;
    leaderChannel?.postMessage({
      type: "peer-count-update",
      count,
    } satisfies LeaderMessage);
  });

  // Get peer ID from service worker
  createEffect(() => {
    const unsubscribe = subscribeToPeerStatus((status) => {
      console.log("P2P: Received peer status from SW:", status);
      if (status.peerId) {
        setMyPeerId(status.peerId);
        setGlobalPeerId(status.peerId);
      }
    });
    onCleanup(unsubscribe);
  });

  // Initialize BroadcastChannel and start leader election
  onMount(() => {
    p2pRequestStatus();

    leaderChannel = new BroadcastChannel(LEADER_CHANNEL_NAME);

    leaderChannel.onmessage = (event: MessageEvent<LeaderMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case "heartbeat":
          if (msg.tabId !== TAB_ID) {
            setCurrentLeaderId(msg.tabId);
            setLastLeaderHeartbeat(msg.timestamp);
          }
          break;

        case "claim-leader":
          // Another tab is claiming leadership
          // If we're the leader, re-announce ourselves
          if (isLeader()) {
            console.log(
              "P2P: Someone claiming leadership, re-announcing as leader",
            );
            leaderChannel?.postMessage({
              type: "leader-announce",
              tabId: TAB_ID,
            } satisfies LeaderMessage);
            leaderChannel?.postMessage({
              type: "heartbeat",
              tabId: TAB_ID,
              timestamp: Date.now(),
            } satisfies LeaderMessage);
          }
          break;

        case "leader-announce":
          console.log("P2P: Leader announced:", msg.tabId);
          setCurrentLeaderId(msg.tabId);
          setLastLeaderHeartbeat(Date.now());
          if (msg.tabId !== TAB_ID) {
            setIsLeader(false);
          }
          break;

        case "p2p-incoming":
          // Leader received P2P data, forwarding to all tabs
          handleReceivedData(msg.data, true);
          break;

        case "add-known-peer":
          // A follower wants to add a peer - leader handles it
          if (isLeader()) {
            setKnownPeerIds((old) => new Set(old).add(msg.peerId));
          }
          break;

        case "p2p-outgoing":
          // A follower wants to send a message - leader broadcasts to peers
          if (isLeader()) {
            broadcastToPeers(msg.data);
          }
          break;

        case "peer-count-update":
          // Leader is broadcasting peer count
          if (!isLeader()) {
            setPeerCount(msg.count);
          }
          break;

        case "open-connections":
          // Leader is broadcasting which peers are connected
          if (!isLeader()) {
            setOpenConnections(new Set(msg.peerIds));
          }
          break;
      }
    };

    // Start leader election process
    tryBecomeLeader();

    // Periodically check if leader is still alive
    const leaderCheckInterval = setInterval(() => {
      const now = Date.now();
      const lastHeartbeat = lastLeaderHeartbeat();

      if (isLeader()) {
        // We're the leader, send heartbeat
        leaderChannel?.postMessage({
          type: "heartbeat",
          tabId: TAB_ID,
          timestamp: now,
        } satisfies LeaderMessage);
      } else if (currentLeaderId() && now - lastHeartbeat > LEADER_TIMEOUT) {
        // Leader hasn't sent heartbeat, try to become leader
        console.log("P2P: Leader timeout, attempting takeover");
        tryBecomeLeader();
      }
    }, HEARTBEAT_INTERVAL);

    onCleanup(() => {
      clearInterval(leaderCheckInterval);
      leaderChannel?.close();
    });

    // Load known peers from localStorage
    const knownPeersStr = localStorage.getItem("knownPeers");
    if (knownPeersStr) {
      const existingPeers = JSON.parse(knownPeersStr) as string[];
      setKnownPeerIds((old) => new Set([...old, ...existingPeers]));
    }
  });

  function tryBecomeLeader() {
    console.log("P2P: Attempting to become leader, tabId:", TAB_ID);

    // Announce we're claiming leadership
    leaderChannel?.postMessage({
      type: "claim-leader",
      tabId: TAB_ID,
    } satisfies LeaderMessage);

    // Wait a short time to see if anyone objects
    setTimeout(() => {
      const now = Date.now();
      const lastHeartbeat = lastLeaderHeartbeat();

      // If no leader has sent heartbeat recently, become leader
      if (!currentLeaderId() || now - lastHeartbeat > LEADER_TIMEOUT) {
        console.log("P2P: Becoming leader, tabId:", TAB_ID);
        setIsLeader(true);
        setCurrentLeaderId(TAB_ID);
        setLastLeaderHeartbeat(now);

        // Immediately announce and send heartbeat
        leaderChannel?.postMessage({
          type: "leader-announce",
          tabId: TAB_ID,
        } satisfies LeaderMessage);

        leaderChannel?.postMessage({
          type: "heartbeat",
          tabId: TAB_ID,
          timestamp: now,
        } satisfies LeaderMessage);

        // Initialize PeerJS connection as leader
        initializePeerConnection();
      }
    }, 300); // Reduced from 500ms to be faster
  }

  function initializePeerConnection() {
    const id = myPeerId();
    if (!id) {
      // Wait for peer ID from SW
      const unsubscribe = subscribeToPeerStatus((status) => {
        if (status.peerId) {
          unsubscribe();
          initializePeerConnection();
        }
      });
      return;
    }

    const peerConfig = import.meta.env.VITE_PEER_HOST
      ? {
          host: import.meta.env.VITE_PEER_HOST || "localhost",
          port: Number(import.meta.env.VITE_PEER_PORT) || 9000,
          path: import.meta.env.VITE_PEER_PATH || "/peerjs",
          secure: import.meta.env.VITE_PEER_SECURE === "true",
        }
      : undefined;

    console.log("P2P [Leader]: Creating Peer with config:", peerConfig);
    const newPeer = new Peer(id, peerConfig);

    newPeer.on("open", (peerId) => {
      console.log("P2P [Leader]: Peer open with ID:", peerId);
      setPeerStatus("connected");
    });

    newPeer.on("error", (err) => {
      console.error("P2P [Leader]: Peer error:", err.type, err.message);
    });

    newPeer.on("disconnected", () => {
      console.log("P2P [Leader]: Peer disconnected from signaling server");
      setPeerStatus("disconnected");
      setTimeout(() => {
        if (isLeader()) {
          setPeerStatus("connecting");
          newPeer.reconnect();
        }
      }, 1000);
    });

    newPeer.on("close", () => {
      console.log("P2P [Leader]: Peer connection closed");
      setPeerStatus("disconnected");
    });

    newPeer.on("connection", (connection) => {
      console.log(
        "P2P [Leader]: Incoming peer connection from:",
        connection.peer,
      );
      setupConnection(connection, "incoming");
    });

    onCleanup(() => {
      if (isLeader()) {
        console.log("P2P [Leader]: Destroying peer");
        newPeer.destroy();
      }
    });

    setPeer(newPeer);
  }

  function peerConnectionSend(
    conn: DataConnection,
    data: Peer2PeerDataSchemaType,
  ) {
    if (conn.open) {
      conn.send(data);
    }
  }

  function setupConnection(
    conn: DataConnection,
    direction: "incoming" | "outgoing",
  ) {
    conn.on("open", () => {
      console.log(
        `P2P [Leader]: ${direction} connection opened to:`,
        conn.peer,
      );
      setOpenConnections((prev) => {
        const next = new Set(prev).add(conn.peer);
        // Broadcast open connections to followers (use the new value)
        leaderChannel?.postMessage({
          type: "open-connections",
          peerIds: Array.from(next),
        } satisfies LeaderMessage);
        return next;
      });
      peerConnectionSend(conn, { type: "request-known-peers" });

      // Send all our connection data to the new peer so they have latest state
      // This handles the case where they reconnect after missing updates
      setTimeout(() => {
        const connections = settingsStorage.store.connections;
        for (const connectionData of connections) {
          const data = unwrap(connectionData);
          if (data) {
            console.log(
              "P2P [Leader]: Sending storage to new peer for connection:",
              data.id,
            );
            peerConnectionSend(conn, { type: "storage", data });
          }
        }
      }, 100); // Small delay to let the connection stabilize
    });

    conn.on("data", (rawData) => {
      handleIncomingPeerData(conn, rawData);
    });

    conn.on("close", () => {
      console.log(
        `P2P [Leader]: ${direction} connection closed to:`,
        conn.peer,
      );
      setOpenConnections((prev) => {
        const next = new Set(prev);
        next.delete(conn.peer);
        // Broadcast open connections to followers (use the new value)
        leaderChannel?.postMessage({
          type: "open-connections",
          peerIds: Array.from(next),
        } satisfies LeaderMessage);
        return next;
      });
      if (direction === "incoming") {
        setIncomingConnections((prev) => prev.filter((c) => c !== conn));
      } else {
        setOutgoingConnections((prev) => prev.filter((c) => c !== conn));
      }
    });

    conn.on("error", (err) => {
      console.error(`P2P [Leader]: ${direction} connection error:`, err);
    });

    if (direction === "incoming") {
      setIncomingConnections((prev) => [...prev, conn]);
      setKnownPeerIds((prev) => new Set(prev).add(conn.peer));
    } else {
      setOutgoingConnections((prev) => [...prev, conn]);
    }
  }

  function handleIncomingPeerData(conn: DataConnection, rawData: unknown) {
    const normalizeIncoming = (data: unknown): unknown => {
      if (typeof data === "string") {
        try {
          return JSON.parse(data) as unknown;
        } catch {
          return data;
        }
      }
      if (data instanceof ArrayBuffer) {
        try {
          const text = new TextDecoder().decode(new Uint8Array(data));
          return JSON.parse(text) as unknown;
        } catch {
          return data;
        }
      }
      if (ArrayBuffer.isView(data)) {
        try {
          const view = new Uint8Array(
            data.buffer,
            data.byteOffset,
            data.byteLength,
          );
          const text = new TextDecoder().decode(view);
          return JSON.parse(text) as unknown;
        } catch {
          return data;
        }
      }
      return data;
    };

    const normalized = normalizeIncoming(rawData);
    const parsedData = v.safeParse(peer2PeerDataSchema, normalized);

    if (!parsedData.success) {
      console.warn("P2P [Leader]: Failed to parse peer data:", normalized);
      return;
    }

    const message = parsedData.output;
    console.log("P2P [Leader]: Received peer message type:", message.type);

    // Handle protocol messages locally
    switch (message.type) {
      case "request-known-peers":
        peerConnectionSend(conn, {
          type: "known-peers",
          data: Array.from(knownPeerIds()),
        });
        return;
      case "known-peers":
        setKnownPeerIds((old) => new Set([...old, ...message.data]));
        // Persist gossip-learned peers to localStorage
        persistKnownPeers(message.data);
        return;
    }

    // Forward data messages to all tabs (including self)
    handleReceivedData(message);
    leaderChannel?.postMessage({
      type: "p2p-incoming",
      data: message,
    } satisfies LeaderMessage);
  }

  function handleReceivedData(
    event: Peer2PeerDataSchemaType,
    isFromLocalBroadcast = false,
  ) {
    switch (event.type) {
      case "known-peers":
      case "request-known-peers":
        // Already handled by leader
        break;
      case "request-storage": {
        console.log(
          "P2P: Received request-storage for connectionId:",
          event.data.connectionId,
        );
        // Only the leader should respond to request-storage from peers
        // Followers will also see this via p2p-incoming but should not respond
        // (to avoid duplicate responses)
        if (!isFromLocalBroadcast || isLeader()) {
          const connectionData = unwrap(
            settingsStorage.store.connections.find(
              (c) => c.id === event.data.connectionId,
            ),
          );
          if (connectionData) {
            broadcast({ type: "storage", data: connectionData });
          }
        }
        break;
      }
      case "storage":
        console.log(
          "P2P: Received storage data for connectionId:",
          event.data.id,
        );
        settingsStorage.setConnection(event.data);
        break;
      case "updated-eatery":
        settingsStorage.upsertEatery(
          event.data.connectionId,
          event.data.eatery,
        );
        break;
      case "updated-user":
        settingsStorage.upsertUser(event.data.connectionId, event.data.user);
        break;
      case "updated-eateryScore":
        settingsStorage.upsertScore(
          event.data.connectionId,
          event.data.eateryScore,
        );
        break;
      case "removed-eatery":
        settingsStorage.removeEatery(
          event.data.connectionId,
          event.data.eateryId,
        );
        break;
      case "removed-user":
        settingsStorage.removeUser(event.data.connectionId, event.data.userId);
        break;
      case "updated-connection":
        break;
      default:
        console.warn(
          "P2P: Unknown message type:",
          (event as { type: string }).type,
        );
    }
  }

  createEffect(() => console.log("P2P: Leader changed", isLeader()));
  createEffect(() => console.log("P2P: Peer status changed", peerStatus()));
  createEffect(() => console.log("P2P: Peer changed", peer()));
  createEffect(() => console.log("P2P: My peer ID changed", myPeerId()));
  createEffect(() =>
    console.log("P2P: Known peers changed", Array.from(knownPeerIds())),
  );
  createEffect(() =>
    console.log(
      "P2P: Currently connected peers changed",
      Array.from(currentlyConnectedPeerIds()),
    ),
  );

  // Connect to known peers (leader only)
  // This effect runs when: leader status changes, peer status changes, or known peers change
  createEffect(() => {
    const leader = isLeader();
    const status = peerStatus();
    const p = peer();
    const selfId = myPeerId();
    const knownPeers = knownPeerIds();
    const alreadyConnected = currentlyConnectedPeerIds();

    console.log("P2P: Connect effect running", {
      isLeader: leader,
      peerStatus: status,
      hasPeer: !!p,
      selfId,
      knownPeers: Array.from(knownPeers),
      alreadyConnected: Array.from(alreadyConnected),
    });

    if (!leader) return;
    if (status !== "connected") return;
    if (!p) return;
    if (!selfId) return;

    for (const peerId of knownPeers) {
      if (peerId === selfId) continue;
      if (alreadyConnected.has(peerId)) continue;

      console.log("P2P [Leader]: Connecting to known peer:", peerId);
      const conn = p.connect(peerId, { serialization: "json" });
      setupConnection(conn, "outgoing");
    }
  });

  // Helper to persist known peers to localStorage
  function persistKnownPeers(peerIds: string[]) {
    const knownPeersStr = localStorage.getItem("knownPeers");
    const existingPeers = knownPeersStr
      ? (JSON.parse(knownPeersStr) as string[])
      : [];
    let changed = false;
    for (const peerId of peerIds) {
      if (!existingPeers.includes(peerId)) {
        existingPeers.push(peerId);
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem("knownPeers", JSON.stringify(existingPeers));
    }
  }

  function broadcastToPeers(message: Peer2PeerDataSchemaType) {
    const connections = [...incomingConnections(), ...outgoingConnections()];
    connections.forEach((conn) => peerConnectionSend(conn, message));
  }

  // Public API
  function addNewPeer(peerId: string) {
    console.log("P2P: Adding new known peer:", peerId);

    // Always add to local state first (leader will pick it up via effect)
    setKnownPeerIds((old) => new Set(old).add(peerId));

    if (!isLeader()) {
      // Also tell leader to add this peer
      leaderChannel?.postMessage({
        type: "add-known-peer",
        peerId,
      } satisfies LeaderMessage);
    }

    // Persist to localStorage
    persistKnownPeers([peerId]);

    requestStorageForAllConnections();
  }

  function broadcast(event: Peer2PeerDataSchemaType) {
    console.log("P2P: Broadcasting event:", event.type);

    if (isLeader()) {
      broadcastToPeers(event);
    } else {
      // Send to leader to broadcast
      leaderChannel?.postMessage({
        type: "p2p-outgoing",
        data: event,
      } satisfies LeaderMessage);
    }
  }

  function sendToPeer(peerId: string, event: Peer2PeerDataSchemaType): boolean {
    console.log("P2P: Sending to peer:", peerId, event.type);

    if (isLeader()) {
      const conn = [...incomingConnections(), ...outgoingConnections()].find(
        (c) => c.peer === peerId && c.open,
      );
      if (conn) {
        peerConnectionSend(conn, event);
        return true;
      }
      // Fallback to broadcast
      broadcastToPeers(event);
      return false;
    } else {
      // Send to leader
      leaderChannel?.postMessage({
        type: "p2p-outgoing",
        data: event,
      } satisfies LeaderMessage);
      return true;
    }
  }

  function isPeerConnected(peerId: string): boolean {
    return openConnections().has(peerId);
  }

  function requestStorageForAllConnections() {
    const connectionIds = settingsStorage.store.connections.map((c) => c.id);
    console.log("P2P: Requesting storage for connections:", connectionIds);
    for (const connectionId of connectionIds) {
      broadcast({ type: "request-storage", data: { connectionId } });
    }
  }

  return (
    <peer2PeerContext.Provider
      value={{
        broadcast,
        sendToPeer,
        addNewPeer,
        isPeerConnected,
        connectedPeerCount,
        myPeerId,
      }}
    >
      {props.children}
    </peer2PeerContext.Provider>
  );
}
