import type { Page } from "@playwright/test";

/**
 * Inject the current user for a connection into localStorage.
 * This should be called before navigating to a connection page to avoid the user selection dialog.
 */
export async function injectCurrentUser(
  page: Page,
  connectionId: string,
  userId: string,
) {
  await page.addInitScript(
    ({ connId, usrId }) => {
      const existing = localStorage.getItem("wte-current-users");
      const data = existing ? JSON.parse(existing) : { userByConnection: {} };
      data.userByConnection[connId] = usrId;
      localStorage.setItem("wte-current-users", JSON.stringify(data));
    },
    { connId: connectionId, usrId: userId },
  );
}

export async function injectConnection(page: Page, connectionId: string) {
  const defaultUserId = "test-user-1";
  await page.addInitScript(
    ({ id, userId }) => {
      const existing = localStorage.getItem("wte-connections");
      const connections = existing ? JSON.parse(existing) : [];
      if (!connections.find((c: any) => c.id === id)) {
        connections.push({
          id: id,
          settings: {
            connection: { name: "Shared Connection", updatedAt: 0 },
            eateries: [],
            users: [
              {
                id: userId,
                name: "Test User",
                email: null,
                updatedAt: Date.now(),
              },
            ],
            eateryScores: [],
            eateryVetoes: [],
          },
        });
        localStorage.setItem("wte-connections", JSON.stringify(connections));
      }
      // Also set this user as the current user
      const currentUsers = localStorage.getItem("wte-current-users");
      const currentData = currentUsers
        ? JSON.parse(currentUsers)
        : { userByConnection: {} };
      currentData.userByConnection[id] = userId;
      localStorage.setItem("wte-current-users", JSON.stringify(currentData));
    },
    { id: connectionId, userId: defaultUserId },
  );
}

export type InjectedConnection = {
  id: string;
  settings: {
    connection: { name: string; updatedAt: number };
    eateries: Array<{
      id: string;
      name: string;
      updatedAt: number;
      _deleted?: boolean;
    }>;
    users: Array<{
      id: string;
      name: string;
      email: string | null;
      updatedAt: number;
      _deleted?: boolean;
    }>;
    eateryScores: Array<{
      userId: string;
      eateryId: string;
      score: number;
      updatedAt: number;
      _deleted?: boolean;
    }>;
    eateryVetoes?: Array<{
      userId: string;
      eateryId: string;
      updatedAt: number;
      _deleted?: boolean;
    }>;
  };
};

/**
 * Inject a fully-specified connection into localStorage before the app loads.
 * This is useful for deterministic tests that don't want to click through the full setup flow.
 * Also sets the first user as the current user if users exist.
 */
export async function injectConnectionData(
  page: Page,
  connection: InjectedConnection,
) {
  await page.addInitScript((conn) => {
    const existing = localStorage.getItem("wte-connections");
    const connections = existing ? JSON.parse(existing) : [];
    const idx = connections.findIndex((c: any) => c.id === conn.id);
    if (idx === -1) {
      connections.push(conn);
    }
    localStorage.setItem("wte-connections", JSON.stringify(connections));

    // Set the first active user as the current user
    const activeUsers = conn.settings.users.filter((u: any) => !u._deleted);
    if (activeUsers.length > 0) {
      const currentUsers = localStorage.getItem("wte-current-users");
      const currentData = currentUsers
        ? JSON.parse(currentUsers)
        : { userByConnection: {} };
      currentData.userByConnection[conn.id] = activeUsers[0].id;
      localStorage.setItem("wte-current-users", JSON.stringify(currentData));
    }
  }, connection);
}

/**
 * Same as injectConnectionData, but will overwrite the stored connection if it already exists.
 * Use sparingly: init scripts run on every navigation.
 * Also sets the first user as the current user if users exist.
 */
export async function injectConnectionDataOverwrite(
  page: Page,
  connection: InjectedConnection,
) {
  await page.addInitScript((conn) => {
    const existing = localStorage.getItem("wte-connections");
    const connections = existing ? JSON.parse(existing) : [];
    const idx = connections.findIndex((c: any) => c.id === conn.id);
    if (idx === -1) {
      connections.push(conn);
    } else {
      connections[idx] = conn;
    }
    localStorage.setItem("wte-connections", JSON.stringify(connections));

    // Set the first active user as the current user
    const activeUsers = conn.settings.users.filter((u: any) => !u._deleted);
    if (activeUsers.length > 0) {
      const currentUsers = localStorage.getItem("wte-current-users");
      const currentData = currentUsers
        ? JSON.parse(currentUsers)
        : { userByConnection: {} };
      currentData.userByConnection[conn.id] = activeUsers[0].id;
      localStorage.setItem("wte-current-users", JSON.stringify(currentData));
    }
  }, connection);
}

/**
 * Select a user from the user selection dialog, or create a new user if needed.
 * If a user name is provided and exists, selects them. Otherwise creates a new user with that name.
 * @param page The Playwright page
 * @param userName The name to select or create (defaults to "Test User")
 */
export async function selectOrCreateUser(page: Page, userName = "Test User") {
  // Check if the dialog is visible
  const dialog = page.getByRole("dialog", { name: "Who are you?" });
  const isVisible = await dialog.isVisible().catch(() => false);

  if (!isVisible) {
    return; // No dialog, user already selected
  }

  // Try to find an existing user button with this name
  const existingUserButton = dialog.getByRole("button", { name: userName });
  const existingUserVisible = await existingUserButton
    .isVisible()
    .catch(() => false);

  if (existingUserVisible) {
    await existingUserButton.click();
    return;
  }

  // Otherwise, create a new user
  await dialog.getByTestId("add-new-user-button").click();
  await dialog.getByTestId("new-user-name-input").fill(userName);
  await dialog.getByTestId("confirm-new-user").click();
}

/**
 * Switch the current user via the header menu (CurrentUserDisplay).
 * If the requested user is already active, it does nothing.
 */
export async function switchCurrentUser(page: Page, userName: string) {
  const menu = page.getByTestId("current-user-menu");

  // If already selected, skip
  const label = await menu.textContent().catch(() => "");
  if (label && label.includes(userName)) return;

  await menu.click();
  const option = page.getByRole("menuitem", { name: userName });
  await option.click();
}
