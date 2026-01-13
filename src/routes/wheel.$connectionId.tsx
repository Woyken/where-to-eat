import {
  createFileRoute,
  Link,
  Navigate,
  useLinkProps,
  useRouter,
} from "@tanstack/solid-router";
import Copy from "lucide-solid/icons/copy";
import Home from "lucide-solid/icons/home";
import Play from "lucide-solid/icons/play";
import QrCode from "lucide-solid/icons/qr-code";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import Settings from "lucide-solid/icons/settings";
import Share2 from "lucide-solid/icons/share-2";
import Users from "lucide-solid/icons/users";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import { useSettingsStorage } from "~/components/SettingsStorageProvider";
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

  const currentConnection = createMemo(() =>
    settingsStorage.store.connections.find((x) => x.id === connectionId()),
  );

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
      console.log("wheel: redirecting - connection not found");
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

    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#96CEB4",
      "#FFEAA7",
      "#DDA0DD",
      "#98D8C8",
      "#F7DC6F",
      "#BB8FCE",
      "#85C1E9",
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
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function";

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
      <Show
        when={activeEateries().length > 0}
        fallback={
          <div class="grid place-items-center py-16">
            <Card class="w-full max-w-2xl overflow-hidden">
              <CardHeader class="border-b">
                <CardTitle>Almost ready</CardTitle>
              </CardHeader>
              <CardContent class="grid gap-4 pt-6">
                <div class="text-sm text-muted-foreground">
                  Add a few eateries first, then come back to spin.
                </div>
                <div class="flex flex-wrap gap-2">
                  <Link
                    to="/settings/$connectionId"
                    params={{ connectionId: connectionId() }}
                  >
                    <Button>
                      <Settings class="mr-2 size-4" />
                      Open settings
                    </Button>
                  </Link>
                  <Link to="/">
                    <Button variant="outline">
                      <Home class="mr-2 size-4" />
                      Home
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        }
      >
        <div class="grid gap-6">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div class="min-w-0">
              <div class="text-sm text-muted-foreground">Room</div>
              <h1 class="truncate text-3xl font-semibold tracking-tight">
                {currentConnection()?.settings.connection.name ?? "Eatery wheel"}
              </h1>
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
                  <Button variant="outline" size="sm" data-testid="share-button">
                    <QrCode class="mr-2 size-4" />
                    Share
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Share this room</DialogTitle>
                    <DialogDescription>
                      Others can scan the QR code or open the link.
                    </DialogDescription>
                  </DialogHeader>
                  <div class="grid gap-4">
                    <div class="grid place-items-center rounded-xl border bg-card p-4">
                      <img
                        src={generateQRCode() || "/placeholder.svg"}
                        alt="QR Code"
                        class="h-[220px] w-[220px]"
                      />
                    </div>
                    <div
                      class="rounded-xl border bg-card p-3 text-xs font-mono break-all cursor-pointer select-all"
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
                        Clipboard access isn't available here; select the link above and press
                        <span class="font-medium"> Ctrl+C</span> (or <span class="font-medium">Cmd+C</span>).
                      </div>
                    </Show>
                    <div class="flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void copyShareUrl()}
                        data-testid="copy-share-url"
                      >
                        <Copy class="mr-2 size-4" />
                        {copiedShareLink() ? "Copied" : "Copy link"}
                      </Button>
                      <Show when={canNativeShare()}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void nativeShare()}
                          data-testid="native-share-url"
                        >
                          <Share2 class="mr-2 size-4" />
                          Share…
                        </Button>
                      </Show>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Link
                to="/settings/$connectionId"
                params={{ connectionId: connectionId() }}
              >
                <Button variant="outline" size="sm">
                  <Settings class="mr-2 size-4" />
                  Settings
                </Button>
              </Link>
              <Link to="/">
                <Button variant="outline" size="sm">
                  <Home class="mr-2 size-4" />
                  Home
                </Button>
              </Link>
            </div>
          </div>

          <div class="grid gap-6 lg:grid-cols-[1fr_340px]">
            <div class="grid gap-6">
              <Card class="overflow-hidden">
                <CardHeader class="border-b">
                  <CardTitle>Wheel</CardTitle>
                </CardHeader>
                <CardContent class="p-6">
                  <div class="mx-auto w-[min(22rem,80vw)]">
                    <div class="relative aspect-square">
                      <div class="absolute -top-1 left-1/2 z-10 -translate-x-1/2">
                        <div class="h-0 w-0 border-l-[11px] border-r-[11px] border-t-[20px] border-l-transparent border-r-transparent border-t-primary drop-shadow" />
                      </div>

                      <div
                        class="relative size-full"
                        ref={(el) => {
                          wheelContainerEl = el;
                        }}
                      >
                        <Show when={pinnedTooltip() ?? hoverTooltip()}>
                          {(tooltip) => (
                            <Card
                              class="absolute z-20 pointer-events-none px-2 py-1 text-sm bg-background/95 backdrop-blur shadow-lg w-max max-w-[220px]"
                              style={{
                                left: `${tooltip().x}px`,
                                top: `${tooltip().y}px`,
                                transform: "translate(-50%, -130%)",
                              }}
                            >
                              <div class="font-medium break-words">
                                {tooltip().name}
                              </div>
                              <div class="text-xs text-muted-foreground">
                                Tap to pin • Tap outside to close
                              </div>
                            </Card>
                          )}
                        </Show>

                        <div
                          class="size-full rounded-full border-[10px] border-foreground/15 bg-card shadow-[0_18px_50px_-18px_color-mix(in_oklch,var(--foreground)_40%,transparent)] overflow-hidden"
                          style={{
                            transform: `rotate(${rotation()}deg)`,
                            transition: isSpinning()
                              ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
                              : "none",
                          }}
                        >
                          <svg class="size-full" viewBox="0 0 200 200">
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
                            {/* Center circle */}
                            <circle
                              cx="100"
                              cy="100"
                              r="18"
                              fill="rgba(15, 23, 42, 0.82)"
                              stroke="rgba(15, 23, 42, 0.92)"
                              stroke-width="3"
                            />
                            <circle cx="100" cy="100" r="8" fill="rgba(148, 163, 184, 0.9)" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div class="flex flex-wrap justify-center gap-3">
                <Button
                  onClick={spinWheel}
                  disabled={isSpinning() || segments().length === 0}
                  size="lg"
                  class="px-8"
                  data-testid="spin-wheel"
                >
                  <Play class="mr-2 size-5" />
                  {isSpinning() ? "Spinning…" : "Spin"}
                </Button>
                <Button
                  onClick={resetWheel}
                  variant="outline"
                  size="lg"
                  disabled={isSpinning()}
                >
                  <RotateCcw class="mr-2 size-5" />
                  Reset
                </Button>
              </div>

              <Show when={selectedEatery()}>
                {(eatery) => (
                  <Card class="overflow-hidden border-0 bg-gradient-to-br from-success/35 via-card to-accent/20">
                    <CardHeader class="border-b border-foreground/10">
                      <CardTitle>Winner</CardTitle>
                    </CardHeader>
                    <CardContent class="grid gap-2 pt-6">
                      <div class="text-2xl font-semibold tracking-tight">
                        {eatery().name}
                      </div>
                      <Show when={eatery().cuisine}>
                        <Badge variant="secondary" class="w-fit">
                          {eatery().cuisine}
                        </Badge>
                      </Show>
                    </CardContent>
                  </Card>
                )}
              </Show>
            </div>

            <div class="grid gap-6">
              <Card>
                <CardHeader class="border-b">
                  <CardTitle class="flex items-center gap-2">
                    <Users class="size-5" />
                    Participants
                  </CardTitle>
                </CardHeader>
                <CardContent class="grid gap-3 pt-6">
                  <Show
                    when={activeUsers().length > 0}
                    fallback={
                      <div class="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                        Add users in settings to start scoring.
                      </div>
                    }
                  >
                    <div class="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedUsers(activeUsers().map((u) => u.id))}
                      >
                        Select all
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedUsers([])}
                      >
                        Clear
                      </Button>
                    </div>

                    <div class="grid gap-2">
                      {activeUsers().map((user) => (
                        <label
                          for={`user-${user.id}`}
                          class="flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 py-2"
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
                            class="size-4 rounded border-border bg-background text-primary"
                          />
                          <span class="text-sm font-medium">{user.name}</span>
                        </label>
                      ))}
                    </div>

                    <Show when={selectedUsers().length === 0}>
                      <div class="text-sm text-destructive">
                        Select at least one participant to spin.
                      </div>
                    </Show>
                  </Show>
                </CardContent>
              </Card>

              <Card>
                <CardHeader class="border-b">
                  <CardTitle class="flex items-center gap-2">
                    Eateries ({activeEateries().length})
                    <Show when={vetoedEateryCount() > 0}>
                      <Badge variant="secondary">{vetoedEateryCount()} vetoed</Badge>
                    </Show>
                  </CardTitle>
                </CardHeader>
                <CardContent class="pt-6">
                  <div class="grid gap-2 max-h-72 overflow-y-auto">
                    <For each={segments()}>
                      {(segment) => (
                        <div class="flex items-start justify-between gap-3 rounded-xl border bg-card p-3">
                          <div class="min-w-0">
                            <div class="truncate font-medium">{segment.eatery.name}</div>
                            <Show when={segment.eatery.cuisine}>
                              <div class="text-sm text-muted-foreground">
                                {segment.eatery.cuisine}
                              </div>
                            </Show>
                          </div>
                          <div class="shrink-0 text-right">
                            <div class="text-sm font-medium">{segment.combinedScore}</div>
                            <div class="text-xs text-muted-foreground">
                              {segment.percentage.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Show>
    </Show>
  );
}
