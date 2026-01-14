import { expect, test } from "@playwright/test";

test.describe("edit", () => {
  test("edit eatery name updates locally", async ({ page }) => {
    // Create a fresh connection
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("start-fresh").click();
    await expect(page).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

    const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(page.url());
    const connectionId = connectionIdMatch![1];

    // Go to settings
    await page.goto(`/settings/${connectionId}`);
    await page.waitForLoadState("networkidle");

    // Add an eatery
    const originalName = `Original Eatery ${Date.now()}`;
    await page.getByTestId("add-eatery-open").click();
    await page.getByTestId("add-eatery-name").fill(originalName);
    await page.getByTestId("add-eatery-submit").click();
    await expect(page.getByTestId("add-eatery-name")).not.toBeVisible();

    // Verify eatery is visible
    await expect(
      page.getByRole("heading", { name: originalName }).first(),
    ).toBeVisible();

    // Click edit button
    await page
      .locator(`[data-eatery-name="${originalName}"]`)
      .getByTestId("edit-eatery")
      .click();

    // Edit the name
    const newName = `Edited Eatery ${Date.now()}`;
    await page.getByTestId("edit-eatery-name").clear();
    await page.getByTestId("edit-eatery-name").fill(newName);
    await page.getByTestId("edit-eatery-submit").click();

    // Verify new name is visible and old name is gone
    await expect(
      page.getByRole("heading", { name: newName }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: originalName }).first(),
    ).not.toBeVisible();
  });

  test("edit user name updates locally", async ({ page }) => {
    // Create a fresh connection
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("start-fresh").click();
    await expect(page).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

    const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(page.url());
    const connectionId = connectionIdMatch![1];

    // Go to settings
    await page.goto(`/settings/${connectionId}`);
    await page.waitForLoadState("networkidle");

    // Add a user
    const originalName = `Original User ${Date.now()}`;
    await page.getByTestId("add-user-open").click();
    await page.getByTestId("add-user-name").fill(originalName);
    await page.getByTestId("add-user-submit").click();
    await expect(page.getByTestId("add-user-name")).not.toBeVisible();

    // Verify user is visible
    await expect(
      page.getByRole("heading", { name: originalName }).first(),
    ).toBeVisible();

    // Click edit button
    await page
      .locator(`[data-user-name="${originalName}"]`)
      .getByTestId("edit-user")
      .click();

    // Edit the name
    const newName = `Edited User ${Date.now()}`;
    await page.getByTestId("edit-user-name").clear();
    await page.getByTestId("edit-user-name").fill(newName);
    await page.getByTestId("edit-user-submit").click();

    // Verify new name is visible and old name is gone
    await expect(
      page.getByRole("heading", { name: newName }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: originalName }).first(),
    ).not.toBeVisible();
  });

  test("edited eatery syncs between peers", async ({ browser }) => {
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

    // A creates connection
    await pageA.goto("/");
    await pageA.waitForLoadState("networkidle");
    await pageA.getByTestId("start-fresh").click();
    await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

    const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
    const connectionId = connectionIdMatch![1];

    // Add an eatery
    await pageA.goto(`/settings/${connectionId}`);
    await pageA.waitForLoadState("networkidle");

    const originalName = `Original Eatery ${Date.now()}`;
    await pageA.getByTestId("add-eatery-open").click();
    await pageA.getByTestId("add-eatery-name").fill(originalName);
    await pageA.getByTestId("add-eatery-submit").click();
    await expect(pageA.getByTestId("add-eatery-name")).not.toBeVisible();

    // B connects to A
    await pageA.goto(`/wheel/${connectionId}`);
    await pageA.getByTestId("share-button").click();
    const shareUrlText = (
      await pageA.getByTestId("share-url").innerText()
    ).trim();

    await pageB.goto(shareUrlText);
    await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
      timeout: 60_000,
    });

    // Navigate B to settings and verify eatery is visible
    await pageB.goto(`/settings/${connectionId}`);
    await expect(
      pageB.getByRole("heading", { name: originalName }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // A edits the eatery
    await pageA.goto(`/settings/${connectionId}`);
    await pageA.waitForLoadState("networkidle");
    
    await pageA
      .locator(`[data-eatery-name="${originalName}"]`)
      .getByTestId("edit-eatery")
      .click();

    const newName = `Edited Eatery ${Date.now()}`;
    await pageA.getByTestId("edit-eatery-name").clear();
    await pageA.getByTestId("edit-eatery-name").fill(newName);
    await pageA.getByTestId("edit-eatery-submit").click();

    // Verify A sees the new name
    await expect(
      pageA.getByRole("heading", { name: newName }).first(),
    ).toBeVisible();

    // Verify B receives the update
    await expect(
      pageB.getByRole("heading", { name: newName }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      pageB.getByRole("heading", { name: originalName }).first(),
    ).not.toBeVisible();

    await contextA.close();
    await contextB.close();
  });

  test("edited user syncs between peers", async ({ browser }) => {
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

    // A creates connection
    await pageA.goto("/");
    await pageA.waitForLoadState("networkidle");
    await pageA.getByTestId("start-fresh").click();
    await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

    const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
    const connectionId = connectionIdMatch![1];

    // Add a user
    await pageA.goto(`/settings/${connectionId}`);
    await pageA.waitForLoadState("networkidle");

    const originalName = `Original User ${Date.now()}`;
    await pageA.getByTestId("add-user-open").click();
    await pageA.getByTestId("add-user-name").fill(originalName);
    await pageA.getByTestId("add-user-submit").click();
    await expect(pageA.getByTestId("add-user-name")).not.toBeVisible();

    // B connects to A
    await pageA.goto(`/wheel/${connectionId}`);
    await pageA.getByTestId("share-button").click();
    const shareUrlText = (
      await pageA.getByTestId("share-url").innerText()
    ).trim();

    await pageB.goto(shareUrlText);
    await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
      timeout: 60_000,
    });

    // Navigate B to settings and verify user is visible
    await pageB.goto(`/settings/${connectionId}`);
    await expect(
      pageB.getByRole("heading", { name: originalName }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // A edits the user
    await pageA.goto(`/settings/${connectionId}`);
    await pageA.waitForLoadState("networkidle");
    
    await pageA
      .locator(`[data-user-name="${originalName}"]`)
      .getByTestId("edit-user")
      .click();

    const newName = `Edited User ${Date.now()}`;
    await pageA.getByTestId("edit-user-name").clear();
    await pageA.getByTestId("edit-user-name").fill(newName);
    await pageA.getByTestId("edit-user-submit").click();

    // Verify A sees the new name
    await expect(
      pageA.getByRole("heading", { name: newName }).first(),
    ).toBeVisible();

    // Verify B receives the update
    await expect(
      pageB.getByRole("heading", { name: newName }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      pageB.getByRole("heading", { name: originalName }).first(),
    ).not.toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});
