import { expect, test } from "@playwright/test";
import { selectOrCreateUser, switchCurrentUser } from "./helpers";

test("veto: never pick syncs between peers", async ({ browser }, testInfo) => {
  test.setTimeout(150_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const browserLogs: string[] = [];
  const wireLogs = (label: string, page: Page) => {
    page.on("console", (msg) => {
      const line = `[${label}] ${msg.text()}`;
      browserLogs.push(line);
      console.log(line);
    });
  };

  wireLogs("A", pageA);
  wireLogs("B", pageB);

  // Setup connection on A
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);
  await selectOrCreateUser(pageA, "User A");

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  // Add a user and 2 eateries
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const userName = `Veto Sync User ${Date.now()}`;
  const eateryA = `Sync Alpha ${Date.now()}`;
  const eateryB = `Sync Beta ${Date.now()}`;

  await pageA.getByTestId("add-user-open").click();
  await pageA.getByTestId("add-user-name").fill(userName);
  await pageA.getByTestId("add-user-submit").click();

  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eateryA);
  await pageA.getByTestId("add-eatery-submit").click();

  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eateryB);
  await pageA.getByTestId("add-eatery-submit").click();

  // Connect B via Share URL
  await pageA.goto(`/wheel/${connectionId}`);
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("share-button").click();
  const shareUrlText = (
    await pageA.getByTestId("share-url").innerText()
  ).trim();

  await pageB.goto(shareUrlText);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageB, "User B");

  // Ensure B sees the setup
  await pageB.goto(`/settings/${connectionId}`);
  await pageB.waitForLoadState("networkidle");
  await expect(
    pageB.getByRole("heading", { name: userName }).first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    pageB.getByRole("heading", { name: eateryA }).first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    pageB.getByRole("heading", { name: eateryB }).first(),
  ).toBeVisible({ timeout: 20_000 });

  // On A: select user and veto eateryB
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");
  await switchCurrentUser(pageA, userName);

  const ratingCardA = pageA
    .locator(`[data-eatery-name="${eateryB}"]`)
    .filter({ has: pageA.getByTestId("veto-toggle") });

  await expect(ratingCardA.getByTestId("score-slider")).toHaveCount(1);
  await ratingCardA.getByTestId("veto-toggle").click();
  await expect(ratingCardA.getByTestId("score-slider")).toHaveCount(0);
  await expect(ratingCardA).toContainText("Never pick");

  // On B: the veto should arrive (slider hidden)
  await switchCurrentUser(pageB, userName);
  const ratingCardB = pageB
    .locator(`[data-eatery-name="${eateryB}"]`)
    .filter({ has: pageB.getByTestId("veto-toggle") });

  await expect(ratingCardB).toContainText("Never pick", { timeout: 20_000 });
  await expect(ratingCardB.getByTestId("score-slider")).toHaveCount(0);

  // On B wheel: selecting the user excludes the vetoed eatery and shows badge
  await pageB.getByRole("link", { name: "Back" }).click();
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`));
  await pageB.getByLabel(userName).check();

  await expect(pageB.getByText(/Select at least one user to spin/)).toHaveCount(
    0,
  );
  await expect(pageB.getByText(/1 vetoed/)).toBeVisible({ timeout: 20_000 });

  await expect(pageB.locator("svg title", { hasText: eateryA })).toHaveCount(1);
  await expect(pageB.locator("svg title", { hasText: eateryB })).toHaveCount(0);

  await contextA.close();
  await contextB.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});
