import { expect, test } from "@playwright/test";

import {
  loginUserViaUi,
  logoutViaUi,
  registerUserViaUi,
} from "./helpers/auth";
import { cleanupE2EData, disconnectDb } from "./helpers/db";
import { createTestRunId, createTestUser } from "./helpers/test-users";

test.describe("auth", () => {
  test.beforeAll(async () => {
    await cleanupE2EData();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test("registers without displayName, logs in, logs out, and protects routes", async ({
    page,
  }) => {
    const user = createTestUser(createTestRunId(), 1);

    await registerUserViaUi(page, user);
    await loginUserViaUi(page, user);
    await expect(page.getByTestId("battle-page")).toBeVisible();

    await logoutViaUi(page);

    await page.goto("/battle");
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows validation feedback for invalid usernames", async ({ page }) => {
    await page.goto("/register");
    await page.getByTestId("register-email").fill("bad-user@example.com");
    await page.getByTestId("register-username").fill("bad-name");
    await page.getByTestId("register-password").fill("password123");
    await page.getByTestId("register-submit").click();

    await expect(
      page.getByText(
        "Username can only contain lowercase letters, numbers, and underscores.",
      ),
    ).toBeVisible();
  });
});
