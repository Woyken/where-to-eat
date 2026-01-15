import IconDownload from "lucide-solid/icons/download";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Button } from "~/components/ui/button";

// Extend the window interface to include the beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

export function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] =
    createSignal<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = createSignal(false);

  onMount(() => {
    // Check if already installed (running in standalone mode)
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error - iOS Safari standalone mode
      window.navigator.standalone === true
    ) {
      setIsInstalled(true);
      return;
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Store the event so it can be triggered later
      setDeferredPrompt(e);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    onCleanup(() => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    });
  });

  const handleInstallClick = async () => {
    const prompt = deferredPrompt();
    if (!prompt) return;

    // Show the install prompt
    await prompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await prompt.userChoice;

    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  // Only show if we have a deferred prompt and app is not installed
  const canInstall = () => deferredPrompt() !== null && !isInstalled();

  return (
    <Show when={canInstall()}>
      <Button
        variant="ghost"
        size="icon"
        class="w-9 h-9"
        onClick={handleInstallClick}
        title="Install app"
      >
        <IconDownload class="size-4" />
        <span class="sr-only">Install app</span>
      </Button>
    </Show>
  );
}
