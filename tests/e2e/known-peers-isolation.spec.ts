import { expect, test } from "@playwright/test";
import { injectConnectionData, selectOrCreateUser } from "./helpers";

/**
 * Tests for per-connection known peers isolation.
 * Known peers should be scoped per connection - different connections have separate peer lists.
 * The same peer can appear in multiple connection peer lists if they connect to each separately.
 */

test.describe("known peers isolation", () => {
  test("peers are isolated per connection - connecting to connection A does not affect connection B", async ({
    browser,
  }) => {
    // Create two browser contexts (simulating two different devices)
    const deviceA = await browser.newContext({ ignoreHTTPSErrors: true });
    const deviceB = await browser.newContext({ ignoreHTTPSErrors: true });

    const pageA = await deviceA.newPage();
    const pageB = await deviceB.newPage();

    // Device A creates two separate connections
    const connectionIdA = crypto.randomUUID();
    const connectionIdB = crypto.randomUUID();
    const userIdA = crypto.randomUUID();
    const userIdB = crypto.randomUUID();

    await injectConnectionData(pageA, {
      id: connectionIdA,
      settings: {
        connection: { name: "Connection A", updatedAt: Date.now() },
        eateries: [{ id: crypto.randomUUID(), name: "Restaurant A", updatedAt: Date.now() }],
        users: [{ id: userIdA, name: "User A", email: null, updatedAt: Date.now() }],
        eateryScores: [],
        eateryVetoes: [],
      },
    });

    await injectConnectionData(pageA, {
      id: connectionIdB,
      settings: {
        connection: { name: "Connection B", updatedAt: Date.now() },
        eateries: [{ id: crypto.randomUUID(), name: "Restaurant B", updatedAt: Date.now() }],
        users: [{ id: userIdB, name: "User B", email: null, updatedAt: Date.now() }],
        eateryScores: [],
        eateryVetoes: [],
      },
    });

    // Navigate to connection A's wheel page
    await pageA.goto(`/wheel/${connectionIdA}`);
    await pageA.waitForLoadState("networkidle");

    // Get the share URL for connection A
    await pageA.getByTestId("share-button").click();
    const shareUrlTextA = await pageA.getByTestId("share-url").innerText();
    const shareUrlA = new URL(shareUrlTextA.trim());

    // Close the share dialog
    await pageA.keyboard.press("Escape");

    // Device B joins connection A via the share URL
    await pageB.goto(shareUrlA.href);

    // Wait for Device B to receive data and navigate to wheel
    await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionIdA}$`), {
      timeout: 60_000,
    });
    await selectOrCreateUser(pageB, "Device B User");

    // Now verify: Device B should only have connection A, not connection B
    // Navigate to home to see connection list
    await pageB.goto("/");
    await pageB.waitForLoadState("networkidle");

    // Device B should see "Connection A" but NOT "Connection B"
    await expect(pageB.getByText("Connection A")).toBeVisible();
    await expect(pageB.getByText("Connection B")).not.toBeVisible();

    // Verify in localStorage that knownPeers only exists for connection A
    const connectionsB = await pageB.evaluate(() => {
      const stored = localStorage.getItem("wte-connections");
      return stored ? JSON.parse(stored) : [];
    });

    const connectionAData = connectionsB.find(
      (c: { id: string }) => c.id === connectionIdA
    );
    const connectionBData = connectionsB.find(
      (c: { id: string }) => c.id === connectionIdB
    );

    // Device B should have connection A with known peers
    expect(connectionAData).toBeDefined();
    expect(connectionAData.settings.knownPeers?.length).toBeGreaterThan(0);

    // Device B should NOT have connection B at all
    expect(connectionBData).toBeUndefined();

    await deviceA.close();
    await deviceB.close();
  });

  test("same peer can be in multiple connection peer lists when connecting separately", async ({
    browser,
  }) => {
    // Create two browser contexts
    const deviceA = await browser.newContext({ ignoreHTTPSErrors: true });
    const deviceB = await browser.newContext({ ignoreHTTPSErrors: true });

    const pageA = await deviceA.newPage();
    const pageB = await deviceB.newPage();

    // Device A creates two separate connections
    const connectionId1 = crypto.randomUUID();
    const connectionId2 = crypto.randomUUID();
    const userId1 = crypto.randomUUID();
    const userId2 = crypto.randomUUID();

    await injectConnectionData(pageA, {
      id: connectionId1,
      settings: {
        connection: { name: "Lunch Group", updatedAt: Date.now() },
        eateries: [{ id: crypto.randomUUID(), name: "Lunch Spot", updatedAt: Date.now() }],
        users: [{ id: userId1, name: "Alice", email: null, updatedAt: Date.now() }],
        eateryScores: [],
        eateryVetoes: [],
      },
    });

    await injectConnectionData(pageA, {
      id: connectionId2,
      settings: {
        connection: { name: "Dinner Group", updatedAt: Date.now() },
        eateries: [{ id: crypto.randomUUID(), name: "Dinner Spot", updatedAt: Date.now() }],
        users: [{ id: userId2, name: "Bob", email: null, updatedAt: Date.now() }],
        eateryScores: [],
        eateryVetoes: [],
      },
    });

    // Get share URL for connection 1
    await pageA.goto(`/wheel/${connectionId1}`);
    await pageA.waitForLoadState("networkidle");
    await pageA.getByTestId("share-button").click();
    const shareUrl1Text = await pageA.getByTestId("share-url").innerText();
    const shareUrl1 = new URL(shareUrl1Text.trim());
    await pageA.keyboard.press("Escape");

    // Device B joins connection 1
    await pageB.goto(shareUrl1.href);
    await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId1}$`), {
      timeout: 60_000,
    });
    await selectOrCreateUser(pageB, "Guest 1");

    // Now get share URL for connection 2
    await pageA.goto(`/wheel/${connectionId2}`);
    await pageA.waitForLoadState("networkidle");
    await pageA.getByTestId("share-button").click();
    const shareUrl2Text = await pageA.getByTestId("share-url").innerText();
    const shareUrl2 = new URL(shareUrl2Text.trim());
    await pageA.keyboard.press("Escape");

    // Device B joins connection 2
    await pageB.goto(shareUrl2.href);
    await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId2}$`), {
      timeout: 60_000,
    });
    await selectOrCreateUser(pageB, "Guest 2");

    // Verify Device B has both connections with known peers in each
    const connectionsB = await pageB.evaluate(() => {
      const stored = localStorage.getItem("wte-connections");
      return stored ? JSON.parse(stored) : [];
    });

    const conn1Data = connectionsB.find(
      (c: { id: string }) => c.id === connectionId1
    );
    const conn2Data = connectionsB.find(
      (c: { id: string }) => c.id === connectionId2
    );

    // Both connections should exist
    expect(conn1Data).toBeDefined();
    expect(conn2Data).toBeDefined();

    // Both connections should have Device A's peer ID in their known peers
    expect(conn1Data.settings.knownPeers?.length).toBeGreaterThan(0);
    expect(conn2Data.settings.knownPeers?.length).toBeGreaterThan(0);

    // The peer ID in both connections should be Device A's peer ID
    const peersIn1 = conn1Data.settings.knownPeers ?? [];
    const peersIn2 = conn2Data.settings.knownPeers ?? [];

    // At least one peer should be common (Device A)
    const commonPeers = peersIn1.filter((p: string) => peersIn2.includes(p));
    expect(commonPeers.length).toBeGreaterThan(0);

    await deviceA.close();
    await deviceB.close();
  });

  test("storage sync does not overwrite local known peers", async ({
    browser,
  }) => {
    // This test verifies that when receiving storage updates from another peer,
    // the local known peers list is preserved and not overwritten

    const deviceA = await browser.newContext({ ignoreHTTPSErrors: true });
    const deviceB = await browser.newContext({ ignoreHTTPSErrors: true });
    const deviceC = await browser.newContext({ ignoreHTTPSErrors: true });

    const pageA = await deviceA.newPage();
    const pageB = await deviceB.newPage();
    const pageC = await deviceC.newPage();

    const connectionId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    // Device A creates the connection
    await injectConnectionData(pageA, {
      id: connectionId,
      settings: {
        connection: { name: "Test Session", updatedAt: Date.now() },
        eateries: [{ id: crypto.randomUUID(), name: "Test Restaurant", updatedAt: Date.now() }],
        users: [{ id: userId, name: "Creator", email: null, updatedAt: Date.now() }],
        eateryScores: [],
        eateryVetoes: [],
      },
    });

    // Get share URL
    await pageA.goto(`/wheel/${connectionId}`);
    await pageA.waitForLoadState("networkidle");
    await pageA.getByTestId("share-button").click();
    const shareUrlText = await pageA.getByTestId("share-url").innerText();
    const shareUrl = new URL(shareUrlText.trim());
    await pageA.keyboard.press("Escape");

    // Device B joins
    await pageB.goto(shareUrl.href);
    await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
      timeout: 60_000,
    });
    await selectOrCreateUser(pageB, "User B");

    // Wait a moment for peer connection to stabilize
    await pageB.waitForTimeout(2000);

    // Get Device B's known peers count before C joins
    const peersBeforeC = await pageB.evaluate((connId) => {
      const stored = localStorage.getItem("wte-connections");
      const connections = stored ? JSON.parse(stored) : [];
      const conn = connections.find((c: { id: string }) => c.id === connId);
      return conn?.settings?.knownPeers?.length ?? 0;
    }, connectionId);

    // Device C joins via Device A's share URL
    await pageC.goto(shareUrl.href);
    await expect(pageC).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
      timeout: 60_000,
    });
    await selectOrCreateUser(pageC, "User C");

    // Wait for mesh to establish
    await pageC.waitForTimeout(3000);

    // Device A makes a change that will sync to B and C
    await pageA.goto(`/settings/${connectionId}`);
    await pageA.waitForLoadState("networkidle");
    await pageA.getByTestId("add-eatery-open").click();
    await pageA.getByTestId("add-eatery-name").fill("New Restaurant");
    await pageA.getByTestId("add-eatery-submit").click();

    // Wait for sync
    await pageA.waitForTimeout(2000);

    // Verify Device B still has its known peers (should include A, and possibly C)
    const peersAfterSync = await pageB.evaluate((connId) => {
      const stored = localStorage.getItem("wte-connections");
      const connections = stored ? JSON.parse(stored) : [];
      const conn = connections.find((c: { id: string }) => c.id === connId);
      return conn?.settings?.knownPeers?.length ?? 0;
    }, connectionId);

    // Device B should still have known peers (at least A, possibly more)
    // The sync should NOT have cleared the known peers
    expect(peersAfterSync).toBeGreaterThanOrEqual(peersBeforeC);

    // Verify the eatery was synced to B (proving sync worked)
    await pageB.goto(`/settings/${connectionId}`);
    await pageB.waitForLoadState("networkidle");
    await expect(pageB.locator('h3').filter({ hasText: 'New Restaurant' })).toBeVisible({
      timeout: 10_000,
    });

    await deviceA.close();
    await deviceB.close();
    await deviceC.close();
  });

  test("known peers do not leak across connections via shared peer", async ({
    browser,
  }) => {
    // Scenario: A <-> B on conn1, B <-> C on conn2
    // A should NOT learn about C (peers are isolated per connection)
    const conn1Id = crypto.randomUUID();
    const conn2Id = crypto.randomUUID();

    // Create 3 browser contexts for A, B, C
    const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
    const contextB = await browser.newContext({ ignoreHTTPSErrors: true });
    const contextC = await browser.newContext({ ignoreHTTPSErrors: true });

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const pageC = await contextC.newPage();

    // A creates conn1
    await injectConnectionData(pageA, {
      id: conn1Id,
      settings: {
        connection: { name: "Connection 1", updatedAt: Date.now() },
        eateries: [{ id: crypto.randomUUID(), name: "Restaurant 1", updatedAt: Date.now() }],
        users: [{ id: crypto.randomUUID(), name: "User A", email: null, updatedAt: Date.now() }],
        eateryScores: [],
        eateryVetoes: [],
      },
    });

    // B will join conn1 from A, and create conn2
    await injectConnectionData(pageB, {
      id: conn2Id,
      settings: {
        connection: { name: "Connection 2", updatedAt: Date.now() },
        eateries: [{ id: crypto.randomUUID(), name: "Restaurant 2", updatedAt: Date.now() }],
        users: [{ id: crypto.randomUUID(), name: "User B2", email: null, updatedAt: Date.now() }],
        eateryScores: [],
        eateryVetoes: [],
      },
    });

    // C will join conn2 from B (C has no connections initially)

    // Start A on conn1 wheel page
    await pageA.goto(`/wheel/${conn1Id}`);
    await pageA.waitForLoadState("networkidle");
    await selectOrCreateUser(pageA, "User A");

    // Get A's share URL from the share dialog
    await pageA.getByTestId("share-button").click();
    const shareUrlA = await pageA.getByTestId("share-url").innerText();
    await pageA.keyboard.press("Escape");

    // B joins conn1 via A's share link
    const shareUrlAPath = new URL(shareUrlA.trim());
    await pageB.goto(shareUrlAPath.href);

    // Wait for B to sync conn1
    await expect(pageB).toHaveURL(new RegExp(`/wheel/${conn1Id}$`), {
      timeout: 60_000,
    });
    await selectOrCreateUser(pageB, "User B");

    // Now B goes to conn2 wheel and shares with C
    await pageB.goto(`/wheel/${conn2Id}`);
    await pageB.waitForLoadState("networkidle");
    await selectOrCreateUser(pageB, "User B2");

    await pageB.getByTestId("share-button").click();
    const shareUrlB = await pageB.getByTestId("share-url").innerText();
    await pageB.keyboard.press("Escape");

    // C joins conn2 via B's share link
    const shareUrlBPath = new URL(shareUrlB.trim());
    await pageC.goto(shareUrlBPath.href);

    // Wait for C to sync conn2
    await expect(pageC).toHaveURL(new RegExp(`/wheel/${conn2Id}$`), {
      timeout: 60_000,
    });
    await selectOrCreateUser(pageC, "User C");

    // Get C's peer ID
    const peerIdC = await pageC.evaluate(() => {
      return localStorage.getItem("wte-peer-id");
    });

    // Wait a bit for any potential gossip to propagate
    await pageA.waitForTimeout(2000);

    // Check A's known peers for conn1 - should NOT contain C
    const knownPeersA_conn1 = await pageA.evaluate((connId) => {
      const stored = localStorage.getItem("wte-connections");
      const connections = stored ? JSON.parse(stored) : [];
      const conn = connections.find((c: { id: string }) => c.id === connId);
      return conn?.settings?.knownPeers ?? [];
    }, conn1Id);

    // A should NOT know about C (C is only connected to B on conn2)
    expect(knownPeersA_conn1).not.toContain(peerIdC);

    // A should NOT have conn2 at all (connections should not leak across peer boundaries)
    const hasConn2 = await pageA.evaluate((connId) => {
      const stored = localStorage.getItem("wte-connections");
      const connections = stored ? JSON.parse(stored) : [];
      return connections.some((c: { id: string }) => c.id === connId);
    }, conn2Id);

    expect(hasConn2).toBe(false);

    await contextA.close();
    await contextB.close();
    await contextC.close();
  });

  test("reconnecting peer is remembered per connection", async ({
    browser,
  }) => {
    const deviceA = await browser.newContext({ ignoreHTTPSErrors: true });
    const deviceB = await browser.newContext({ ignoreHTTPSErrors: true });

    const pageA = await deviceA.newPage();
    const pageB = await deviceB.newPage();

    const connectionId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    // Device A creates connection
    await injectConnectionData(pageA, {
      id: connectionId,
      settings: {
        connection: { name: "Reconnect Test", updatedAt: Date.now() },
        eateries: [{ id: crypto.randomUUID(), name: "Original Restaurant", updatedAt: Date.now() }],
        users: [{ id: userId, name: "Host", email: null, updatedAt: Date.now() }],
        eateryScores: [],
        eateryVetoes: [],
      },
    });

    await pageA.goto(`/wheel/${connectionId}`);
    await pageA.waitForLoadState("networkidle");
    await pageA.getByTestId("share-button").click();
    const shareUrlText = await pageA.getByTestId("share-url").innerText();
    const shareUrl = new URL(shareUrlText.trim());
    await pageA.keyboard.press("Escape");

    // Device B joins
    await pageB.goto(shareUrl.href);
    await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
      timeout: 60_000,
    });
    await selectOrCreateUser(pageB, "Guest");

    // Wait for connection to stabilize
    await pageB.waitForTimeout(2000);

    // Get Device A's peer ID from B's known peers
    const knownPeersBefore = await pageB.evaluate((connId) => {
      const stored = localStorage.getItem("wte-connections");
      const connections = stored ? JSON.parse(stored) : [];
      const conn = connections.find((c: { id: string }) => c.id === connId);
      return conn?.settings?.knownPeers ?? [];
    }, connectionId);

    expect(knownPeersBefore.length).toBeGreaterThan(0);

    // "Disconnect" Device B by navigating away (simulating offline/disconnect)
    await pageB.goto("about:blank");
    await pageB.waitForTimeout(1000);

    // Device B "reconnects" by going back to the wheel
    await pageB.goto(`/wheel/${connectionId}`);
    await pageB.waitForLoadState("networkidle");
    await pageB.waitForTimeout(3000);

    // Known peers should still be remembered
    const knownPeersAfter = await pageB.evaluate((connId) => {
      const stored = localStorage.getItem("wte-connections");
      const connections = stored ? JSON.parse(stored) : [];
      const conn = connections.find((c: { id: string }) => c.id === connId);
      return conn?.settings?.knownPeers ?? [];
    }, connectionId);

    // The known peers should be preserved (may have more peers now, but original ones should still be there)
    for (const originalPeer of knownPeersBefore) {
      expect(knownPeersAfter).toContain(originalPeer);
    }

    await deviceA.close();
    await deviceB.close();
  });
});
