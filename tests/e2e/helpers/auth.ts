import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { E2ETestUser } from "./test-users";

export async function registerUserViaUi(page: Page, user: E2ETestUser) {
  await page.goto("/register");
  await page.getByTestId("register-email").fill(user.email);
  await page.getByTestId("register-username").fill(user.username);
  await page.getByTestId("register-password").fill(user.password);
  await page.getByTestId("register-submit").click();
  await expect(page).toHaveURL(/\/login$/);
}

export async function loginUserViaUi(page: Page, user: E2ETestUser) {
  await page.goto("/login");
  await page.getByTestId("login-identifier").fill(user.username);
  await page.getByTestId("login-password").fill(user.password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/battle$/);
}

export async function logoutViaUi(page: Page) {
  await page.getByTestId("user-menu-trigger").click();
  await page.getByTestId("sign-out-menu-item").click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
}

export async function loginUserInNewContext(
  browser: Browser,
  user: E2ETestUser,
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginUserViaUi(page, user);

  return {
    context,
    page,
  };
}

export async function getAuthenticatedRequestContext(
  page: Page,
): Promise<APIRequestContext> {
  return page.context().request;
}
