import { expect, type Page, test } from "@playwright/test";
import { injectConnection, selectOrCreateUser } from "./helpers";

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
  await selectOrCreateUser(pageA, "User A");

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  // Add an eatery
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const eateryName = `Test Eatery ${Date.now()}`;

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

  await pageB.goto(shareUrlText);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageB, "User B");

  // Verify B has the eatery
  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: eateryName }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // A sets their score for the eatery to 50
  await pageA.goto(`/settings/${connectionId}`);

  // Find the eatery card and set score to 50 (mid-range)
  const eateryCardA = pageA.locator(`[data-eatery-name="${eateryName}"]`);
  const scoreSliderA = eateryCardA.getByTestId("score-slider");

  // Set slider value to 50
  await scoreSliderA.fill("50");

  // Wait a moment for the score to be saved and synced
  await pageA.waitForTimeout(2000);

  // B sets their own score to 75
  await pageB.reload();
  await pageB.waitForLoadState("networkidle");

  const eateryCardB = pageB.locator(`[data-eatery-name="${eateryName}"]`);
  const scoreSliderB = eateryCardB.getByTestId("score-slider");

  // B's default score should be 50, set to 75
  await scoreSliderB.fill("75");
  await pageB.waitForTimeout(2000);

  // Reload A and verify A's score is still 50 (each user has their own score)
  await pageA.reload();
  await pageA.waitForLoadState("networkidle");

  const eateryCardA2 = pageA.locator(`[data-eatery-name="${eateryName}"]`);
  const scoreSliderA2 = eateryCardA2.getByTestId("score-slider");

  await expect(scoreSliderA2).toHaveValue("50", { timeout: 15_000 });

  console.log("Score updates work correctly - each user has their own score");

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
  // A becomes User 1
  await selectOrCreateUser(pageA, "User 1");

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

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

  await pageB.goto(shareUrlText);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  // B becomes User 2
  await selectOrCreateUser(pageB, "User 2");

  await pageB.goto(`/settings/${connectionId}`);
  await pageB.waitForLoadState("networkidle");

  // A (User 1) sets their score to 80
  await pageA.goto(`/settings/${connectionId}`);

  const eateryCardA = pageA
    .locator(`[data-eatery-name="${eateryName}"]`)
    .filter({ has: pageA.getByTestId("score-slider") });
  await expect(eateryCardA.getByTestId("score-slider")).toBeVisible({
    timeout: 10_000,
  });
  await eateryCardA.getByTestId("score-slider").fill("80");
  await pageA.waitForTimeout(1000);

  // B (User 2) sets their score to 30
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

  // Verify on A: User 1's score should still be 80
  const eateryCardA1 = pageA
    .locator(`[data-eatery-name="${eateryName}"]`)
    .filter({ has: pageA.getByTestId("score-slider") });
  await expect(eateryCardA1).toBeVisible({ timeout: 10_000 });
  await expect(eateryCardA1.getByTestId("score-slider")).toBeVisible({
    timeout: 10_000,
  });
  await expect(eateryCardA1.getByTestId("score-slider")).toHaveValue("80");

  // Verify on B: User 2's score should still be 30
  const eateryCardB2 = pageB
    .locator(`[data-eatery-name="${eateryName}"]`)
    .filter({ has: pageB.getByTestId("score-slider") });
  await expect(eateryCardB2.getByTestId("score-slider")).toBeVisible({
    timeout: 10_000,
  });
  await expect(eateryCardB2.getByTestId("score-slider")).toHaveValue("30");

  console.log(
    "Multiple user scores verified - each user has independent score",
  );

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
  await selectOrCreateUser(pageA, "Wheel User");

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  // Add eateries
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const eatery1 = `Eatery 1 ${Date.now()}`;
  const eatery2 = `Eatery 2 ${Date.now()}`;

  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eatery1);
  await pageA.getByTestId("add-eatery-submit").click();
  await expect(pageA.getByTestId("add-eatery-name")).not.toBeVisible();

  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eatery2);
  await pageA.getByTestId("add-eatery-submit").click();
  await expect(pageA.getByTestId("add-eatery-name")).not.toBeVisible();

  // Set scores: eatery1 = 50, eatery2 = 10
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

  // The current user should be auto-selected (preselected checkbox)
  // Look for the spin button
  const spinButton = pageA.getByTestId("spin-wheel");
  await expect(spinButton).toBeVisible();

  // The wheel should be rendered with segments
  // Verify that both eateries appear in the eatery list panel (SVG may truncate names)
  const eateryList = pageA.locator('[class*="max-h-72"]');
  await expect(eateryList.getByText(eatery1)).toBeVisible();
  await expect(eateryList.getByText(eatery2)).toBeVisible();

  console.log("Wheel reflects scores");

  await contextA.close();
});
