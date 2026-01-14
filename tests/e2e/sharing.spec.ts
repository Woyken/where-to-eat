import { expect, test } from "@playwright/test";
import { selectOrCreateUser } from "./helpers";

test("sharing transfers connection data between browsers", async ({
  browser,
}, testInfo) => {
  // Two isolated browser contexts simulate two different browsers/devices.
  const sharerContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const receiverContext = await browser.newContext({ ignoreHTTPSErrors: true });

  const sharer = await sharerContext.newPage();
  const receiver = await receiverContext.newPage();

  const browserLogs: string[] = [];

  const wireLogs = (label: string, page: typeof sharer) => {
    page.on("console", (msg) => {
      const line = `[${label} console.${msg.type()}] ${msg.text()}`;
      browserLogs.push(line);
      // Show in test runner output even when headed.
      console.log(line);
    });
    page.on("pageerror", (err) => {
      const line = `[${label} pageerror] ${err?.stack ?? String(err)}`;
      browserLogs.push(line);
      console.log(line);
    });
    page.on("requestfailed", (req) => {
      const failure = req.failure();
      const line = `[${label} requestfailed] ${req.method()} ${req.url()} :: ${failure?.errorText ?? "(unknown)"}`;
      browserLogs.push(line);
      console.log(line);
    });
  };

  wireLogs("sharer", sharer);
  wireLogs("receiver", receiver);

  await sharer.goto("/");

  // SolidStart hydrates client-side handlers; clicking too early can be a no-op.
  await sharer.waitForLoadState("networkidle");

  // Retry because the first click can happen before hydration.
  for (let attempt = 0; attempt < 10; attempt++) {
    await sharer.getByTestId("start-fresh").click();
    await sharer.waitForTimeout(250);
    if (/\/wheel\/[0-9a-f-]{36}$/.test(sharer.url())) break;
  }

  await expect(sharer).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/, {
    timeout: 60_000,
  });
  await selectOrCreateUser(sharer, "Sharer");

  const sharerWheelUrl = sharer.url();
  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(sharerWheelUrl);
  expect(
    connectionIdMatch,
    `Expected connectionId in URL: ${sharerWheelUrl}`,
  ).not.toBeNull();
  if (!connectionIdMatch) {
    throw new Error(`Expected connectionId in URL: ${sharerWheelUrl}`);
  }
  const connectionId = connectionIdMatch[1];

  // Open Share dialog and grab connect-to URL.
  await sharer.getByTestId("share-button").click();
  const shareUrlText = (
    await sharer.getByTestId("share-url").innerText()
  ).trim();
  const shareUrl = new URL(shareUrlText);
  expect(shareUrl.pathname).toBe("/connect-to");
  expect(shareUrl.searchParams.get("connectionId")).toBe(connectionId);
  expect(shareUrl.searchParams.get("peerId")).toBeTruthy();

  // Receiver visits the connect link and should be navigated to the wheel.
  await receiver.goto(shareUrl.href);

  // Helpful when running headed: snapshot what's currently visible.
  await testInfo.attach("receiver-url.txt", {
    body: receiver.url(),
    contentType: "text/plain",
  });

  // Wait for navigation to wheel after data sync completes
  await expect(receiver).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 90_000, // P2P connections can be slow
  });
  await selectOrCreateUser(receiver, "Receiver");

  // Make a change in sharer, verify receiver gets it.
  const newEateryName = `Playwright Cafe ${Date.now()}`;

  await sharer.goto(`/settings/${connectionId}`);
  await sharer.waitForLoadState("networkidle");

  await expect(sharer.getByTestId("add-eatery-open")).toBeVisible();
  await sharer.getByTestId("add-eatery-open").click();
  await expect(sharer.getByTestId("add-eatery-name")).toBeVisible();

  await sharer.getByTestId("add-eatery-name").fill(newEateryName);
  await sharer.getByTestId("add-eatery-submit").click();

  await receiver.goto(`/settings/${connectionId}`);
  await expect(
    receiver.getByRole("heading", { name: newEateryName }).first(),
  ).toBeVisible({
    timeout: 60_000,
  });

  await sharerContext.close();
  await receiverContext.close();

  // Always attach logs (useful even if the test passes/flakes).
  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});
