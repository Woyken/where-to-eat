import { expect, test } from "@playwright/test";
import { selectOrCreateUser } from "./helpers";

test("multi-tab sync: changes propagate to all tabs in the same browser context", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000); // Increase timeout

  // 1. Create two isolated browser contexts (like two different computers/profiles)
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB1 = await contextB.newPage();

  pageA.on("console", (msg) => console.log("A:", msg.text()));
  pageA.on("pageerror", (err) => console.log("A Error:", err));
  pageB1.on("console", (msg) => console.log("B1:", msg.text()));
  pageB1.on("pageerror", (err) => console.log("B1 Error:", err));

  // 2. Setup A: Create a connection
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  const startBtn = pageA.getByTestId("start-fresh");
  await expect(startBtn).toBeVisible({ timeout: 10000 });
  await startBtn.click();
  // Wait for the connection ID to appear in the URL
  await expect(pageA).toHaveURL(/\/wheel\/[a-f0-9-]+/, { timeout: 15_000 });
  await selectOrCreateUser(pageA, "User A");

  // Get connection info via Share Dialog
  await pageA.getByTestId("share-button").click();
  const shareUrl = await pageA.getByTestId("share-url").innerText();
  console.log(`Share URL: ${shareUrl}`);

  const shareUrlObj = new URL(shareUrl);
  const connectionId = shareUrlObj.searchParams.get("connectionId")!;

  // 3. Setup B: Connect to the session
  // Use the full share URL which includes connectionId and peerId
  await pageB1.goto(shareUrl);

  // Expect redirection to wheel
  await expect(pageB1).toHaveURL(/\/wheel\/[a-f0-9-]+/);
  await selectOrCreateUser(pageB1, "User B");

  // 4. Open multiple tabs in context B
  const pageB2 = await contextB.newPage();
  const pageB3 = await contextB.newPage();

  // 5. Navigate B2 and B3 to the settings page
  await pageB2.goto(`/settings/${connectionId}`);
  await pageB3.goto(`/settings/${connectionId}`);

  // Navigate B1 to settings too for consistency
  await pageB1.goto(`/settings/${connectionId}`);

  // Ensure all tabs are ready
  // Note: Heading might be differnt on settings page VS wheel page.
  // Settings page heading: 'Users', 'Restaurants' etc.
  // Wheel page heading: 'Spin Wheel'
  // Let's check for 'Restaurants' section
  await expect(pageB1.getByText(/Restaurants \(/)).toBeVisible();
  await expect(pageB2.getByText(/Restaurants \(/)).toBeVisible();
  await expect(pageB3.getByText(/Restaurants \(/)).toBeVisible();

  // 6. Wait for P2P connection to be established first (on B1 side since B is the joiner)
  // B1 needs to wait for connection to A before we proceed
  console.log("B1: Waiting for P2P connection to A...");
  await expect(pageB1.getByTestId("peer-count-value")).toHaveText("1", {
    timeout: 30_000,
  });
  console.log("B1: Connected to 1 peer");

  // Navigate A to settings to add eatery easily
  await pageA.goto(`/settings/${connectionId}`);

  // Wait for A to reconnect to B after navigation
  console.log("A: Waiting for P2P connection after navigation...");
  await expect(pageA.getByTestId("peer-count-value")).toHaveText("1", {
    timeout: 30_000,
  });
  console.log("A: Reconnected to 1 peer");

  const timestamp = Date.now();
  const newEateryName = `TabSync Eatery ${timestamp}`;

  // Open the Add Eatery dialog
  console.log("A: Opening Add Eatery Dialog");
  await pageA.getByTestId("add-eatery-open").click();

  // Wait for dialog content
  await expect(
    pageA.getByRole("heading", { name: "Add Restaurant" }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(pageA.getByTestId("add-eatery-name")).toBeVisible({
    timeout: 15_000,
  });

  // Fill the name
  console.log("A: Filling Eatery Name");
  await pageA.getByTestId("add-eatery-name").fill(newEateryName);
  // Click Add
  await pageA.getByTestId("add-eatery-submit").click();
  // Wait for dialog to close
  await expect(pageA.getByTestId("add-eatery-name")).not.toBeVisible();

  // Verify A sees it
  console.log("A: Verifying Eatery Added in A");
  await expect(
    pageA.getByRole("heading", { name: newEateryName }).first(),
  ).toBeVisible();

  // B tabs should receive the update via P2P (A is connected)
  console.log("Verifying in B1 (Original Tab)...");
  await expect(
    pageB1.getByRole("heading", { name: newEateryName }).first(),
  ).toBeVisible({ timeout: 15_000 });

  console.log("Verifying in B2 (2nd Tab)...");
  await expect(
    pageB2.getByRole("heading", { name: newEateryName }).first(),
  ).toBeVisible({ timeout: 15_000 });

  console.log("Verifying in B3 (3rd Tab)...");
  await expect(
    pageB3.getByRole("heading", { name: newEateryName }).first(),
  ).toBeVisible({ timeout: 15_000 });
});
