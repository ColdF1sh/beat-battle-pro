import { expect, test } from "@playwright/test";

import {
  getAuthenticatedRequestContext,
  loginUserInNewContext,
} from "./helpers/auth";
import {
  BattleStatus,
  cleanupE2EData,
  disconnectDb,
  prisma,
  upsertTestUsers,
} from "./helpers/db";
import {
  createBattleForUsers,
  moveBattleToVoting,
  seedSubmissionsForBattle,
} from "./helpers/battle";
import { createTestRunId, createTestUsers } from "./helpers/test-users";
import { finishBattle } from "@/lib/battle/transitions";

test.describe("voting, results, and Elo", () => {
  test.beforeAll(async () => {
    await cleanupE2EData();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test("finishes a 5-player battle with score votes and one Elo result per user", async ({
    browser,
  }) => {
    const users = createTestUsers(createTestRunId(), 5);
    await upsertTestUsers(users);
    const battle = await createBattleForUsers({
      users,
      status: BattleStatus.SUBMISSION,
    });
    await seedSubmissionsForBattle(battle.id);
    await moveBattleToVoting(battle.id);

    const participants = await prisma.battleParticipant.findMany({
      where: {
        battleId: battle.id,
      },
      include: {
        user: {
          select: {
            username: true,
          },
        },
      },
      orderBy: {
        joinedAt: "asc",
      },
    });

    const sessions = await Promise.all(
      users.map((user) => loginUserInNewContext(browser, user)),
    );
    const apiContexts = await Promise.all(
      sessions.map(({ page }) => getAuthenticatedRequestContext(page)),
    );

    await sessions[0].page.goto(`/battle/${battle.id}`);
    await expect(
      sessions[0].page.getByTestId("voting-listening-panel"),
    ).toBeVisible();

    for (const apiContext of apiContexts) {
      const listeningComplete = await apiContext.post(
        `/api/battles/${battle.id}/listening-complete`,
      );
      expect(await listeningComplete.json()).toMatchObject({
        status: "success",
      });
      expect(listeningComplete.status()).toBe(200);
    }

    await sessions[0].page.reload();
    await expect(sessions[0].page.getByTestId("voting-panel")).toBeVisible();
    await expect(
      sessions[0].page.getByTestId(
        `vote-rating-slider-${participants[0].id}`,
      ),
    ).toHaveCount(0);

    const firstApi = await getAuthenticatedRequestContext(sessions[0].page);
    const firstUserParticipant = participants.find(
      (participant) => participant.user.username === users[0].username,
    );

    if (!firstUserParticipant) {
      throw new Error("Missing first E2E participant.");
    }

    const firstSelfVoteChoices = participants.filter(
      (participant) => participant.id !== firstUserParticipant.id,
    );
    const selfVote = await firstApi.post(`/api/battles/${battle.id}/vote`, {
      data: {
        scores: [
          {
            participantId: firstUserParticipant.id,
            score: 10,
          },
          ...firstSelfVoteChoices.slice(0, 3).map((participant, index) => ({
            participantId: participant.id,
            score: 9 - index,
          })),
        ],
      },
    });
    expect(selfVote.status()).toBe(400);

    for (let index = 0; index < apiContexts.length; index += 1) {
      const ownParticipant = participants.find(
        (participant) => participant.user.username === users[index].username,
      );

      if (!ownParticipant) {
        throw new Error(`Missing E2E participant for ${users[index].username}.`);
      }

      const choices = participants.filter(
        (participant) => participant.id !== ownParticipant.id,
      );
      const response = await apiContexts[index].post(
        `/api/battles/${battle.id}/vote`,
        {
          data: {
            scores: choices.map((participant, choiceIndex) => ({
              participantId: participant.id,
              score: Math.max(1, 10 - choiceIndex),
            })),
          },
        },
      );
      expect(await response.json()).toMatchObject({ status: "success" });
      expect(response.status()).toBe(200);

      if (index === 0) {
        const duplicate = await apiContexts[index].post(
          `/api/battles/${battle.id}/vote`,
          {
            data: {
              scores: choices.map((participant, choiceIndex) => ({
                participantId: participant.id,
                score: Math.max(1, 9 - choiceIndex),
              })),
            },
          },
        );
        expect(duplicate.status()).toBe(200);
      }
    }

    const finishedBattle = await prisma.battle.findUniqueOrThrow({
      where: {
        id: battle.id,
      },
      select: {
        status: true,
        eloProcessed: true,
      },
    });
    expect(finishedBattle).toEqual({
      status: BattleStatus.FINISHED,
      eloProcessed: true,
    });

    const eloCount = await prisma.battleEloResult.count({
      where: {
        battleId: battle.id,
      },
    });
    expect(eloCount).toBe(5);

    await finishBattle(battle.id);
    expect(
      await prisma.battleEloResult.count({
        where: {
          battleId: battle.id,
        },
      }),
    ).toBe(5);

    await sessions[0].page.goto(`/battle/${battle.id}`);
    await expect(sessions[0].page.getByTestId("results-section")).toBeVisible();
    await expect(
      sessions[0].page.getByRole("heading", { name: "Results" }),
    ).toBeVisible();

    await Promise.all(sessions.map(({ context }) => context.close()));
  });
});
