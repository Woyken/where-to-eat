import { expect, test } from "@playwright/test";
import { selectOrCreateUser } from "./helpers";

test("can name a new connection and rename it", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  await page.getByLabel("Session name").fill("My Test Connection");
  await page.getByTestId("start-fresh").click();

  await expect(page).toHaveURL(/\/wheel\//);

  // Handle user selection dialog
  await selectOrCreateUser(page, "Test User");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings\//);

  await page.getByTestId("connection-name-input").fill("Renamed Connection");
  await page.getByTestId("connection-name-save").click();

  await page.getByTestId("home-button").click();

  await expect(page.getByText("Renamed Connection")).toBeVisible();
});

test("connection name syncs to another peer", async ({ browser }) => {
  test.setTimeout(120_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const originalName = `Original ${Date.now()}`;
  const renamed = `Renamed ${Date.now()}`;

  await pageA.goto("/");
  // Wait for page to fully hydrate before interacting
  await pageA.waitForLoadState("networkidle");

  // Fill session name and verify it was captured
  const nameInput = pageA.getByLabel("Session name");
  await nameInput.click();
  await nameInput.fill(originalName);
  await expect(nameInput).toHaveValue(originalName);

  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  // Handle user selection dialog for A
  await selectOrCreateUser(pageA, "User A");

  // Share URL contains the connectionId and points B to /connect-to
  await pageA.getByTestId("share-button").click();
  const shareUrlText = (
    await pageA.getByTestId("share-url").innerText()
  ).trim();
  const shareUrl = new URL(shareUrlText);
  const connectionId = shareUrl.searchParams.get("connectionId");
  expect(connectionId).toBeTruthy();

  await pageB.goto(shareUrl.href);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  // Handle user selection dialog for B
  await selectOrCreateUser(pageB, "User B");

  // Ensure peers are actually connected (non-zero peer count)
  await expect(pageA.getByTestId("peer-count-value")).not.toHaveText("0", {
    timeout: 30_000,
  });
  await expect(pageB.getByTestId("peer-count-value")).not.toHaveText("0", {
    timeout: 30_000,
  });

  // Navigate B to settings
  await pageB.goto(`/settings/${connectionId}`);
  await pageB.waitForLoadState("networkidle");

  // B should show the initial connection name
  await expect(pageB.getByTestId("connection-name-input")).toHaveValue(
    originalName,
    { timeout: 30_000 },
  );

  // Now navigate A to settings
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  // Rename in A
  await pageA.getByTestId("connection-name-input").fill(renamed);
  await pageA.getByTestId("connection-name-save").click();

  // B should update without reload
  await expect(pageB.getByTestId("connection-name-input")).toHaveValue(
    renamed,
    { timeout: 30_000 },
  );

  // Verify the name is reflected in B's home connection list too
  await pageB.goto("/");
  await expect(pageB.getByText(renamed)).toBeVisible({ timeout: 30_000 });

  await contextA.close();
  await contextB.close();
});
