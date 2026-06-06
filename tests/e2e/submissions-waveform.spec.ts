import { expect, test } from "@playwright/test";

import {
  getAuthenticatedRequestContext,
  loginUserViaUi,
} from "./helpers/auth";
import {
  BattleStatus,
  cleanupE2EData,
  disconnectDb,
  upsertTestUsers,
} from "./helpers/db";
import {
  createBattleForUsers,
  seedSubmissionsForBattle,
} from "./helpers/battle";
import { createTestRunId, createTestUsers } from "./helpers/test-users";

test.describe("submissions and waveform", () => {
  test.beforeAll(async () => {
    await cleanupE2EData();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test("renders seeded submission audio player and rejects invalid files", async ({
    page,
  }) => {
    const users = createTestUsers(createTestRunId(), 1);
    await upsertTestUsers(users);
    const battle = await createBattleForUsers({
      users,
      status: BattleStatus.SUBMISSION,
    });
    await seedSubmissionsForBattle(battle.id);

    await loginUserViaUi(page, users[0]);
    await page.goto(`/battle/${battle.id}`);

    await expect(page.getByTestId("submission-section")).toBeVisible();
    await expect(
      page.getByTestId("submission-audio-player").first(),
    ).toBeVisible();

    const api = await getAuthenticatedRequestContext(page);
    const response = await api.post(`/api/battles/${battle.id}/submission`, {
      multipart: {
        file: {
          name: "invalid-upload.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("not audio"),
        },
      },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Validation failed",
    });
  });

  test("rejects uploads outside the submission phase", async ({ page }) => {
    const users = createTestUsers(createTestRunId(), 1);
    await upsertTestUsers(users);
    const battle = await createBattleForUsers({
      users,
      status: BattleStatus.WAITING,
    });

    await loginUserViaUi(page, users[0]);
    const api = await getAuthenticatedRequestContext(page);
    const response = await api.post(`/api/battles/${battle.id}/submission`, {
      multipart: {
        file: {
          name: "submission.mp3",
          mimeType: "audio/mpeg",
          buffer: Buffer.from("fake mp3"),
        },
      },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Submissions are not open for this battle.",
    });

  });
});
