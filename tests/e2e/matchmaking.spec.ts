import { expect, test } from "@playwright/test";

import { loginUserInNewContext } from "./helpers/auth";
import {
  cleanupE2EData,
  disconnectDb,
  upsertTestUsers,
} from "./helpers/db";
import { createTestRunId, createTestUsers } from "./helpers/test-users";

test.describe("matchmaking", () => {
  test.beforeAll(async () => {
    await cleanupE2EData();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test("matches 5 users into the same fresh battle", async ({ browser }) => {
    const users = createTestUsers(createTestRunId(), 5);
    await upsertTestUsers(users);

    const sessions = await Promise.all(
      users.map((user) => loginUserInNewContext(browser, user)),
    );

    await Promise.all(
      sessions.map(async ({ page }) => {
        await page.getByTestId("battle-mode-beatmaking_strict").click();
        await expect(page.getByTestId("find-battle")).toBeEnabled();
      }),
    );

    for (const { page } of sessions.slice(0, 4)) {
      await page.getByTestId("find-battle").click();
      await expect(page.getByText("Searching for battle...")).toBeVisible();
    }

    await sessions[4].page.getByTestId("find-battle").click();

    await Promise.all(
      sessions.map(async ({ page }) => {
        await expect(page).toHaveURL(/\/battle\/[^/]+$/, {
          timeout: 20_000,
        });
        await expect(page.getByTestId("battle-room")).toBeVisible();
        await expect(page.getByTestId("participant-count")).toContainText(
          "5/5 players",
        );
      }),
    );

    const battleUrls = sessions.map(({ page }) => page.url());
    expect(new Set(battleUrls).size).toBe(1);

    await sessions[0].page.screenshot({
      path: "tests/screenshots/e2e-matchmaking-5-users.png",
      fullPage: true,
    });

    await Promise.all(sessions.map(({ context }) => context.close()));
  });
});
