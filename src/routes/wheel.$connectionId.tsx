import {
  createFileRoute,
  Link,
  Navigate,
  useLinkProps,
  useRouter,
} from "@tanstack/solid-router";
import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import Home from "lucide-solid/icons/home";
import Play from "lucide-solid/icons/play";
import QrCode from "lucide-solid/icons/qr-code";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import Settings from "lucide-solid/icons/settings";
import Share2 from "lucide-solid/icons/share-2";
import Sparkles from "lucide-solid/icons/sparkles";
import Users from "lucide-solid/icons/users";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import { useCurrentUser } from "~/components/CurrentUserProvider";
import { useSettingsStorage } from "~/components/SettingsStorageProvider";
import { UserSelectionDialog } from "~/components/UserSelectionDialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { logger } from "~/utils/logger";
import { usePeer2Peer, usePeer2PeerId } from "~/utils/peer2peerSharing";

export const Route = createFileRoute("/wheel/$connectionId")({
  component: WheelPage,
});

interface Eatery {
  id: string;
  name: string;
  cuisine?: string;
}

interface User {
  id: string;
  name: string;
  scores: { [eateryId: string]: number };
}

interface WheelSettings {
  eateries: Eatery[];
  users: User[];
  currentUser: string | null;
}

interface WheelSegment {
  eatery: Eatery;
  combinedScore: number;
  percentage: number;
  startAngle: number;
  endAngle: number;
  color: string;
}

function WheelPage() {
  const connectionId = Route.useParams({ select: (p) => p.connectionId });
  const router = useRouter();
  const [isSpinning, setIsSpinning] = createSignal(false);
  const [selectedEatery, setSelectedEatery] = createSignal<Eatery | null>(null);
  const [showQR, setShowQR] = createSignal(false);
  const [copiedShareLink, setCopiedShareLink] = createSignal(false);
  const [manualCopyHint, setManualCopyHint] = createSignal(false);
  const [showUsers, setShowUsers] = createSignal(false);
  const [rotation, setRotation] = createSignal(0);
  const [selectedUsers, setSelectedUsers] = createSignal<string[]>([]);

  type WheelTooltipState = { name: string; x: number; y: number };
  const [hoverTooltip, setHoverTooltip] =
    createSignal<WheelTooltipState | null>(null);
  const [pinnedTooltip, setPinnedTooltip] =
    createSignal<WheelTooltipState | null>(null);
  let wheelContainerEl: HTMLDivElement | undefined;
  let shareUrlEl: HTMLDivElement | undefined;

  const setTooltipFromPointerEvent = (
    name: string,
    ev: PointerEvent,
    setter: (v: WheelTooltipState | null) => void,
  ) => {
    if (!wheelContainerEl) return;
    const rect = wheelContainerEl.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    setter({ name, x, y });
  };

  // Close pinned tooltip when tapping/clicking outside the wheel.
  createEffect(() => {
    if (typeof document === "undefined") return;
    const handler = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (!wheelContainerEl || !target) return;
      if (!wheelContainerEl.contains(target)) {
        setPinnedTooltip(null);
      }
    };
    document.addEventListener("pointerdown", handler);
    onCleanup(() => document.removeEventListener("pointerdown", handler));
  });

  const settingsStorage = useSettingsStorage();
  const peer = usePeer2Peer();
  const currentUserCtx = useCurrentUser();

  const currentConnection = createMemo(() =>
    settingsStorage.store.connections.find((x) => x.id === connectionId()),
  );

  // Current user for this connection
  const currentUserId = createMemo(() =>
    currentUserCtx.getCurrentUser(connectionId()),
  );

  // Check if current user is still valid (not deleted)
  const currentUserIsValid = createMemo(() => {
    const userId = currentUserId();
    if (!userId) return false;
    const users = currentConnection()?.settings.users ?? [];
    const user = users.find((u) => u.id === userId);
    return user && !user._deleted;
  });

  // Show selection dialog if no valid current user
  const showUserSelection = createMemo(() => {
    if (!currentConnection()) return false;
    return !currentUserIsValid();
  });

  const handleSelectCurrentUser = (userId: string) => {
    currentUserCtx.setCurrentUser(connectionId(), userId);
    // Auto-select this user for the wheel
    if (!selectedUsers().includes(userId)) {
      setSelectedUsers([...selectedUsers(), userId]);
    }
  };

  const handleAddNewUser = (name: string): string => {
    const newUserId = settingsStorage.addUser(connectionId(), name);
    const newUser = currentConnection()?.settings.users.find(
      (x) => x.id === newUserId,
    );
    if (newUser) {
      peer.broadcastToConnection(connectionId(), {
        type: "updated-user",
        data: {
          connectionId: connectionId(),
          user: newUser,
        },
      });
    }
    return newUserId;
  };

  // Initialize selectedUsers to include current user when they're set
  createEffect(() => {
    const userId = currentUserId();
    if (userId && currentUserIsValid() && !selectedUsers().includes(userId)) {
      setSelectedUsers([...selectedUsers(), userId]);
    }
  });

  const activeEateries = createMemo(
    () =>
      currentConnection()?.settings.eateries.filter((x) => !x._deleted) ?? [],
  );
  const activeUsers = createMemo(
    () => currentConnection()?.settings.users.filter((x) => !x._deleted) ?? [],
  );
  const activeVetoes = createMemo<
    NonNullable<
      NonNullable<typeof currentConnection> extends () => infer T
        ? T extends { settings: { eateryVetoes?: infer V } }
          ? V
          : never
        : never
    >
  >(
    () =>
      (currentConnection()?.settings.eateryVetoes ?? []).filter(
        (x) => !x._deleted,
      ) as NonNullable<
        NonNullable<typeof currentConnection> extends () => infer T
          ? T extends { settings: { eateryVetoes?: infer V } }
            ? V
            : never
          : never
      >,
  );

  const vetoedEateryCount = createMemo(() => {
    const selected = selectedUsers();
    if (selected.length === 0) return 0;

    const activeEateryIds = new Set(activeEateries().map((e) => e.id));
    const vetoedIds = new Set<string>();
    for (const veto of activeVetoes()) {
      if (selected.includes(veto.userId)) {
        vetoedIds.add(veto.eateryId);
      }
    }

    let count = 0;
    for (const id of vetoedIds) {
      if (activeEateryIds.has(id)) count++;
    }
    return count;
  });

  // Redirect if connection not found
  createEffect(() => {
    if (currentConnection() === undefined) {
      logger.log("wheel: redirecting - connection not found");
      router.navigate({ to: "/", replace: true });
    }
  });

  const getWheelSegments = () => {
    if (activeEateries().length === 0 || selectedUsers().length === 0)
      return [];

    // Filter out eateries that have been vetoed by any selected user
    const vetoes = activeVetoes();
    const eligibleEateries = activeEateries().filter((eatery) => {
      // An eatery is ineligible if any selected user has vetoed it
      const isVetoed = selectedUsers().some((userId) =>
        vetoes.some((v) => v.userId === userId && v.eateryId === eatery.id),
      );
      return !isVetoed;
    });

    if (eligibleEateries.length === 0) return [];

    // Calculate combined scores for each eatery
    const eateryScores = eligibleEateries.map((eatery) => {
      const combinedScore = selectedUsers().reduce((total, userId) => {
        const userEateryScore =
          currentConnection()?.settings.eateryScores.find(
            (u) => u.userId === userId && u.eateryId === eatery.id,
          )?.score ?? 0;
        return total + userEateryScore;
      }, 0);

      return {
        eatery,
        combinedScore,
      };
    });

    // Calculate total score and percentages
    const totalScore =
      eateryScores?.reduce(
        (sum, item) => sum + Math.max(item.combinedScore, 1),
        0,
      ) ?? 0;

    // Vibrant food-inspired color palette
    const colors = [
      "#E07C4A", // Appetizing orange (tomato sauce)
      "#2ECC71", // Fresh herb green
      "#F39C12", // Golden cheese yellow
      "#E74C3C", // Chili pepper red
      "#9B59B6", // Eggplant purple
      "#1ABC9C", // Mint green
      "#3498DB", // Blueberry blue
      "#E91E63", // Raspberry pink
      "#FF9800", // Mango orange
      "#8BC34A", // Avocado green
      "#00BCD4", // Tropical cyan
      "#FF5722", // Paprika red-orange
    ];

    let currentAngle = 0;

    return (
      eateryScores?.map((item, index) => {
        // Ensure minimum slice size for visibility (at least 1% of wheel)
        const adjustedScore = Math.max(item.combinedScore, 1);
        const percentage = (adjustedScore / totalScore) * 100;
        const segmentAngle = (adjustedScore / totalScore) * 360;

        const segment: WheelSegment = {
          eatery: item.eatery,
          combinedScore: item.combinedScore,
          percentage,
          startAngle: currentAngle,
          endAngle: currentAngle + segmentAngle,
          color: colors[index % colors.length],
        };

        currentAngle += segmentAngle;
        return segment;
      }) ?? []
    );
  };

  const spinWheel = () => {
    const segments = getWheelSegments();
    if (segments.length === 0 || isSpinning()) return;

    setIsSpinning(true);
    setSelectedEatery(null);

    // Calculate random rotation - more spins for better visual effect
    const minRotation = 2160; // 6 full rotations
    const maxRotation = 3600; // 10 full rotations
    const randomRotation =
      Math.random() * (maxRotation - minRotation) + minRotation;
    const newRotation = rotation() + randomRotation;

    setRotation(newRotation);

    // Calculate which eatery was selected based on proportional segments
    // Pointer is at top (0 degrees), wheel rotates clockwise
    setTimeout(() => {
      // The pointer is at top (0°), segments start from top going clockwise
      // After rotation, find where the pointer lands
      const normalizedRotation = newRotation % 360;
      // Pointer at 0° means we need to find which segment contains (360 - normalizedRotation)
      const pointerPosition = (360 - normalizedRotation + 360) % 360;

      const selectedSegment = segments.find(
        (segment) =>
          pointerPosition >= segment.startAngle &&
          pointerPosition < segment.endAngle,
      );

      if (selectedSegment) {
        setSelectedEatery(selectedSegment.eatery);
      }
      setIsSpinning(false);
    }, 4100); // Match the CSS transition duration + small buffer
  };

  const resetWheel = () => {
    setRotation(0);
    setSelectedEatery(null);
  };

  const myPeerId = usePeer2PeerId();

  const canNativeShare = () =>
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const selectShareUrlText = () => {
    if (typeof window === "undefined") return;
    if (!shareUrlEl) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(shareUrlEl);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const copyTextToClipboard = async (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  };

  const shareUrl = createMemo(() => {
    const connectToLinkUrl = router.buildLocation({
      to: router.routesByPath["/connect-to"].fullPath,
      search: { peerId: myPeerId(), connectionId: connectionId() },
    });
    if (typeof window === "undefined") {
      return new URL("http://localhost");
    }
    const localUrl = new URL(location.href);
    // Get the base path from the router and construct the full pathname
    const basePath = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    localUrl.pathname = basePath + connectToLinkUrl.pathname;
    localUrl.search = connectToLinkUrl.searchStr;
    localUrl.hash = connectToLinkUrl.hash;
    return localUrl;
  });

  const copyShareUrl = async () => {
    try {
      const copied = await copyTextToClipboard(shareUrl().href);
      if (copied) {
        setManualCopyHint(false);
        setCopiedShareLink(true);
        window.setTimeout(() => setCopiedShareLink(false), 1500);
        return;
      }

      // Clipboard API not available (or blocked). Select the URL so the user can Ctrl/Cmd+C.
      setCopiedShareLink(false);
      setManualCopyHint(true);
      selectShareUrlText();
    } catch {
      setCopiedShareLink(false);
      setManualCopyHint(true);
      selectShareUrlText();
    }
  };

  const nativeShare = async () => {
    if (!canNativeShare()) return;
    try {
      await navigator.share({
        title: "Where to eat",
        text: "Join my wheel",
        url: shareUrl().href,
      });
    } catch {
      // User may cancel; treat as no-op.
    }
  };

  const generateQRCode = () => {
    const url = new URL("https://api.qrserver.com/v1/create-qr-code");
    url.searchParams.set("size", "200x200");
    url.searchParams.set("data", shareUrl().href);
    return url.href;
  };

  const segments = createMemo(() => getWheelSegments());

  return (
    <Show when={currentConnection()} fallback={null}>
      {/* User selection dialog - shown when no current user is set */}
      <UserSelectionDialog
        open={showUserSelection()}
        onSelect={handleSelectCurrentUser}
        onAddNew={handleAddNewUser}
        users={currentConnection()?.settings.users ?? []}
        connectionName={currentConnection()?.settings.connection.name}
      />

      <Show
        when={activeEateries().length > 0}
        fallback={
          <div class="py-12 px-4">
            <div class="max-w-lg mx-auto text-center space-y-6">
              {/* Empty State */}
              <div class="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Settings class="w-10 h-10 text-primary/60" />
              </div>

              <div class="space-y-2">
                <h2 class="text-2xl font-bold text-foreground">
                  No Restaurants Yet
                </h2>
                <p class="text-muted-foreground max-w-md mx-auto">
                  Add restaurants to start spinning the wheel
                </p>
              </div>

              <div class="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/settings/$connectionId"
                  params={{ connectionId: connectionId() }}
                >
                  <Button size="lg">
                    <Settings class="w-5 h-5" />
                    Add Restaurants
                  </Button>
                </Link>
                <Link to="/">
                  <Button variant="outline" size="lg">
                    <Home class="w-5 h-5" />
                    Back Home
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        }
      >
        <div class="py-6 px-4">
          <div class="max-w-5xl mx-auto space-y-6">
            {/* Page Header */}
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 page-section">
              <div>
                <h1 class="text-2xl font-bold">
                  {currentConnection()?.settings.connection.name ||
                    "Spin Wheel"}
                </h1>
                <p class="text-sm text-muted-foreground mt-1">
                  {activeEateries().length} restaurants • {activeUsers().length}{" "}
                  people
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Dialog
                  open={showQR()}
                  onOpenChange={(open) => {
                    setShowQR(open);
                    if (open) {
                      setCopiedShareLink(false);
                      setManualCopyHint(false);
                    }
                  }}
                >
                  <DialogTrigger>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="share-button"
                    >
                      <QrCode class="w-4 h-4" />
                      Share
                    </Button>
                  </DialogTrigger>
                  <DialogContent class="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Invite Others</DialogTitle>
                      <DialogDescription>
                        Share this link so others can join and vote
                      </DialogDescription>
                    </DialogHeader>
                    <div class="space-y-6 pt-2">
                      {/* QR Code */}
                      <div class="flex justify-center">
                        <div class="p-4 bg-white rounded-lg shadow-sm">
                          <img
                            src={generateQRCode() || `${import.meta.env.BASE_URL}placeholder.svg`}
                            alt="QR Code"
                            class="w-48 h-48"
                          />
                        </div>
                      </div>
                      {/* Share URL */}
                      <div class="space-y-3">
                        <div
                          class="p-2 bg-muted rounded text-sm font-mono break-all cursor-pointer select-all"
                          data-testid="share-url"
                          title="Click to copy"
                          ref={(el) => {
                            shareUrlEl = el;
                          }}
                          onClick={() => void copyShareUrl()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              void copyShareUrl();
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          {shareUrl().href}
                        </div>
                        <Show when={manualCopyHint()}>
                          <div class="text-xs text-muted-foreground">
                            Clipboard access isn’t available here; select the
                            link above and press
                            <span class="font-medium"> Ctrl+C</span> (or{" "}
                            <span class="font-medium">Cmd+C</span>).
                          </div>
                        </Show>
                        <div class="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void copyShareUrl()}
                            data-testid="copy-share-url"
                          >
                            <Copy class="w-4 h-4 mr-2" />
                            {copiedShareLink() ? "Copied" : "Copy link"}
                          </Button>
                          <Show when={canNativeShare()}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void nativeShare()}
                              data-testid="native-share-url"
                            >
                              <Share2 class="w-4 h-4 mr-2" />
                              Share…
                            </Button>
                          </Show>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Link
                  to="/settings/$connectionId"
                  params={{ connectionId: connectionId() }}
                >
                  <Button variant="outline" size="sm">
                    <Settings class="w-4 h-4" />
                    Settings
                  </Button>
                </Link>
                <Link to="/">
                  <Button variant="ghost" size="icon" class="w-9 h-9">
                    <Home class="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>

            <div class="grid lg:grid-cols-3 gap-4 page-section">
              <div class="lg:col-span-2 space-y-4">
                {/* Wheel Card */}
                <Card class="food-card overflow-visible">
                  <CardContent class="p-6">
                    <div class="relative w-72 h-72 mx-auto wheel-container sm:w-80 sm:h-80">
                      {/* Pointer at top */}
                      <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2 z-10 wheel-pointer">
                        <div class="w-0 h-0 border-l-[14px] border-r-[14px] border-t-[24px] border-l-transparent border-r-transparent border-t-primary" />
                      </div>

                      {/* Wheel container */}
                      <div
                        class="relative w-full h-full"
                        ref={(el) => {
                          wheelContainerEl = el;
                        }}
                      >
                        <Show when={pinnedTooltip() ?? hoverTooltip()}>
                          {(tooltip) => (
                            <Card
                              class="absolute z-20 pointer-events-none px-3 py-2 text-sm bg-card/98 backdrop-blur-md shadow-lg rounded-md border w-max max-w-[220px]"
                              style={{
                                left: `${tooltip().x}px`,
                                top: `${tooltip().y}px`,
                                transform: "translate(-50%, -130%)",
                              }}
                            >
                              <div class="font-medium break-words text-foreground">
                                {tooltip().name}
                              </div>
                              <div class="text-xs text-muted-foreground">
                                Tap to pin
                              </div>
                            </Card>
                          )}
                        </Show>

                        <div
                          class="w-full h-full rounded-full border-[10px] border-foreground/90 dark:border-foreground/80 shadow-elevated relative overflow-hidden"
                          style={{
                            transform: `rotate(${rotation()}deg)`,
                            transition: isSpinning()
                              ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
                              : "none",
                          }}
                        >
                          <svg class="w-full h-full" viewBox="0 0 200 200">
                            <defs>
                              <filter
                                id="shadow"
                                x="-20%"
                                y="-20%"
                                width="140%"
                                height="140%"
                              >
                                <feDropShadow
                                  dx="0"
                                  dy="1"
                                  stdDeviation="1"
                                  flood-opacity="0.3"
                                />
                              </filter>
                            </defs>
                            <For each={segments()}>
                              {(segment) => {
                                const arcAngle =
                                  segment.endAngle - segment.startAngle;
                                // SVG arc commands can't draw a full 360° (start=end becomes a tiny sliver).
                                // When a segment covers the whole wheel, render it as a circle instead.
                                const isFullCircle = arcAngle >= 359.999;

                                const startAngleRad =
                                  ((segment.startAngle - 90) * Math.PI) / 180;
                                const endAngleRad =
                                  ((segment.endAngle - 90) * Math.PI) / 180;
                                const largeArcFlag =
                                  segment.endAngle - segment.startAngle > 180
                                    ? 1
                                    : 0;

                                const x1 = 100 + 95 * Math.cos(startAngleRad);
                                const y1 = 100 + 95 * Math.sin(startAngleRad);
                                const x2 = 100 + 95 * Math.cos(endAngleRad);
                                const y2 = 100 + 95 * Math.sin(endAngleRad);

                                // Segment label placement
                                const midAngle =
                                  (segment.startAngle + segment.endAngle) / 2;
                                const midAngleRad =
                                  ((midAngle - 90) * Math.PI) / 180;
                                const textRadius = 52;
                                const textX =
                                  100 + textRadius * Math.cos(midAngleRad);
                                const textY =
                                  100 + textRadius * Math.sin(midAngleRad);
                                const shouldFlip =
                                  midAngle > 90 && midAngle < 270;
                                const textRotation = shouldFlip
                                  ? midAngle + 180
                                  : midAngle;

                                // Calculate available arc length for text sizing
                                const arcLength =
                                  ((arcAngle * Math.PI) / 180) * textRadius;

                                // Truncate name if too long
                                const maxCharsFromArc = Math.max(
                                  3,
                                  Math.floor(arcLength / 5.5),
                                );
                                // Also cap based on how much horizontal room we have inside the 200x200 viewBox.
                                // This avoids labels near the edges getting clipped even when the segment is large.
                                const viewBoxSize = 200;
                                const edgePadding = 6;
                                const maxTextWidth =
                                  2 *
                                  Math.max(
                                    0,
                                    Math.min(
                                      textX - edgePadding,
                                      viewBoxSize - edgePadding - textX,
                                    ),
                                  );
                                const approxCharWidth = 4.7; // empirically ~5 at font-size=9
                                const maxCharsFromViewBox = Math.max(
                                  3,
                                  Math.floor(maxTextWidth / approxCharWidth),
                                );
                                const maxChars = Math.min(
                                  maxCharsFromArc,
                                  maxCharsFromViewBox,
                                );
                                const displayName =
                                  segment.eatery.name.length > maxChars
                                    ? segment.eatery.name.slice(
                                        0,
                                        maxChars - 1,
                                      ) + "…"
                                    : segment.eatery.name;

                                return (
                                  <g
                                    onPointerEnter={(e) => {
                                      if (pinnedTooltip()) return;
                                      setTooltipFromPointerEvent(
                                        segment.eatery.name,
                                        e,
                                        setHoverTooltip,
                                      );
                                    }}
                                    onPointerMove={(e) => {
                                      if (pinnedTooltip()) return;
                                      setTooltipFromPointerEvent(
                                        segment.eatery.name,
                                        e,
                                        setHoverTooltip,
                                      );
                                    }}
                                    onPointerLeave={() => {
                                      setHoverTooltip(null);
                                    }}
                                    onPointerDown={(e) => {
                                      // Tap/click pins the tooltip (mobile-friendly).
                                      const current = pinnedTooltip();
                                      if (
                                        current?.name === segment.eatery.name
                                      ) {
                                        setPinnedTooltip(null);
                                        return;
                                      }
                                      setTooltipFromPointerEvent(
                                        segment.eatery.name,
                                        e,
                                        setPinnedTooltip,
                                      );
                                    }}
                                  >
                                    <title>{segment.eatery.name}</title>
                                    <Show
                                      when={!isFullCircle}
                                      fallback={
                                        <circle
                                          cx="100"
                                          cy="100"
                                          r="95"
                                          fill={segment.color}
                                          stroke="rgba(255,255,255,0.8)"
                                          stroke-width="2"
                                          class="cursor-pointer"
                                        />
                                      }
                                    >
                                      <path
                                        d={`M 100 100 L ${x1} ${y1} A 95 95 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                                        fill={segment.color}
                                        stroke="rgba(255,255,255,0.8)"
                                        stroke-width="2"
                                        class="cursor-pointer"
                                      />
                                    </Show>
                                    {/* Radial text along the segment */}
                                    <text
                                      x={textX}
                                      y={textY}
                                      font-size="9"
                                      font-weight="600"
                                      fill="white"
                                      filter="url(#shadow)"
                                      text-anchor="middle"
                                      dominant-baseline="middle"
                                      paint-order="stroke"
                                      stroke="rgba(0,0,0,0.35)"
                                      stroke-width="2"
                                      transform={`rotate(${textRotation}, ${textX}, ${textY})`}
                                      class="cursor-pointer"
                                    >
                                      {displayName}
                                    </text>
                                  </g>
                                );
                              }}
                            </For>
                            {/* Center circle - food themed */}
                            <circle
                              cx="100"
                              cy="100"
                              r="20"
                              fill="url(#centerGradient)"
                              stroke="#1f2937"
                              stroke-width="3"
                            />
                            <defs>
                              <radialGradient
                                id="centerGradient"
                                cx="50%"
                                cy="30%"
                                r="70%"
                              >
                                <stop offset="0%" stop-color="#6b7280" />
                                <stop offset="100%" stop-color="#374151" />
                              </radialGradient>
                            </defs>
                            <circle cx="100" cy="100" r="8" fill="#9ca3af" />
                            <circle
                              cx="98"
                              cy="98"
                              r="3"
                              fill="#d1d5db"
                              opacity="0.6"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Spin Controls */}
                <div class="flex justify-center gap-3">
                  <Button
                    onClick={spinWheel}
                    disabled={isSpinning() || segments().length === 0}
                    size="lg"
                    class={`px-8 ${isSpinning() ? "animate-pulse" : ""}`}
                    data-testid="spin-wheel"
                  >
                    <Play class="w-5 h-5" />
                    {isSpinning() ? "Spinning..." : "Spin"}
                  </Button>
                  <Button
                    onClick={resetWheel}
                    variant="outline"
                    size="lg"
                    disabled={isSpinning()}
                  >
                    <RotateCcw class="w-5 h-5" />
                    Reset
                  </Button>
                </div>

                {/* Winner Card */}
                {selectedEatery() && (
                  <Card class="winner-card border-0 shadow-lg animate-bounce-in">
                    <CardContent class="relative p-5 text-center z-10">
                      <p class="text-sm font-medium text-success-foreground/80 uppercase tracking-wide mb-1">
                        Selected
                      </p>
                      <h2 class="text-2xl font-bold text-success-foreground">
                        {selectedEatery()!.name}
                      </h2>
                      {selectedEatery()!.cuisine && (
                        <Badge class="bg-white/20 text-success-foreground border-0 mt-2">
                          {selectedEatery()!.cuisine}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <div class="space-y-4 page-section">
                {/* Participating Users */}
                <Card class="food-card">
                  <CardHeader class="pb-3">
                    <CardTitle class="flex items-center gap-2 text-base">
                      <Users class="w-4 h-4 text-primary" />
                      Participants
                    </CardTitle>
                  </CardHeader>
                  <CardContent class="space-y-1">
                    {activeUsers().map((user) => (
                      <label
                        for={`user-${user.id}`}
                        class={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                          selectedUsers().includes(user.id)
                            ? "bg-primary/10"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          id={`user-${user.id}`}
                          checked={selectedUsers().includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUsers([...selectedUsers(), user.id]);
                            } else {
                              setSelectedUsers(
                                selectedUsers().filter((id) => id !== user.id),
                              );
                            }
                          }}
                          class="w-4 h-4 rounded border-2 border-primary/30 text-primary accent-primary cursor-pointer"
                        />
                        <span class="text-sm font-medium flex-1">
                          {user.name}
                        </span>
                        {selectedUsers().includes(user.id) && (
                          <Check class="w-4 h-4 text-primary" />
                        )}
                      </label>
                    ))}
                    {selectedUsers().length === 0 && (
                      <div class="text-center py-3 text-destructive bg-destructive/5 rounded-md border border-destructive/20">
                        <p class="text-sm">Select at least one person</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Eateries List */}
                <Card class="food-card">
                  <CardHeader class="pb-3">
                    <CardTitle class="flex items-center justify-between text-base">
                      <span>On the Wheel</span>
                      <Show when={vetoedEateryCount() > 0}>
                        <Badge variant="error" class="text-xs">
                          {vetoedEateryCount()} vetoed
                        </Badge>
                      </Show>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div class="space-y-1 max-h-72 overflow-y-auto pr-1">
                      {getWheelSegments().map((segment, index) => (
                        <div
                          class="flex items-center gap-3 p-2 rounded-md hover:bg-muted/30 transition-colors"
                          style={`animation-delay: ${index * 0.05}s`}
                        >
                          <div
                            class="w-3 h-3 rounded-full flex-shrink-0"
                            style={`background-color: ${segment.color}`}
                          />
                          <div class="flex-1 min-w-0">
                            <p class="font-medium text-sm truncate">
                              {segment.eatery.name}
                            </p>
                          </div>
                          <div class="text-right flex-shrink-0">
                            <p class="text-sm font-medium text-primary">
                              {segment.percentage.toFixed(0)}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </Show>
  );
}
