import {
  createFileRoute,
  Link,
  Navigate,
  useLinkProps,
  useRouter,
} from "@tanstack/solid-router";
import Home from "lucide-solid/icons/home";
import Play from "lucide-solid/icons/play";
import QrCode from "lucide-solid/icons/qr-code";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import Settings from "lucide-solid/icons/settings";
import Users from "lucide-solid/icons/users";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
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
  const [showUsers, setShowUsers] = createSignal(false);
  const [rotation, setRotation] = createSignal(0);
  const [selectedUsers, setSelectedUsers] = createSignal<string[]>([]);

  type WheelTooltipState = { name: string; x: number; y: number };
  const [hoverTooltip, setHoverTooltip] = createSignal<WheelTooltipState | null>(
    null,
  );
  const [pinnedTooltip, setPinnedTooltip] = createSignal<
    WheelTooltipState | null
  >(null);
  let wheelContainerEl: HTMLDivElement | undefined;

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
          <div class="min-h-screen p-4">
            <div class="max-w-2xl mx-auto space-y-6">
              <div class="flex items-center justify-between">
                <h1 class="text-3xl font-bold">Eatery Wheel</h1>
                <Link to="/">
                  <Button variant="outline" size="sm">
                    <Home class="w-4 h-4 mr-2" />
                    Home
                  </Button>
                </Link>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Setup Required</CardTitle>
                </CardHeader>
                <CardContent class="space-y-4">
                  <p class="text-muted-foreground">
                    You need to add some eateries before you can spin the wheel.
                  </p>
                  <Link
                    to="/settings/$connectionId"
                    params={{ connectionId: connectionId() }}
                  >
                    <Button>
                      <Settings class="w-4 h-4 mr-2" />
                      Go to Settings
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        }
      >
        <div class="min-h-screen">
          <div class="max-w-4xl mx-auto space-y-6">
            <div class="flex items-center justify-between">
              <h1 class="text-3xl font-bold">Eatery Wheel</h1>
              <div class="flex gap-2">
                <Dialog open={showQR()} onOpenChange={setShowQR}>
                  <DialogTrigger>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="share-button"
                    >
                      <QrCode class="w-4 h-4 mr-2" />
                      Share
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Share Connection</DialogTitle>
                      <DialogDescription>
                        Others can scan this QR code or use the ID to connect
                      </DialogDescription>
                    </DialogHeader>
                    <div class="text-center space-y-4">
                      <img
                        src={generateQRCode() || "/placeholder.svg"}
                        alt="QR Code"
                        class="mx-auto"
                      />
                      <div
                        class="p-2 bg-secondary rounded text-sm font-mono break-all"
                        data-testid="share-url"
                      >
                        {shareUrl().href}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Link
                  to="/settings/$connectionId"
                  params={{ connectionId: connectionId() }}
                >
                  <Button variant="outline" size="sm">
                    <Settings class="w-4 h-4 mr-2" />
                    Settings
                  </Button>
                </Link>
                <Link to="/">
                  <Button variant="outline" size="sm">
                    <Home class="w-4 h-4 mr-2" />
                    Home
                  </Button>
                </Link>
              </div>
            </div>

            <div class="grid lg:grid-cols-3 gap-6">
              <div class="lg:col-span-2 space-y-6">
                <Card>
                  <CardContent class="p-6">
                    <div class="relative w-80 h-80 mx-auto">
                      {/* Pointer at top */}
                      <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1 z-10">
                        <div class="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-red-600 drop-shadow-lg" />
                      </div>

                      {/* Wheel container */}
                      <div class="relative w-full h-full" ref={(el) => (wheelContainerEl = el)}>
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
                              <div class="font-medium break-words">{tooltip().name}</div>
                              <div class="text-xs text-muted-foreground">
                                Tap to pin • Tap outside to close
                              </div>
                            </Card>
                          )}
                        </Show>

                        <div
                          class="w-full h-full rounded-full border-8 border-gray-800 shadow-2xl relative overflow-hidden"
                          style={{
                            transform: `rotate(${rotation()}deg)`,
                            transition: isSpinning()
                              ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
                              : "none",
                          }}
                        >
                        <svg class="w-full h-full" viewBox="0 0 200 200">
                          <defs>
                            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                              <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.3"/>
                            </filter>
                          </defs>
                          <For each={segments()}>
                            {(segment) => {
                              const arcAngle = segment.endAngle - segment.startAngle;
                              // SVG arc commands can't draw a full 360° (start=end becomes a tiny sliver).
                              // When a segment covers the whole wheel, render it as a circle instead.
                              const isFullCircle = arcAngle >= 359.999;

                              const startAngleRad = ((segment.startAngle - 90) * Math.PI) / 180;
                              const endAngleRad = ((segment.endAngle - 90) * Math.PI) / 180;
                              const largeArcFlag = segment.endAngle - segment.startAngle > 180 ? 1 : 0;

                              const x1 = 100 + 95 * Math.cos(startAngleRad);
                              const y1 = 100 + 95 * Math.sin(startAngleRad);
                              const x2 = 100 + 95 * Math.cos(endAngleRad);
                              const y2 = 100 + 95 * Math.sin(endAngleRad);

                              // Segment label placement
                              const midAngle = (segment.startAngle + segment.endAngle) / 2;
                              const midAngleRad = ((midAngle - 90) * Math.PI) / 180;
                              const textRadius = 52;
                              const textX = 100 + textRadius * Math.cos(midAngleRad);
                              const textY = 100 + textRadius * Math.sin(midAngleRad);
                              const shouldFlip = midAngle > 90 && midAngle < 270;
                              const textRotation = shouldFlip ? midAngle + 180 : midAngle;

                              // Calculate available arc length for text sizing
                              const arcLength = ((arcAngle * Math.PI) / 180) * textRadius;

                              // Truncate name if too long
                              const maxCharsFromArc = Math.max(3, Math.floor(arcLength / 5.5));
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
                              const displayName = segment.eatery.name.length > maxChars
                                ? segment.eatery.name.slice(0, maxChars - 1) + "…"
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
                                    if (current?.name === segment.eatery.name) {
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
                          <circle cx="100" cy="100" r="18" fill="#374151" stroke="#1f2937" stroke-width="3" />
                          <circle cx="100" cy="100" r="8" fill="#6b7280" />
                        </svg>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div class="flex justify-center gap-4">
                  <Button
                    onClick={spinWheel}
                    disabled={isSpinning()}
                    size="lg"
                    class="px-8"
                    data-testid="spin-wheel"
                  >
                    <Play class="w-5 h-5 mr-2" />
                    {isSpinning() ? "Spinning..." : "Spin Wheel"}
                  </Button>
                  <Button
                    onClick={resetWheel}
                    variant="outline"
                    size="lg"
                    disabled={isSpinning()}
                  >
                    <RotateCcw class="w-5 h-5 mr-2" />
                    Reset
                  </Button>
                </div>

                {selectedEatery() && (
                  <Card class="border-warning bg-success">
                    <CardHeader>
                      <CardTitle class="text-success-foreground">
                        🎉 Winner!
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div class="text-2xl font-bold text-success-foreground">
                        {selectedEatery()!.name}
                      </div>
                      {selectedEatery()!.cuisine && (
                        <Badge variant="secondary" class="mt-2">
                          {selectedEatery()!.cuisine}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              <div class="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle class="flex items-center gap-2">
                      <Users class="w-5 h-5" />
                      Participating Users
                    </CardTitle>
                  </CardHeader>
                  <CardContent class="space-y-3">
                    {activeUsers().map((user) => (
                      <div class="flex items-center space-x-2">
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
                          class="rounded border-secondary"
                        />
                        <label
                          for={`user-${user.id}`}
                          class={`text-sm font-medium`}
                        >
                          {user.name}
                        </label>
                      </div>
                    ))}
                    {selectedUsers().length === 0 && (
                      <p class="text-sm text-destructive">
                        Select at least one user to spin
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle class="flex items-center gap-2">
                      Eateries ({activeEateries().length})
                      <Show when={vetoedEateryCount() > 0}>
                        <Badge variant="secondary">{vetoedEateryCount()} vetoed</Badge>
                      </Show>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div class="space-y-2 max-h-60 overflow-y-auto">
                      {getWheelSegments().map((segment) => (
                        <div class="flex items-center justify-between p-2 border-[3px] rounded">
                          <div>
                            <div class="font-medium">{segment.eatery.name}</div>
                            {segment.eatery.cuisine && (
                              <div class="text-sm text-muted-foreground">
                                {segment.eatery.cuisine}
                              </div>
                            )}
                          </div>
                          <div class="text-right">
                            <div class="text-sm font-medium">
                              Score: {segment.combinedScore}
                            </div>
                            <div class="text-xs text-muted-foreground">
                              {segment.percentage.toFixed(1)}% of wheel
                            </div>
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
