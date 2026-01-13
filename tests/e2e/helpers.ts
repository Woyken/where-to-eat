import { Page } from "@playwright/test";

export async function injectConnection(page: Page, connectionId: string) {
  await page.addInitScript((id) => {
    const existing = localStorage.getItem('wte-connections');
    const connections = existing ? JSON.parse(existing) : [];
    if (!connections.find((c: any) => c.id === id)) {
      connections.push({
        id: id,
        settings: {
          connection: { name: 'Shared Connection', updatedAt: 0 },
          eateries: [],
          users: [],
          eateryScores: []
        }
      });
      localStorage.setItem('wte-connections', JSON.stringify(connections));
    }
  }, connectionId);
}
