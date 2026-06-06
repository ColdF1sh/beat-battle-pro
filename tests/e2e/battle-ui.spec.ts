import { expect, test } from "@playwright/test";

import { loginUserViaUi } from "./helpers/auth";
import { cleanupE2EData, disconnectDb, upsertTestUser } from "./helpers/db";
import { createTestRunId, createTestUser } from "./helpers/test-users";

test.describe("battle UI", () => {
  test.beforeAll(async () => {
    await cleanupE2EData();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test("renders tabs and multi-mode selection controls", async ({ page }) => {
    const user = createTestUser(createTestRunId(), 1);
    await upsertTestUser(user);
    await loginUserViaUi(page, user);

    await expect(page.getByTestId("battle-page")).toBeVisible();
    await expect(page.getByTestId("battle-tab-search")).toBeVisible();
    await expect(page.getByTestId("battle-tab-custom")).toBeVisible();
    await expect(page.getByTestId("find-battle")).toBeDisabled();

    const strict = page.getByTestId("battle-mode-beatmaking_strict");
    const freeFlying = page.getByTestId("battle-mode-beatmaking_free_flying");
    const rapBattle = page.getByTestId("battle-mode-rap_free_flying");

    await strict.click();
    await freeFlying.click();
    await expect(strict).toHaveAttribute("data-selected", "true");
    await expect(freeFlying).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("find-battle")).toBeEnabled();

    await page.getByTestId("battle-tab-rap").click();
    await expect(page.getByTestId("battle-mode-rap_strict")).toHaveCount(0);
    await expect(rapBattle).toBeVisible();
    await expect(rapBattle).toBeEnabled();
    await page.getByTestId("clear-selection").click();
    await expect(page.getByTestId("find-battle")).toBeDisabled();

    await page.getByTestId("battle-tab-custom").click();
    await expect(page.getByText("Public rooms")).toBeVisible();
    await expect(page.getByText("Coming soon")).toBeVisible();
  });
});
