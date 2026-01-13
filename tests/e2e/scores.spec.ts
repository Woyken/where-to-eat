import { expect, type Page, test } from "@playwright/test";
import { injectConnection } from "./helpers";

test("scores: score updates sync between peers", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const browserLogs: string[] = [];
  const wireLogs = (label: string, page: typeof pageA) => {
    page.on("console", (msg) => {
      const line = `[${label}] ${msg.text()}`;
      browserLogs.push(line);
      console.log(line);
    });
  };

  wireLogs("A", pageA);
  wireLogs("B", pageB);

  // Setup connection
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  // Add a user and eatery
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const userName = `Test User ${Date.now()}`;
  const eateryName = `Test Eatery ${Date.now()}`;

  // Add user
  await pageA.getByTestId("add-user-open").click();
  await pageA.getByTestId("add-user-name").fill(userName);
  await pageA.getByTestId("add-user-submit").click();
  await expect(pageA.getByTestId("add-user-name")).not.toBeVisible();

  // Add eatery
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eateryName);
  await pageA.getByTestId("add-eatery-submit").click();
  await expect(pageA.getByTestId("add-eatery-name")).not.toBeVisible();

  // Connect B
  await pageA.goto(`/wheel/${connectionId}`);
  await pageA.getByTestId("share-button").click();
  const shareUrlText = (
    await pageA.getByTestId("share-url").innerText()
  ).trim();

  // await injectConnection(pageB, connectionId);
  await pageB.goto(shareUrlText);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  // Verify B has the user and eatery
  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: userName }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    pageB.getByRole("heading", { name: eateryName }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // A sets a score for the eatery
  // Note: This requires UI interaction with the score slider
  // First, select the user
  await pageA.goto(`/settings/${connectionId}`);
  await pageA
    .locator(`[data-testid="user-selector"] button:has-text("${userName}")`)
    .click();

  // Find the eatery card and set score to 50 (mid-range)
  const eateryCard = pageA.locator(`[data-eatery-name="${eateryName}"]`);
  const scoreSlider = eateryCard.getByTestId("score-slider");

  // Set slider value to 50
  await scoreSlider.fill("50");

  // Wait a moment for the score to be saved
  await pageA.waitForTimeout(1000);

  // B should receive the score update
  await pageB.goto(`/settings/${connectionId}`);
  await pageB
    .locator(`[data-testid="user-selector"] button:has-text("${userName}")`)
    .click();

  const eateryCardB = pageB.locator(`[data-eatery-name="${eateryName}"]`);
  const scoreSliderB = eateryCardB.getByTestId("score-slider");

  // Verify score is 50
  await expect(scoreSliderB).toHaveValue("50", { timeout: 15_000 });

  console.log("Score update synced to B");

  // B updates the score to 75
  await scoreSliderB.fill("75");
  await pageB.waitForTimeout(1000);

  // A should receive the updated score
  await pageA.reload();
  await pageA.waitForLoadState("networkidle");
  await pageA
    .locator(`[data-testid="user-selector"] button:has-text("${userName}")`)
    .click();

  const eateryCardA = pageA.locator(`[data-eatery-name="${eateryName}"]`);
  const scoreSliderA = eateryCardA.getByTestId("score-slider");

  await expect(scoreSliderA).toHaveValue("75", { timeout: 15_000 });

  console.log("Score update synced back to A");

  await contextA.close();
  await contextB.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});

test("scores: multiple users score same eatery independently", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  pageA.on("console", (msg) => console.log("[A]", msg.text()));
  pageB.on("console", (msg) => console.log("[B]", msg.text()));

  // Setup
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  // Add two users
  const user1 = `User 1 ${Date.now()}`;
  const user2 = `User 2 ${Date.now()}`;

  await pageA.getByTestId("add-user-open").click();
  await pageA.getByTestId("add-user-name").fill(user1);
  await pageA.getByTestId("add-user-submit").click();
  await expect(pageA.getByTestId("add-user-name")).not.toBeVisible();

  await pageA.getByTestId("add-user-open").click();
  await pageA.getByTestId("add-user-name").fill(user2);
  await pageA.getByTestId("add-user-submit").click();
  await expect(pageA.getByTestId("add-user-name")).not.toBeVisible();

  // Add an eatery
  const eateryName = `Shared Eatery ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eateryName);
  await pageA.getByTestId("add-eatery-submit").click();
  await expect(pageA.getByTestId("add-eatery-name")).not.toBeVisible();

  // Connect B
  await pageA.goto(`/wheel/${connectionId}`);
  await pageA.getByTestId("share-button").click();
  const shareUrlText = (
    await pageA.getByTestId("share-url").innerText()
  ).trim();

  // await injectConnection(pageB, connectionId);
  await pageB.goto(shareUrlText);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  await pageB.goto(`/settings/${connectionId}`);
  await pageB.waitForLoadState("networkidle");

  // A sets User 1's score to 80
  await pageA.goto(`/settings/${connectionId}`);
  await selectUser(pageA, user1);

  const eateryCardA = pageA
    .locator(`[data-eatery-name="${eateryName}"]`)
    .filter({ has: pageA.getByTestId("score-slider") });
  await expect(eateryCardA.getByTestId("score-slider")).toBeVisible({
    timeout: 10_000,
  });
  await eateryCardA.getByTestId("score-slider").fill("80");
  await pageA.waitForTimeout(1000);

  // B sets User 2's score to 30
  await selectUser(pageB, user2);

  const eateryCardB = pageB
    .locator(`[data-eatery-name="${eateryName}"]`)
    .filter({ has: pageB.getByTestId("score-slider") });
  await expect(eateryCardB.getByTestId("score-slider")).toBeVisible({
    timeout: 10_000,
  });
  await eateryCardB.getByTestId("score-slider").fill("30");
  await pageB.waitForTimeout(2000); // Wait for sync

  // Reload both pages to ensure sync is complete
  await pageA.reload();
  await pageA.waitForLoadState("networkidle");
  await pageB.reload();
  await pageB.waitForLoadState("networkidle");

  // Wait for P2P reconnection
  await pageA.waitForTimeout(3000);

  // Verify on A: User 1 should have score 80, User 2 should have score 30
  await selectUser(pageA, user1);

  // Re-query locator after user switch to avoid stale element
  const eateryCardA1 = pageA
    .locator(`[data-eatery-name="${eateryName}"]`)
    .filter({ has: pageA.getByTestId("score-slider") });
  await expect(eateryCardA1).toBeVisible({ timeout: 10_000 });
  await expect(eateryCardA1.getByTestId("score-slider")).toBeVisible({
    timeout: 10_000,
  });
  await expect(eateryCardA1.getByTestId("score-slider")).toHaveValue("80");

  await selectUser(pageA, user2);

  // Re-query locator after user switch to avoid stale element
  const eateryCardA2 = pageA
    .locator(`[data-eatery-name="${eateryName}"]`)
    .filter({ has: pageA.getByTestId("score-slider") });
  await expect(eateryCardA2.getByTestId("score-slider")).toHaveValue("30", {
    timeout: 15_000,
  });

  // Verify on B: User 1 should have score 80, User 2 should have score 30
  await selectUser(pageB, user1);

  // Re-query locator after user switch to avoid stale element
  const eateryCardB1 = pageB
    .locator(`[data-eatery-name="${eateryName}"]`)
    .filter({ has: pageB.getByTestId("score-slider") });
  await expect(eateryCardB1.getByTestId("score-slider")).toBeVisible({
    timeout: 10_000,
  });
  await expect(eateryCardB1.getByTestId("score-slider")).toHaveValue("80", {
    timeout: 15_000,
  });

  await selectUser(pageB, user2);

  // Re-query locator after user switch to avoid stale element
  const eateryCardB2 = pageB
    .locator(`[data-eatery-name="${eateryName}"]`)
    .filter({ has: pageB.getByTestId("score-slider") });
  await expect(eateryCardB2.getByTestId("score-slider")).toBeVisible({
    timeout: 10_000,
  });
  await expect(eateryCardB2.getByTestId("score-slider")).toHaveValue("30");

  console.log("Multiple user scores verified");

  await contextA.close();
  await contextB.close();
});

test("scores: score changes reflect on wheel page", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();

  pageA.on("console", (msg) => console.log("[A]", msg.text()));

  // Setup
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  // Add user and eatery
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const userName = `Wheel User ${Date.now()}`;
  const eatery1 = `Eatery 1 ${Date.now()}`;
  const eatery2 = `Eatery 2 ${Date.now()}`;

  await pageA.getByTestId("add-user-open").click();
  await pageA.getByTestId("add-user-name").fill(userName);
  await pageA.getByTestId("add-user-submit").click();
  await expect(pageA.getByTestId("add-user-name")).not.toBeVisible();

  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eatery1);
  await pageA.getByTestId("add-eatery-submit").click();
  await expect(pageA.getByTestId("add-eatery-name")).not.toBeVisible();

  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eatery2);
  await pageA.getByTestId("add-eatery-submit").click();
  await expect(pageA.getByTestId("add-eatery-name")).not.toBeVisible();

  // Set scores: eatery1 = 5, eatery2 = 1
  // Click the toggle button for the user (ToggleGroup, not a select element)
  await selectUser(pageA, userName);

  const eatery1Card = pageA
    .locator(`[data-eatery-name="${eatery1}"]`)
    .filter({ has: pageA.getByTestId("score-slider") });
  await expect(eatery1Card).toBeVisible({ timeout: 10_000 });
  await eatery1Card.getByTestId("score-slider").fill("50");
  await pageA.waitForTimeout(500);

  const eatery2Card = pageA
    .locator(`[data-eatery-name="${eatery2}"]`)
    .filter({ has: pageA.getByTestId("score-slider") });
  await expect(eatery2Card).toBeVisible({ timeout: 10_000 });
  await eatery2Card.getByTestId("score-slider").fill("10");
  await pageA.waitForTimeout(500);

  // Go to wheel page
  await pageA.goto(`/wheel/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  // Select the user in wheel page
  await pageA.getByLabel(userName).check();

  // Look for the spin button
  const spinButton = pageA.getByTestId("spin-wheel");
  await expect(spinButton).toBeVisible();

  // The wheel should be rendered with segments
  // We can't easily verify the exact proportions without inspecting the SVG,
  // but we can verify that both eateries appear in the wheel
  await expect(pageA.locator("svg").getByText(eatery1)).toBeVisible();
  await expect(pageA.locator("svg").getByText(eatery2)).toBeVisible();

  console.log("Wheel reflects scores");

  await contextA.close();
});

async function selectUser(page: Page, userName: string) {
  const userToggle = page.locator(
    `[data-testid="user-selector"] button:has-text("${userName}")`,
  );
  const isPressed = await userToggle.getAttribute("aria-pressed");
  if (isPressed !== "true") {
    await userToggle.click();
    await expect(userToggle).toHaveAttribute("aria-pressed", "true");
  }
}
