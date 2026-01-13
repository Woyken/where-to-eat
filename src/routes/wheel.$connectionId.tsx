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
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
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

    // Calculate combined scores for each eatery
    const eateryScores = activeEateries().map((eatery) => {
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

    // Calculate random rotation
    const minRotation = 1440;
    const maxRotation = 2160;
    const randomRotation =
      Math.random() * (maxRotation - minRotation) + minRotation;
    const newRotation = rotation() + randomRotation;

    setRotation(newRotation);

    // Calculate which eatery was selected based on proportional segments
    setTimeout(() => {
      const normalizedRotation = (360 - (newRotation % 360)) % 360;
      const selectedSegment = segments.find(
        (segment) =>
          normalizedRotation >= segment.startAngle &&
          normalizedRotation < segment.endAngle,
      );

      if (selectedSegment) {
        setSelectedEatery(selectedSegment.eatery);
      }
      setIsSpinning(false);
    }, 3000);
  };

  const resetWheel = () => {
    setRotation(0);
    setSelectedEatery(null);
  };

  const myPeerId = usePeer2PeerId();

  const shareUrl = createMemo(() => {
    const connectToLinkUrl = router.buildLocation({
      to: router.routesByPath["/connect-to"].fullPath,
      search: { peerId: myPeerId, connectionId: connectionId() },
    });
    if (typeof window === "undefined") {
      return new URL("http://localhost");
    }
    const localUrl = new URL(location.href);
    // buildLocation returns path relative to basepath, so use href which includes the full path
    localUrl.pathname = connectToLinkUrl.href.split('?')[0].split('#')[0];
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
                      <div
                        class="w-full h-full rounded-full border-4 border-gray-800 relative overflow-hidden transition-transform duration-[3000ms] ease-out"
                        style={{ transform: `rotate(${rotation}deg)` }}
                      >
                        <svg class="w-full h-full" viewBox="0 0 200 200">
                          <For each={segments()}>
                            {(segment) => {
                              const startAngleRad =
                                (segment.startAngle * Math.PI) / 180;
                              const endAngleRad =
                                (segment.endAngle * Math.PI) / 180;
                              const largeArcFlag =
                                segment.endAngle - segment.startAngle > 180
                                  ? 1
                                  : 0;

                              const x1 = 100 + 90 * Math.cos(startAngleRad);
                              const y1 = 100 + 90 * Math.sin(startAngleRad);
                              const x2 = 100 + 90 * Math.cos(endAngleRad);
                              const y2 = 100 + 90 * Math.sin(endAngleRad);

                              const textAngle =
                                (segment.startAngle + segment.endAngle) / 2;
                              const textAngleRad = (textAngle * Math.PI) / 180;
                              const textX = 100 + 60 * Math.cos(textAngleRad);
                              const textY = 100 + 60 * Math.sin(textAngleRad);

                              // Adjust font size based on segment size
                              const fontSize = Math.max(
                                8,
                                Math.min(12, segment.percentage / 5),
                              );

                              return (
                                <g>
                                  <path
                                    d={`M 100 100 L ${x1} ${y1} A 90 90 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                                    fill={segment.color}
                                    stroke="#fff"
                                    stroke-width="2"
                                  />
                                  <text
                                    x={textX}
                                    y={textY}
                                    text-anchor="middle"
                                    dominant-baseline="middle"
                                    font-sizeze={fontSize}
                                    font-weighteight="bold"
                                    fill="white"
                                    transform={`rotate(${textAngle}, ${textX}, ${textY})`}
                                  >
                                    {segment.eatery.name}
                                  </text>
                                  {segment.percentage > 10 && (
                                    <text
                                      x={textX}
                                      y={textY + fontSize + 2}
                                      text-anchorhor="middle"
                                      dominant-baselinetBaseline="middle"
                                      font-sizeize={fontSize - 2}
                                      fill="white"
                                      transform={`rotate(${textAngle}, ${textX}, ${textY + fontSize + 2})`}
                                    >
                                      {segment.combinedScore}
                                    </text>
                                  )}
                                </g>
                              );
                            }}
                          </For>
                        </svg>
                      </div>
                      <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2">
                        <div class="w-0 h-0 border-l-4 border-r-4 border-b-8 border-l-transparent border-r-transparent border-b-gray-800"></div>
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
                    <CardTitle>Eateries ({activeEateries().length})</CardTitle>
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
