import type { Page } from "@playwright/test";

export async function injectConnection(page: Page, connectionId: string) {
  await page.addInitScript((id) => {
    const existing = localStorage.getItem("wte-connections");
    const connections = existing ? JSON.parse(existing) : [];
    if (!connections.find((c: any) => c.id === id)) {
      connections.push({
        id: id,
        settings: {
          connection: { name: "Shared Connection", updatedAt: 0 },
          eateries: [],
          users: [],
          eateryScores: [],
          eateryVetoes: [],
        },
      });
      localStorage.setItem("wte-connections", JSON.stringify(connections));
    }
  }, connectionId);
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
  }, connection);
}

/**
 * Same as injectConnectionData, but will overwrite the stored connection if it already exists.
 * Use sparingly: init scripts run on every navigation.
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
  }, connection);
}
