import { expect, test } from "@playwright/test";

import { loginUserViaUi } from "./helpers/auth";
import {
  BattleStatus,
  cleanupE2EData,
  disconnectDb,
  prisma,
  upsertTestUsers,
} from "./helpers/db";
import { createBattleForUsers } from "./helpers/battle";
import { createTestRunId, createTestUsers } from "./helpers/test-users";

test.describe("leaderboard and public profile", () => {
  test.beforeAll(async () => {
    await cleanupE2EData();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test("renders leaderboard tabs, profile links, stats, and Elo history", async ({
    page,
  }) => {
    const users = createTestUsers(createTestRunId(), 2);
    await upsertTestUsers(users);
    const battle = await createBattleForUsers({
      users,
      status: BattleStatus.FINISHED,
    });
    const dbUser = await prisma.user.update({
      where: {
        username: users[0].username,
      },
      data: {
        eloRating: 1120,
        wins: 1,
        losses: 0,
      },
      select: {
        id: true,
      },
    });
    await prisma.battleEloResult.create({
      data: {
        battleId: battle.id,
        userId: dbUser.id,
        oldElo: 1000,
        newElo: 1120,
        eloChange: 120,
        placement: 1,
        totalVotePoints: 12,
      },
    });

    await loginUserViaUi(page, users[0]);
    await page.goto("/leaderboard");

    await expect(page.getByTestId("leaderboard-page")).toBeVisible();
    await expect(page.getByTestId("leaderboard-tab-beatmaking")).toBeVisible();
    await expect(page.getByTestId("leaderboard-tab-rap")).toBeVisible();
    await expect(page.getByText(users[0].username).first()).toBeVisible();

    await page.getByRole("link", { name: new RegExp(users[0].username) }).first().click();
    await expect(page).toHaveURL(new RegExp(`/profile/${users[0].username}$`));
    await expect(page.getByTestId("public-profile-page")).toBeVisible();
    await expect(page.getByText(users[0].username).first()).toBeVisible();
    await expect(page.getByText("Bronze Producer I").first()).toBeVisible();
    await expect(page.getByText("+120 Elo")).toBeVisible();
    await expect(page.getByText("Wins").first()).toBeVisible();
    await expect(page.getByText("Losses").first()).toBeVisible();
  });
});
