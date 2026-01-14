import { expect, test } from "@playwright/test";
import {
  injectConnectionData,
  selectOrCreateUser,
  switchCurrentUser,
} from "./helpers";

test("veto: never pick hides rating and excludes from wheel", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const connectionId = "00000000-0000-4000-8000-000000000001";
  const userId = "00000000-0000-4000-8000-000000000010";
  const eateryAId = "00000000-0000-4000-8000-000000000020";
  const eateryBId = "00000000-0000-4000-8000-000000000021";

  await injectConnectionData(page, {
    id: connectionId,
    settings: {
      connection: { name: "Veto Test", updatedAt: 0 },
      eateries: [
        { id: eateryAId, name: "Alpha Pizza", updatedAt: 0 },
        { id: eateryBId, name: "Beta Sushi", updatedAt: 0 },
      ],
      users: [{ id: userId, name: "Alice", email: null, updatedAt: 0 }],
      eateryScores: [
        { userId, eateryId: eateryAId, score: 50, updatedAt: 0 },
        { userId, eateryId: eateryBId, score: 50, updatedAt: 0 },
      ],
      eateryVetoes: [],
    },
  });

  // 1) In settings: toggling veto hides the score slider UI for that eatery
  await page.goto(`/settings/${connectionId}`);
  await page.waitForLoadState("networkidle");

  const betaRatingCard = page.locator('div[data-eatery-name="Beta Sushi"]', {
    has: page.getByTestId("veto-toggle"),
  });
  await expect(betaRatingCard).toBeVisible();

  // Ensure slider initially present
  await expect(betaRatingCard.getByTestId("score-slider")).toHaveCount(1);

  await betaRatingCard.getByTestId("veto-toggle").click();

  // Slider should be removed from the DOM for vetoed eateries
  await expect(betaRatingCard.getByTestId("score-slider")).toHaveCount(0);
  await expect(betaRatingCard).toContainText("Never pick");

  // Verify veto persisted
  const raw = await page.evaluate(() =>
    localStorage.getItem("wte-connections"),
  );
  const parsed = raw ? (JSON.parse(raw) as any[]) : [];
  const conn = parsed.find((c) => c.id === connectionId);
  expect(conn).toBeTruthy();
  expect(conn.settings.eateryVetoes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ userId, eateryId: eateryBId, _deleted: false }),
    ]),
  );

  // 2) In wheel: vetoed eatery is excluded; badge shows veto count when user selected
  await page.goto(`/wheel/${connectionId}`);
  await page.waitForLoadState("networkidle");
  await selectOrCreateUser(page, "Alice");

  await page.getByLabel("Alice").check();

  // Ensure the app registered the selection
  await expect(page.getByText("Select at least one person")).toHaveCount(0);

  // The sidebar shows "On the Wheel" card with vetoed badge
  await expect(page.getByText("On the Wheel")).toBeVisible();
  await expect(page.getByText(/1 vetoed/)).toBeVisible();

  // Wheel segments use <title> with the full eatery name
  await expect(
    page.locator("svg title", { hasText: "Alpha Pizza" }),
  ).toHaveCount(1);
  await expect(
    page.locator("svg title", { hasText: "Beta Sushi" }),
  ).toHaveCount(0);

  // 3) With only one eligible segment, the wheel should render a full circle
  // (segment circle has r=95; center circles are smaller)
  await expect(page.locator("svg circle[r='95']")).toHaveCount(1);
});

test("veto: un-veto restores slider and wheel eligibility", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const connectionId = "00000000-0000-4000-8000-000000000002";
  const userId = "00000000-0000-4000-8000-000000000030";
  const eateryAId = "00000000-0000-4000-8000-000000000040";
  const eateryBId = "00000000-0000-4000-8000-000000000041";

  await injectConnectionData(page, {
    id: connectionId,
    settings: {
      connection: { name: "Un-Veto Test", updatedAt: 0 },
      eateries: [
        { id: eateryAId, name: "Gamma Tacos", updatedAt: 0 },
        { id: eateryBId, name: "Delta Ramen", updatedAt: 0 },
      ],
      users: [{ id: userId, name: "Bob", email: null, updatedAt: 0 }],
      eateryScores: [
        { userId, eateryId: eateryAId, score: 50, updatedAt: 0 },
        { userId, eateryId: eateryBId, score: 50, updatedAt: 0 },
      ],
      // Start with Delta Ramen already vetoed
      eateryVetoes: [
        { userId, eateryId: eateryBId, updatedAt: 1, _deleted: false },
      ],
    },
  });

  // Go to settings and verify veto is active
  await page.goto(`/settings/${connectionId}`);
  await page.waitForLoadState("networkidle");

  const deltaCard = page.locator('div[data-eatery-name="Delta Ramen"]', {
    has: page.getByTestId("veto-toggle"),
  });
  await expect(deltaCard).toBeVisible();
  await expect(deltaCard.getByTestId("score-slider")).toHaveCount(0);
  await expect(deltaCard).toContainText("Never pick");

  // Un-veto by clicking the toggle again
  await deltaCard.getByTestId("veto-toggle").click();

  // Slider should reappear
  await expect(deltaCard.getByTestId("score-slider")).toHaveCount(1);
  await expect(deltaCard).not.toContainText("Never pick");

  // On wheel: both eateries should now appear, no vetoed badge
  await page.goto(`/wheel/${connectionId}`);
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Bob").check();

  await expect(page.getByText(/Select at least one user to spin/)).toHaveCount(
    0,
  );

  // Badge should not appear (0 vetoed)
  await expect(page.getByText(/vetoed/)).toHaveCount(0);

  // Both eateries should be in the wheel
  await expect(
    page.locator("svg title", { hasText: "Gamma Tacos" }),
  ).toHaveCount(1);
  await expect(
    page.locator("svg title", { hasText: "Delta Ramen" }),
  ).toHaveCount(1);
});

test("veto: any selected user's veto excludes eatery (multi-user)", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const connectionId = "00000000-0000-4000-8000-000000000003";
  const userAId = "00000000-0000-4000-8000-000000000050";
  const userBId = "00000000-0000-4000-8000-000000000051";
  const eateryXId = "00000000-0000-4000-8000-000000000060";
  const eateryYId = "00000000-0000-4000-8000-000000000061";

  await injectConnectionData(page, {
    id: connectionId,
    settings: {
      connection: { name: "Multi-User Veto Test", updatedAt: 0 },
      eateries: [
        { id: eateryXId, name: "Epsilon Burgers", updatedAt: 0 },
        { id: eateryYId, name: "Zeta Curry", updatedAt: 0 },
      ],
      users: [
        { id: userAId, name: "Carol", email: null, updatedAt: 0 },
        { id: userBId, name: "Dave", email: null, updatedAt: 0 },
      ],
      eateryScores: [
        { userId: userAId, eateryId: eateryXId, score: 50, updatedAt: 0 },
        { userId: userAId, eateryId: eateryYId, score: 50, updatedAt: 0 },
        { userId: userBId, eateryId: eateryXId, score: 50, updatedAt: 0 },
        { userId: userBId, eateryId: eateryYId, score: 50, updatedAt: 0 },
      ],
      // Only Carol vetoes Zeta Curry; Dave does not
      eateryVetoes: [
        { userId: userAId, eateryId: eateryYId, updatedAt: 1, _deleted: false },
      ],
    },
  });

  await page.goto(`/wheel/${connectionId}`);
  await page.waitForLoadState("networkidle");
  await selectOrCreateUser(page, "Carol");

  // Select both users
  await page.getByLabel("Carol").check();
  await page.getByLabel("Dave").check();

  await expect(page.getByText(/Select at least one user to spin/)).toHaveCount(
    0,
  );

  // Even though only Carol vetoed Zeta Curry, it should be excluded
  await expect(page.getByText(/1 vetoed/)).toBeVisible();

  await expect(
    page.locator("svg title", { hasText: "Epsilon Burgers" }),
  ).toHaveCount(1);
  await expect(
    page.locator("svg title", { hasText: "Zeta Curry" }),
  ).toHaveCount(0);

  // Switch identity to Dave so we can deselect Carol without the current-user guard
  await switchCurrentUser(page, "Dave");
  await page.getByLabel("Carol").check({ force: true });
  await page.getByLabel("Dave").check({ force: true });

  // If we deselect Carol (leaving only Dave), the eatery should reappear
  const carolCheckbox = page.getByLabel("Carol");
  await expect(carolCheckbox).toBeVisible();
  // Some runs need a couple attempts before the checkbox state updates
  for (let i = 0; i < 3; i += 1) {
    await carolCheckbox.click({ force: true });
    await page.waitForTimeout(50);
    if (!(await carolCheckbox.isChecked())) break;
  }
  await expect(carolCheckbox).not.toBeChecked();

  await expect(page.getByText(/vetoed/)).toHaveCount(0);

  await expect(
    page.locator("svg title", { hasText: "Epsilon Burgers" }),
  ).toHaveCount(1);
  await expect(
    page.locator("svg title", { hasText: "Zeta Curry" }),
  ).toHaveCount(1);
});

test("veto: all eateries vetoed shows empty wheel message", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const connectionId = "00000000-0000-4000-8000-000000000004";
  const userId = "00000000-0000-4000-8000-000000000070";
  const eateryId = "00000000-0000-4000-8000-000000000080";

  await injectConnectionData(page, {
    id: connectionId,
    settings: {
      connection: { name: "All Vetoed Test", updatedAt: 0 },
      eateries: [{ id: eateryId, name: "Eta BBQ", updatedAt: 0 }],
      users: [{ id: userId, name: "Eve", email: null, updatedAt: 0 }],
      eateryScores: [{ userId, eateryId, score: 50, updatedAt: 0 }],
      // The only eatery is vetoed
      eateryVetoes: [{ userId, eateryId, updatedAt: 1, _deleted: false }],
    },
  });

  await page.goto(`/wheel/${connectionId}`);
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Eve").check();

  // All eateries vetoed badge
  await expect(page.getByText(/1 vetoed/)).toBeVisible();

  // No wheel segments should exist (no svg title for eatery)
  await expect(page.locator("svg title", { hasText: "Eta BBQ" })).toHaveCount(
    0,
  );

  // Spin button should be disabled when there are no eligible eateries
  const spinButton = page.getByTestId("spin-wheel");
  await expect(spinButton).toBeDisabled();
});
