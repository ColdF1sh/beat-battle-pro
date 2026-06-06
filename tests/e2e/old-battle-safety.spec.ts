import { expect, test } from "@playwright/test";

import { loginUserInNewContext } from "./helpers/auth";
import {
  BattleStatus,
  cleanupE2EData,
  disconnectDb,
  upsertTestUsers,
} from "./helpers/db";
import { createOldBattleForUser } from "./helpers/battle";
import { createTestRunId, createTestUsers } from "./helpers/test-users";

test.describe("old battle safety", () => {
  test.beforeAll(async () => {
    await cleanupE2EData();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test("does not redirect fresh matchmaking to stale or closed battles", async ({
    browser,
  }) => {
    const users = createTestUsers(createTestRunId(), 5);
    await upsertTestUsers(users);
    const oldFinished = await createOldBattleForUser({
      user: users[0],
      status: BattleStatus.FINISHED,
      hoursOld: 24,
    });
    const oldCancelled = await createOldBattleForUser({
      user: users[0],
      status: BattleStatus.CANCELLED,
      hoursOld: 24,
    });
    const oldWaiting = await createOldBattleForUser({
      user: users[0],
      status: BattleStatus.WAITING,
      hoursOld: 7,
    });

    const oldBattleIds = new Set([
      oldFinished.id,
      oldCancelled.id,
      oldWaiting.id,
    ]);

    const sessions = await Promise.all(
      users.map((user) => loginUserInNewContext(browser, user)),
    );

    await Promise.all(
      sessions.map(async ({ page }) => {
        await page.getByTestId("battle-mode-beatmaking_strict").click();
        await expect(page.getByTestId("find-battle")).toBeEnabled();
        await page.getByTestId("find-battle").click();
      }),
    );

    await Promise.all(
      sessions.map(async ({ page }) => {
        await expect(page).toHaveURL(/\/battle\/[^/]+$/, {
          timeout: 20_000,
        });
      }),
    );

    const newBattleId = sessions[0].page.url().split("/").at(-1);
    expect(newBattleId).toBeTruthy();
    expect(oldBattleIds.has(newBattleId ?? "")).toBe(false);

    await sessions[0].page.screenshot({
      path: "tests/screenshots/e2e-old-battle-safety.png",
      fullPage: true,
    });

    await Promise.all(sessions.map(({ context }) => context.close()));
  });
});
