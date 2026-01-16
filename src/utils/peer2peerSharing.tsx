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
import { logger } from "./logger";
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
  | { type: "add-known-peer"; peerId: string; connectionId: string }
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

// Fallback peer ID (generated once per session if SW is slow to respond)
let fallbackPeerId: string | undefined;
function getFallbackPeerId(): string {
  if (fallbackPeerId) return fallbackPeerId;

  if (typeof sessionStorage !== "undefined") {
    const stored = sessionStorage.getItem("fallback-peer-id");
    if (stored) {
      fallbackPeerId = stored;
      return stored;
    }
    const id = crypto.randomUUID();
    sessionStorage.setItem("fallback-peer-id", id);
    fallbackPeerId = id;
    return id;
  }
  fallbackPeerId = crypto.randomUUID();
  return fallbackPeerId;
}

/**
 * Get the browser-wide peer ID from the service worker.
 * All tabs in the same browser share this peer ID.
 * Returns an accessor function for reactivity - the value may update
 * when the service worker responds with the real peer ID.
 */
export function usePeer2PeerId(): () => string {
  // Create a memo that returns the global peer ID or fallback
  // This ensures reactivity when globalPeerId updates
  const peerId = createMemo(() => {
    const swPeerId = globalPeerId();
    if (swPeerId) return swPeerId;
    return getFallbackPeerId();
  });

  return peerId;
}

const peer2PeerContext = createContext<{
  /** Broadcast to all connected peers - use only for non-connection-specific messages */
  broadcast: (event: Peer2PeerDataSchemaType) => void;
  /** Broadcast only to peers that share this connection */
  broadcastToConnection: (connectionId: string, event: Peer2PeerDataSchemaType) => void;
  sendToPeer: (peerId: string, event: Peer2PeerDataSchemaType) => boolean;
  addNewPeer: (peerId: string, connectionId: string) => void;
  isPeerConnected: (peerId: string) => boolean;
  connectedPeerCount: () => number;
  connectedPeerIds: () => string[];
  myPeerId: () => string | undefined;
  /** Status of the PeerJS signaling server connection */
  serverStatus: () => "connecting" | "connected" | "disconnected";
  /** Whether this tab is the leader (manages the PeerJS connection) */
  isLeader: () => boolean;
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
  // Known peers are now stored per-connection in settingsStorage
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
  // Track peers we've already exchanged connection-ids with (to avoid infinite loops)
  const [syncedPeers, setSyncedPeers] = createSignal<Set<string>>(new Set(), {
    equals(prev, next) {
      return prev.symmetricDifference(next).size === 0;
    },
  });

  // Track peers that should be added to connections we don't have yet
  // Key: connectionId, Value: Set of peerIds
  // When we receive storage for a connection, we'll add these peers to known peers
  const pendingPeersForConnection = new Map<string, Set<string>>();

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

  // Computed: connected peer IDs (leader calculates, followers receive via broadcast)
  const connectedPeerIds = createMemo(() => {
    const ids = isLeader()
      ? Array.from(currentlyConnectedPeerIds())
      : Array.from(openConnections());
    ids.sort();
    return ids;
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
      logger.log("P2P: Received peer status from SW:", status);
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
            logger.log(
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
          logger.log("P2P: Leader announced:", msg.tabId);
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
            settingsStorage.addKnownPeer(msg.connectionId, msg.peerId);
            // Also directly connect to this peer
            const p = peer();
            const selfId = myPeerId();
            if (p && peerStatus() === "connected" && selfId && msg.peerId !== selfId) {
              const alreadyConnected = currentlyConnectedPeerIds();
              if (!alreadyConnected.has(msg.peerId)) {
                logger.log("P2P [Leader]: Directly connecting to peer from follower request:", msg.peerId);
                const conn = p.connect(msg.peerId, { serialization: "binary" });
                setupConnection(conn, "outgoing");
              }
            }
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
        logger.log("P2P: Leader timeout, attempting takeover");
        tryBecomeLeader();
      }
    }, HEARTBEAT_INTERVAL);

    onCleanup(() => {
      clearInterval(leaderCheckInterval);
      leaderChannel?.close();
    });

    // Migration: Move global known peers to per-connection storage
    const knownPeersStr = localStorage.getItem("knownPeers");
    if (knownPeersStr) {
      try {
        const globalPeers = JSON.parse(knownPeersStr) as string[];
        if (globalPeers.length > 0) {
          // Add global peers to all existing connections
          for (const connection of settingsStorage.store.connections) {
            for (const peerId of globalPeers) {
              settingsStorage.addKnownPeer(connection.id, peerId);
            }
          }
          logger.log(
            "P2P: Migrated global known peers to per-connection storage:",
            globalPeers,
          );
        }
        // Remove global key after migration
        localStorage.removeItem("knownPeers");
        logger.log("P2P: Removed legacy global knownPeers from localStorage");
      } catch (err) {
        logger.error("P2P: Failed to migrate global known peers:", err);
      }
    }
  });

  function tryBecomeLeader() {
    logger.log("P2P: Attempting to become leader, tabId:", TAB_ID);

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
        logger.log("P2P: Becoming leader, tabId:", TAB_ID);
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

    logger.log("P2P [Leader]: Creating Peer with config:", peerConfig);
    const newPeer = new Peer(id, peerConfig);

    newPeer.on("open", (peerId) => {
      logger.log("P2P [Leader]: Peer open with ID:", peerId);
      setPeerStatus("connected");
    });

    newPeer.on("error", (err) => {
      logger.error("P2P [Leader]: Peer error:", err.type, err.message);
    });

    newPeer.on("disconnected", () => {
      logger.log("P2P [Leader]: Peer disconnected from signaling server");
      setPeerStatus("disconnected");
      setTimeout(() => {
        if (isLeader()) {
          setPeerStatus("connecting");
          newPeer.reconnect();
        }
      }, 1000);
    });

    newPeer.on("close", () => {
      logger.log("P2P [Leader]: Peer connection closed");
      setPeerStatus("disconnected");
    });

    newPeer.on("connection", (connection) => {
      logger.log(
        "P2P [Leader]: Incoming peer connection from:",
        connection.peer,
      );
      setupConnection(connection, "incoming");
    });

    onCleanup(() => {
      if (isLeader()) {
        logger.log("P2P [Leader]: Destroying peer");
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
      logger.log(`P2P [Leader]: ${direction} connection opened to:`, conn.peer);
      setOpenConnections((prev) => {
        const next = new Set(prev).add(conn.peer);
        // Broadcast open connections to followers (use the new value)
        leaderChannel?.postMessage({
          type: "open-connections",
          peerIds: Array.from(next),
        } satisfies LeaderMessage);
        return next;
      });
      // Request which connection IDs the remote peer has
      // We only share connections that both peers have in common
      peerConnectionSend(conn, { type: "request-connection-ids" });

      // Also proactively send our connection IDs so the remote peer can send us their state
      // This ensures bidirectional state sync on every connection (re)establishment
      peerConnectionSend(conn, {
        type: "connection-ids",
        data: settingsStorage.store.connections.map((c) => c.id),
      });
    });

    conn.on("data", (rawData) => {
      handleIncomingPeerData(conn, rawData);
    });

    conn.on("close", () => {
      logger.log(`P2P [Leader]: ${direction} connection closed to:`, conn.peer);
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
      // Clear synced state so we'll re-sync if peer reconnects (e.g., after leader change)
      setSyncedPeers((prev) => {
        const next = new Set(prev);
        next.delete(conn.peer);
        return next;
      });
      if (direction === "incoming") {
        setIncomingConnections((prev) => prev.filter((c) => c !== conn));
      } else {
        setOutgoingConnections((prev) => prev.filter((c) => c !== conn));
      }
    });

    conn.on("error", (err) => {
      logger.error(`P2P [Leader]: ${direction} connection error:`, err);
    });

    if (direction === "incoming") {
      setIncomingConnections((prev) => [...prev, conn]);
      // Note: We no longer add to knownPeers here globally
      // Instead, peers are added per-connection when we discover shared connections
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
      logger.warn("P2P [Leader]: Failed to parse peer data:", normalized);
      return;
    }

    const message = parsedData.output;
    logger.log("P2P [Leader]: Received peer message type:", message.type);

    // Handle protocol messages locally
    switch (message.type) {
      case "request-known-peers": {
        // Send known peers for the requested connection
        const connectionId = message.data.connectionId;
        const knownPeers = settingsStorage.getKnownPeers(connectionId);
        peerConnectionSend(conn, {
          type: "known-peers",
          data: { connectionId, peerIds: knownPeers },
        });
        return;
      }
      case "known-peers": {
        // Add received peers to the specific connection's peer list
        const { connectionId, peerIds } = message.data;
        for (const peerId of peerIds) {
          settingsStorage.addKnownPeer(connectionId, peerId);
        }
        return;
      }
      case "request-connection-ids":
        // Respond with the connection IDs we have locally
        peerConnectionSend(conn, {
          type: "connection-ids",
          data: settingsStorage.store.connections.map((c) => c.id),
        });
        return;
      case "connection-ids": {
        // The remote peer has these connection IDs
        // Send storage data only for connections that we BOTH have
        const remoteConnectionIds = new Set(message.data);
        const localConnections = settingsStorage.store.connections;
        const localConnectionIds = new Set(localConnections.map(c => c.id));

        for (const connectionData of localConnections) {
          if (remoteConnectionIds.has(connectionData.id)) {
            // Add this peer to the shared connection's known peers
            settingsStorage.addKnownPeer(connectionData.id, conn.peer);

            const data = unwrap(connectionData);
            if (data) {
              logger.log(
                "P2P [Leader]: Sending storage to peer for shared connection:",
                data.id,
              );
              peerConnectionSend(conn, { type: "storage", data });
            }

            // Request known peers for this specific connection
            peerConnectionSend(conn, {
              type: "request-known-peers",
              data: { connectionId: connectionData.id },
            });
          }
        }

        // For connections the remote peer has but we don't, mark them as pending
        // so we can add the peer to known peers when we receive the storage data
        for (const remoteConnId of remoteConnectionIds) {
          if (!localConnectionIds.has(remoteConnId)) {
            logger.log("P2P [Leader]: Marking peer as pending for connection we don't have:", remoteConnId, conn.peer);
            if (!pendingPeersForConnection.has(remoteConnId)) {
              pendingPeersForConnection.set(remoteConnId, new Set());
            }
            pendingPeersForConnection.get(remoteConnId)!.add(conn.peer);
          }
        }

        // Also respond with our own connection IDs so the remote peer sends us their state
        // This ensures bidirectional sync even after leader changes
        // Only do this once per peer to avoid infinite loops
        if (!syncedPeers().has(conn.peer)) {
          setSyncedPeers((prev) => new Set(prev).add(conn.peer));
          peerConnectionSend(conn, {
            type: "connection-ids",
            data: localConnections.map((c) => c.id),
          });
        }
        return;
      }
      case "request-storage": {
        // Handle request-storage in leader handler to respond directly to requester
        const connectionId = message.data.connectionId;
        logger.log("P2P [Leader]: Received request-storage for:", connectionId, "from:", conn.peer);
        
        const connectionData = unwrap(
          settingsStorage.store.connections.find((c) => c.id === connectionId),
        );
        
        if (connectionData) {
          // Add requester to known peers for this connection (they're joining)
          settingsStorage.addKnownPeer(connectionId, conn.peer);
          
          // Send storage directly to the requester
          logger.log("P2P [Leader]: Sending storage directly to requester:", conn.peer);
          peerConnectionSend(conn, { type: "storage", data: connectionData });
        }
        return;
      }
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
      case "request-connection-ids":
      case "connection-ids":
      case "request-storage":
        // Already handled by leader in handleIncomingPeerData
        break;
      case "storage": {
        const connectionId = event.data.id;
        logger.log(
          "P2P: Received storage data for connectionId:",
          connectionId,
        );
        settingsStorage.setConnection(event.data);

        // Check if there are pending peers waiting to be added to this connection
        const pendingPeers = pendingPeersForConnection.get(connectionId);
        if (pendingPeers && pendingPeers.size > 0) {
          logger.log("P2P: Adding pending peers to connection:", connectionId, Array.from(pendingPeers));
          for (const peerId of pendingPeers) {
            settingsStorage.addKnownPeer(connectionId, peerId);
          }
          pendingPeersForConnection.delete(connectionId);
        }

        // Now that we have this connection, request known peers from peers that share this connection
        // This helps discover other peers in the mesh
        broadcastToConnection(connectionId, {
          type: "request-known-peers",
          data: { connectionId },
        });
        break;
      }
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
      case "updated-eateryVeto":
        settingsStorage.upsertVeto(
          event.data.connectionId,
          event.data.eateryVeto,
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
        settingsStorage.upsertConnectionInfo(
          event.data.connectionId,
          event.data.connection,
        );
        break;
      default:
        logger.warn(
          "P2P: Unknown message type:",
          (event as { type: string }).type,
        );
    }
  }

  createEffect(() => logger.log("P2P: Leader changed", isLeader()));
  createEffect(() => logger.log("P2P: Peer status changed", peerStatus()));
  createEffect(() => logger.log("P2P: Peer changed", peer()));
  createEffect(() => logger.log("P2P: My peer ID changed", myPeerId()));
  createEffect(() => {
    const allPeers = settingsStorage.getAllKnownPeers();
    const logObj: Record<string, string[]> = {};
    for (const [connId, peers] of allPeers) {
      logObj[connId] = peers;
    }
    logger.log("P2P: Known peers changed (per-connection)", logObj);
  });
  createEffect(() =>
    logger.log(
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
    const alreadyConnected = currentlyConnectedPeerIds();

    // Gather all unique known peers across all connections
    const allKnownPeers = new Set<string>();
    for (const connection of settingsStorage.store.connections) {
      const peers = connection.settings.knownPeers ?? [];
      for (const peerId of peers) {
        allKnownPeers.add(peerId);
      }
    }

    logger.log("P2P: Connect effect running", {
      isLeader: leader,
      peerStatus: status,
      hasPeer: !!p,
      selfId,
      knownPeers: Array.from(allKnownPeers),
      alreadyConnected: Array.from(alreadyConnected),
    });

    if (!leader) return;
    if (status !== "connected") return;
    if (!p) return;
    if (!selfId) return;

    for (const peerId of allKnownPeers) {
      if (peerId === selfId) continue;
      if (alreadyConnected.has(peerId)) continue;

      logger.log("P2P [Leader]: Connecting to known peer:", peerId);
      const conn = p.connect(peerId, { serialization: "binary" });
      setupConnection(conn, "outgoing");
    }
  });

  // Periodic reconnection attempt for known peers that aren't connected
  // This handles cases where initial connection attempts failed (e.g., peer was offline)
  onMount(() => {
    const RECONNECT_INTERVAL = 5000; // Try to reconnect every 5 seconds

    const reconnectInterval = setInterval(() => {
      if (!isLeader()) return;
      if (peerStatus() !== "connected") return;

      const p = peer();
      const selfId = myPeerId();
      if (!p || !selfId) return;

      // Gather all unique known peers across all connections
      const allKnownPeers = new Set<string>();
      for (const connection of settingsStorage.store.connections) {
        const peers = connection.settings.knownPeers ?? [];
        for (const peerId of peers) {
          allKnownPeers.add(peerId);
        }
      }
      const connected = currentlyConnectedPeerIds();

      // Find peers that should be connected but aren't
      const disconnectedPeers = Array.from(allKnownPeers).filter(
        (peerId) => peerId !== selfId && !connected.has(peerId),
      );

      if (disconnectedPeers.length > 0) {
        logger.log(
          "P2P [Leader]: Reconnection check - attempting to connect to:",
          disconnectedPeers,
        );

        for (const peerId of disconnectedPeers) {
          // Check if we already have an outgoing connection attempt in progress
          const existingConn = outgoingConnections().find(
            (c) => c.peer === peerId,
          );
          if (existingConn) {
            // Connection exists but not open - it might be stuck, close it and retry
            logger.log(
              "P2P [Leader]: Closing stuck connection to:",
              peerId,
            );
            existingConn.close();
          }

          logger.log("P2P [Leader]: Reconnecting to peer:", peerId);
          const conn = p.connect(peerId, { serialization: "binary" });
          setupConnection(conn, "outgoing");
        }
      }
    }, RECONNECT_INTERVAL);

    onCleanup(() => clearInterval(reconnectInterval));
  });

  function broadcastToPeers(message: Peer2PeerDataSchemaType) {
    const connections = [...incomingConnections(), ...outgoingConnections()];
    connections.forEach((conn) => peerConnectionSend(conn, message));
  }

  // Public API
  function addNewPeer(peerId: string, connectionId: string) {
    logger.log("P2P: Adding new known peer:", peerId, "for connection:", connectionId);

    // Add to the specific connection's known peers (if connection exists)
    settingsStorage.addKnownPeer(connectionId, peerId);

    // Always tell leader to add this peer (in case we're not leader or leader election is pending)
    leaderChannel?.postMessage({
      type: "add-known-peer",
      peerId,
      connectionId,
    } satisfies LeaderMessage);

    // Also try to connect directly if we're the leader
    // This handles the case where we become leader after the broadcast message is sent
    const tryConnect = () => {
      const p = peer();
      const selfId = myPeerId();
      if (isLeader() && p && peerStatus() === "connected" && selfId && peerId !== selfId) {
        const alreadyConnected = currentlyConnectedPeerIds();
        if (!alreadyConnected.has(peerId)) {
          logger.log("P2P [Leader]: Directly connecting to new peer:", peerId);
          const conn = p.connect(peerId, { serialization: "binary" });
          setupConnection(conn, "outgoing");
        }
      }
    };

    // Try immediately
    tryConnect();

    // Also try after a short delay (in case leader election completes)
    setTimeout(tryConnect, 500);

    requestStorageForConnection(connectionId);
  }

  function broadcast(event: Peer2PeerDataSchemaType) {
    logger.log("P2P: Broadcasting event:", event.type);

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

  function broadcastToConnection(connectionId: string, event: Peer2PeerDataSchemaType) {
    logger.log("P2P: Broadcasting to connection:", connectionId, "event:", event.type);

    if (isLeader()) {
      broadcastToConnectionPeers(connectionId, event);
    } else {
      // Send to leader to broadcast (leader will filter by connection)
      leaderChannel?.postMessage({
        type: "p2p-outgoing",
        data: event,
      } satisfies LeaderMessage);
    }
  }

  function broadcastToConnectionPeers(connectionId: string, message: Peer2PeerDataSchemaType) {
    // Get known peers for this specific connection
    const knownPeersForConnection = new Set(settingsStorage.getKnownPeers(connectionId));
    
    // Filter open connections to only include peers that are known for this connection
    const connections = [...incomingConnections(), ...outgoingConnections()];
    const relevantConnections = connections.filter(conn => knownPeersForConnection.has(conn.peer));
    
    logger.log("P2P: Sending to", relevantConnections.length, "peers for connection:", connectionId, 
      "out of", connections.length, "total connections");
    
    relevantConnections.forEach((conn) => peerConnectionSend(conn, message));
  }

  function sendToPeer(peerId: string, event: Peer2PeerDataSchemaType): boolean {
    logger.log("P2P: Sending to peer:", peerId, event.type);

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

  function requestStorageForConnection(connectionId: string) {
    logger.log("P2P: Requesting storage for connection:", connectionId);
    broadcast({ type: "request-storage", data: { connectionId } });
  }

  return (
    <peer2PeerContext.Provider
      value={{
        broadcast,
        broadcastToConnection,
        sendToPeer,
        addNewPeer,
        isPeerConnected,
        connectedPeerCount,
        connectedPeerIds,
        myPeerId,
        serverStatus: peerStatus,
        isLeader,
      }}
    >
      {props.children}
    </peer2PeerContext.Provider>
  );
}
