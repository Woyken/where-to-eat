import { expect, test } from "@playwright/test";
import { type InjectedConnection, injectConnectionData } from "./helpers";

test.describe("connection isolation", () => {
  test("when user1 shares connection A, user2 only receives connection A (not B or C)", async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    // Create two browser contexts (simulating two different users)
    const contextUser1 = await browser.newContext({ ignoreHTTPSErrors: true });
    const contextUser2 = await browser.newContext({ ignoreHTTPSErrors: true });

    const pageUser1 = await contextUser1.newPage();
    const pageUser2 = await contextUser2.newPage();

    // Enable console logging for debugging
    pageUser1.on("console", (msg) => {
      console.log(`[User1 ${msg.type()}] ${msg.text()}`);
    });
    pageUser2.on("console", (msg) => {
      console.log(`[User2 ${msg.type()}] ${msg.text()}`);
    });

    // Define three connections for User1
    const connectionA: InjectedConnection = {
      id: "connection-a-id-12345",
      settings: {
        connection: { name: "Connection A - Shared", updatedAt: Date.now() },
        eateries: [
          { id: "eatery-a1", name: "Eatery A1", updatedAt: Date.now() },
        ],
        users: [
          {
            id: "user-1",
            name: "User One",
            email: null,
            updatedAt: Date.now(),
          },
        ],
        eateryScores: [],
        eateryVetoes: [],
      },
    };

    const connectionB: InjectedConnection = {
      id: "connection-b-id-67890",
      settings: {
        connection: { name: "Connection B - Private", updatedAt: Date.now() },
        eateries: [
          { id: "eatery-b1", name: "Eatery B1 PRIVATE", updatedAt: Date.now() },
        ],
        users: [
          {
            id: "user-1",
            name: "User One",
            email: null,
            updatedAt: Date.now(),
          },
        ],
        eateryScores: [],
        eateryVetoes: [],
      },
    };

    const connectionC: InjectedConnection = {
      id: "connection-c-id-11111",
      settings: {
        connection: {
          name: "Connection C - Also Private",
          updatedAt: Date.now(),
        },
        eateries: [
          { id: "eatery-c1", name: "Eatery C1 PRIVATE", updatedAt: Date.now() },
        ],
        users: [
          {
            id: "user-1",
            name: "User One",
            email: null,
            updatedAt: Date.now(),
          },
        ],
        eateryScores: [],
        eateryVetoes: [],
      },
    };

    // Inject all three connections for User1
    await injectConnectionData(pageUser1, connectionA);
    await injectConnectionData(pageUser1, connectionB);
    await injectConnectionData(pageUser1, connectionC);

    // User1 goes to connection A's wheel page
    await pageUser1.goto(`/wheel/${connectionA.id}`);
    await pageUser1.waitForLoadState("networkidle");

    // Get the share URL from User1
    await pageUser1.getByTestId("share-button").click();
    const shareUrlText = (
      await pageUser1.getByTestId("share-url").innerText()
    ).trim();
    const shareUrl = new URL(shareUrlText);

    console.log("Share URL:", shareUrl.href);

    // User2 connects via the share URL (should only get connection A)
    await pageUser2.goto(shareUrl.href);
    await expect(pageUser2).toHaveURL(new RegExp(`/wheel/${connectionA.id}$`), {
      timeout: 30_000,
    });
    console.log("User2 connected to connection A");

    // Wait for sync to complete
    await pageUser2.waitForTimeout(3000);

    // Now check what connections User2 has in localStorage
    const user2Connections = await pageUser2.evaluate(() => {
      const stored = localStorage.getItem("wte-connections");
      return stored ? JSON.parse(stored) : [];
    });

    console.log(
      "User2 connections:",
      JSON.stringify(user2Connections, null, 2),
    );

    // User2 should only have connection A
    expect(user2Connections.length).toBe(1);
    expect(user2Connections[0].id).toBe(connectionA.id);
    expect(user2Connections[0].settings.connection.name).toBe(
      "Connection A - Shared",
    );

    // User2 should NOT have connections B or C
    const hasConnectionB = user2Connections.some(
      (c: any) => c.id === connectionB.id,
    );
    const hasConnectionC = user2Connections.some(
      (c: any) => c.id === connectionC.id,
    );

    expect(hasConnectionB).toBe(false);
    expect(hasConnectionC).toBe(false);

    // Additionally verify that private eatery names are not visible
    const allEateryNames = user2Connections.flatMap((c: any) =>
      c.settings.eateries.map((e: any) => e.name),
    );
    console.log("User2 eatery names:", allEateryNames);

    expect(allEateryNames).not.toContain("Eatery B1 PRIVATE");
    expect(allEateryNames).not.toContain("Eatery C1 PRIVATE");
    expect(allEateryNames).toContain("Eatery A1");

    // Cleanup
    await contextUser1.close();
    await contextUser2.close();
  });
});
