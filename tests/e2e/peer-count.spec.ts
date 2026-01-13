import { expect, test } from "@playwright/test";

test.describe("connected peer count", () => {
  test("displays 0 connected peers initially", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The peer count element should be visible in the header
    const peerCountElement = page.getByTestId("connected-peer-count");
    await expect(peerCountElement).toBeVisible();

    // Initially, no peers are connected
    const peerCountValue = page.getByTestId("peer-count-value");
    await expect(peerCountValue).toHaveText("0");
  });

  test("updates peer count when a peer connects", async ({
    browser,
  }, testInfo) => {
    // Two isolated browser contexts simulate two different browsers/devices.
    const sharerContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const receiverContext = await browser.newContext({
      ignoreHTTPSErrors: true,
    });

    const sharer = await sharerContext.newPage();
    const receiver = await receiverContext.newPage();

    const browserLogs: string[] = [];

    const wireLogs = (label: string, page: typeof sharer) => {
      page.on("console", (msg) => {
        const line = `[${label} console.${msg.type()}] ${msg.text()}`;
        browserLogs.push(line);
        console.log(line);
      });
    };

    wireLogs("sharer", sharer);
    wireLogs("receiver", receiver);

    await sharer.goto("/");
    await sharer.waitForLoadState("networkidle");

    // Initially 0 peers connected
    await expect(sharer.getByTestId("peer-count-value")).toHaveText("0");

    // Create a new connection by clicking "Start Fresh"
    for (let attempt = 0; attempt < 10; attempt++) {
      await sharer.getByTestId("start-fresh").click();
      await sharer.waitForTimeout(250);
      if (/\/wheel\/[0-9a-f-]{36}$/.test(sharer.url())) break;
    }

    await expect(sharer).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/, {
      timeout: 60_000,
    });

    // Get the share URL
    await sharer.getByTestId("share-button").click();
    const shareUrlText = (
      await sharer.getByTestId("share-url").innerText()
    ).trim();
    const shareUrl = new URL(shareUrlText);

    // Close the dialog
    await sharer.keyboard.press("Escape");

    // Receiver visits the connect link
    await receiver.goto(shareUrl.href);

    // Wait for connection to be established
    const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(sharer.url());
    if (!connectionIdMatch) {
      throw new Error(
        `Expected sharer URL to contain connectionId, got: ${sharer.url()}`,
      );
    }
    const connectionId = connectionIdMatch[1];

    await expect(receiver).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
      timeout: 90_000,
    });

    // Wait for peer count to update on both sides
    // Each should show 1 connected peer
    await expect(sharer.getByTestId("peer-count-value")).toHaveText("1", {
      timeout: 30_000,
    });
    await expect(receiver.getByTestId("peer-count-value")).toHaveText("1", {
      timeout: 30_000,
    });

    await sharerContext.close();
    await receiverContext.close();

    await testInfo.attach("browser-console.txt", {
      body: browserLogs.join("\n"),
      contentType: "text/plain",
    });
  });

  test("opens active connections list when clicked", async ({
    browser,
  }, testInfo) => {
    const sharerContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const receiverContext = await browser.newContext({
      ignoreHTTPSErrors: true,
    });

    const sharer = await sharerContext.newPage();
    const receiver = await receiverContext.newPage();

    const browserLogs: string[] = [];
    const wireLogs = (label: string, page: typeof sharer) => {
      page.on("console", (msg) => {
        const line = `[${label} console.${msg.type()}] ${msg.text()}`;
        browserLogs.push(line);
        console.log(line);
      });
    };

    wireLogs("sharer", sharer);
    wireLogs("receiver", receiver);

    await sharer.goto("/");
    await sharer.waitForLoadState("networkidle");

    // Create a new connection by clicking "Start Fresh"
    for (let attempt = 0; attempt < 10; attempt++) {
      await sharer.getByTestId("start-fresh").click();
      await sharer.waitForTimeout(250);
      if (/\/wheel\/[0-9a-f-]{36}$/.test(sharer.url())) break;
    }

    await expect(sharer).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/, {
      timeout: 60_000,
    });

    // Get the share URL
    await sharer.getByTestId("share-button").click();
    const shareUrlText = (
      await sharer.getByTestId("share-url").innerText()
    ).trim();
    const shareUrl = new URL(shareUrlText);
    await sharer.keyboard.press("Escape");

    // Receiver connects
    await receiver.goto(shareUrl.href);
    const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(sharer.url());
    if (!connectionIdMatch) {
      throw new Error(
        `Expected sharer URL to contain connectionId, got: ${sharer.url()}`,
      );
    }
    const connectionId = connectionIdMatch[1];
    await expect(receiver).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
      timeout: 90_000,
    });

    // Wait for peer count to update
    await expect(sharer.getByTestId("peer-count-value")).toHaveText("1", {
      timeout: 30_000,
    });
    await expect(receiver.getByTestId("peer-count-value")).toHaveText("1", {
      timeout: 30_000,
    });

    // Clicking the icon opens a list of active connections
    await sharer.getByTestId("connected-peer-count").click();
    await expect(sharer.getByTestId("active-connections-dialog")).toBeVisible();
    await expect(sharer.getByTestId("active-connection-item")).toHaveCount(1);

    await receiver.getByTestId("connected-peer-count").click();
    await expect(
      receiver.getByTestId("active-connections-dialog"),
    ).toBeVisible();
    await expect(receiver.getByTestId("active-connection-item")).toHaveCount(1);

    await sharerContext.close();
    await receiverContext.close();

    await testInfo.attach("browser-console.txt", {
      body: browserLogs.join("\n"),
      contentType: "text/plain",
    });
  });

  test("peer count decreases when a peer disconnects", async ({
    browser,
  }, testInfo) => {
    // Two isolated browser contexts
    const sharerContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const receiverContext = await browser.newContext({
      ignoreHTTPSErrors: true,
    });

    const sharer = await sharerContext.newPage();
    const receiver = await receiverContext.newPage();

    const browserLogs: string[] = [];

    const wireLogs = (label: string, page: typeof sharer) => {
      page.on("console", (msg) => {
        const line = `[${label} console.${msg.type()}] ${msg.text()}`;
        browserLogs.push(line);
        console.log(line);
      });
    };

    wireLogs("sharer", sharer);
    wireLogs("receiver", receiver);

    await sharer.goto("/");
    await sharer.waitForLoadState("networkidle");

    // Create a new connection
    for (let attempt = 0; attempt < 10; attempt++) {
      await sharer.getByTestId("start-fresh").click();
      await sharer.waitForTimeout(250);
      if (/\/wheel\/[0-9a-f-]{36}$/.test(sharer.url())) break;
    }

    await expect(sharer).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/, {
      timeout: 60_000,
    });

    // Get the share URL
    await sharer.getByTestId("share-button").click();
    const shareUrlText = (
      await sharer.getByTestId("share-url").innerText()
    ).trim();
    const shareUrl = new URL(shareUrlText);
    await sharer.keyboard.press("Escape");

    // Receiver connects
    await receiver.goto(shareUrl.href);

    const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(sharer.url());
    if (!connectionIdMatch) {
      throw new Error(
        `Expected sharer URL to contain connectionId, got: ${sharer.url()}`,
      );
    }
    const connectionId = connectionIdMatch[1];

    await expect(receiver).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
      timeout: 90_000,
    });

    // Wait for peer count to be 1 on both sides
    await expect(sharer.getByTestId("peer-count-value")).toHaveText("1", {
      timeout: 30_000,
    });
    await expect(receiver.getByTestId("peer-count-value")).toHaveText("1", {
      timeout: 30_000,
    });

    // Navigate away from the page on receiver before closing to trigger a cleaner disconnect
    await receiver.goto("about:blank");
    await receiver.waitForTimeout(500);

    // Close the receiver context to simulate disconnection
    await receiverContext.close();

    // Wait for peer count to decrease on the sharer side
    // Note: P2P connection cleanup can take some time
    await expect(sharer.getByTestId("peer-count-value")).toHaveText("0", {
      timeout: 60_000,
    });

    await sharerContext.close();

    await testInfo.attach("browser-console.txt", {
      body: browserLogs.join("\n"),
      contentType: "text/plain",
    });
  });

  test("peer count shows multiple peers correctly", async ({
    browser,
  }, testInfo) => {
    // Three isolated browser contexts
    const sharerContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const receiver1Context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const receiver2Context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });

    const sharer = await sharerContext.newPage();
    const receiver1 = await receiver1Context.newPage();
    const receiver2 = await receiver2Context.newPage();

    const browserLogs: string[] = [];

    const wireLogs = (label: string, page: typeof sharer) => {
      page.on("console", (msg) => {
        const line = `[${label} console.${msg.type()}] ${msg.text()}`;
        browserLogs.push(line);
        console.log(line);
      });
    };

    wireLogs("sharer", sharer);
    wireLogs("receiver1", receiver1);
    wireLogs("receiver2", receiver2);

    await sharer.goto("/");
    await sharer.waitForLoadState("networkidle");

    // Create a new connection
    for (let attempt = 0; attempt < 10; attempt++) {
      await sharer.getByTestId("start-fresh").click();
      await sharer.waitForTimeout(250);
      if (/\/wheel\/[0-9a-f-]{36}$/.test(sharer.url())) break;
    }

    await expect(sharer).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/, {
      timeout: 60_000,
    });

    // Get the share URL
    await sharer.getByTestId("share-button").click();
    const shareUrlText = (
      await sharer.getByTestId("share-url").innerText()
    ).trim();
    const shareUrl = new URL(shareUrlText);
    await sharer.keyboard.press("Escape");

    const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(sharer.url());
    if (!connectionIdMatch) {
      throw new Error(
        `Expected sharer URL to contain connectionId, got: ${sharer.url()}`,
      );
    }
    const connectionId = connectionIdMatch[1];

    // First receiver connects
    await receiver1.goto(shareUrl.href);
    await expect(receiver1).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
      timeout: 90_000,
    });

    // Wait for peer count to be 1 on sharer
    await expect(sharer.getByTestId("peer-count-value")).toHaveText("1", {
      timeout: 30_000,
    });

    // Second receiver connects
    await receiver2.goto(shareUrl.href);
    await expect(receiver2).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
      timeout: 90_000,
    });

    // Wait for peer count to be 2 on sharer (connected to both receivers)
    await expect(sharer.getByTestId("peer-count-value")).toHaveText("2", {
      timeout: 30_000,
    });

    // In a mesh network, receivers should also see peers
    // receiver1 should see sharer + receiver2 = 2 peers
    // receiver2 should see sharer + receiver1 = 2 peers
    await expect(receiver1.getByTestId("peer-count-value")).toHaveText("2", {
      timeout: 30_000,
    });
    await expect(receiver2.getByTestId("peer-count-value")).toHaveText("2", {
      timeout: 30_000,
    });

    await sharerContext.close();
    await receiver1Context.close();
    await receiver2Context.close();

    await testInfo.attach("browser-console.txt", {
      body: browserLogs.join("\n"),
      contentType: "text/plain",
    });
  });

  test("multiple tabs from same browser appear as single peer to another browser", async ({
    browser,
  }, testInfo) => {
    // User A: One browser context with multiple tabs
    const userAContext = await browser.newContext({ ignoreHTTPSErrors: true });
    // User B: Separate browser context (different user)
    const userBContext = await browser.newContext({ ignoreHTTPSErrors: true });

    const userATab1 = await userAContext.newPage();
    const userATab2 = await userAContext.newPage();
    const userATab3 = await userAContext.newPage();
    const userBPage = await userBContext.newPage();

    const browserLogs: string[] = [];
    const wireLogs = (label: string, page: typeof userATab1) => {
      page.on("console", (msg) => {
        const line = `[${label}] ${msg.text()}`;
        browserLogs.push(line);
        console.log(line);
      });
    };

    wireLogs("A-tab1", userATab1);
    wireLogs("A-tab2", userATab2);
    wireLogs("A-tab3", userATab3);
    wireLogs("B", userBPage);

    // User A Tab 1 creates a connection
    await userATab1.goto("/");
    await userATab1.waitForLoadState("networkidle");
    await userATab1.getByTestId("start-fresh").click();
    await expect(userATab1).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/, {
      timeout: 60_000,
    });

    const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(userATab1.url());
    if (!connectionIdMatch) {
      throw new Error(
        `Expected user A tab URL to contain connectionId, got: ${userATab1.url()}`,
      );
    }
    const connectionId = connectionIdMatch[1];

    await userATab1.getByTestId("share-button").click();
    const shareUrl = (
      await userATab1.getByTestId("share-url").innerText()
    ).trim();
    await userATab1.keyboard.press("Escape");

    // User A opens same connection in Tab 2 and Tab 3
    await userATab2.goto(shareUrl);
    await expect(userATab2).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
      timeout: 60_000,
    });

    await userATab3.goto(shareUrl);
    await expect(userATab3).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
      timeout: 60_000,
    });

    // Wait for tabs to establish with SW
    await userATab1.waitForTimeout(2000);

    // User B connects
    await userBPage.goto(shareUrl);
    await expect(userBPage).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
      timeout: 60_000,
    });

    // Wait for all connections to establish
    await userBPage.waitForTimeout(3000);

    // Check how many peers User B sees
    // With SW-based peer connections, all tabs in User A's browser share ONE peer ID
    // So User B should see exactly 1 peer (User A), not 3 (one per tab)
    const peerCountB = await userBPage
      .getByTestId("peer-count-value")
      .innerText();
    console.log(`User B sees ${peerCountB} connected peers`);

    // After SW refactoring: B sees 1 peer (User A's browser, not individual tabs)
    await expect(userBPage.getByTestId("peer-count-value")).toHaveText("1", {
      timeout: 30_000,
    });

    // All of User A's tabs should also see 1 peer (User B)
    await expect(userATab1.getByTestId("peer-count-value")).toHaveText("1", {
      timeout: 30_000,
    });
    await expect(userATab2.getByTestId("peer-count-value")).toHaveText("1", {
      timeout: 30_000,
    });
    await expect(userATab3.getByTestId("peer-count-value")).toHaveText("1", {
      timeout: 30_000,
    });

    await userAContext.close();
    await userBContext.close();

    await testInfo.attach("browser-console.txt", {
      body: browserLogs.join("\n"),
      contentType: "text/plain",
    });
  });
});
