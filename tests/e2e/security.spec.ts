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
import { createBattleForUsers } from "./helpers/battle";
import { createTestRunId, createTestUsers } from "./helpers/test-users";

test.describe("security", () => {
  test.beforeAll(async () => {
    await cleanupE2EData();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test("returns 401 for unauthenticated protected API access", async ({
    request,
  }) => {
    expect((await request.post("/api/matchmaking/search")).status()).toBe(401);
    expect((await request.get("/api/matchmaking/status")).status()).toBe(401);
    expect((await request.post("/api/matchmaking/cancel")).status()).toBe(401);
  });

  test("blocks non-participants from battle rooms and battle mutation APIs", async ({
    page,
  }) => {
    const users = createTestUsers(createTestRunId(), 2);
    await upsertTestUsers(users);
    const battle = await createBattleForUsers({
      users: [users[0]],
      status: BattleStatus.VOTING,
    });

    await loginUserViaUi(page, users[1]);
    await page.goto(`/battle/${battle.id}`);
    await expect(page.getByText("Access denied")).toBeVisible();

    const api = await getAuthenticatedRequestContext(page);
    const submitResponse = await api.post(`/api/battles/${battle.id}/submission`, {
      multipart: {
        file: {
          name: "submission.mp3",
          mimeType: "audio/mpeg",
          buffer: Buffer.from("fake mp3"),
        },
      },
    });
    const voteResponse = await api.post(`/api/battles/${battle.id}/vote`, {
      data: {
        firstPlaceParticipantId: "a",
        secondPlaceParticipantId: "b",
        thirdPlaceParticipantId: "c",
      },
    });

    expect(submitResponse.status()).toBe(403);
    expect(voteResponse.status()).toBe(403);

  });

  test("rejects invalid vote bodies and leaderboard exposes only safe public data", async ({
    page,
    request,
  }) => {
    const users = createTestUsers(createTestRunId(), 1);
    await upsertTestUsers(users);
    const battle = await createBattleForUsers({
      users,
      status: BattleStatus.VOTING,
    });

    await loginUserViaUi(page, users[0]);
    const api = await getAuthenticatedRequestContext(page);
    const invalidVote = await api.post(`/api/battles/${battle.id}/vote`, {
      data: {
        firstPlaceParticipantId: "only-one",
      },
    });
    expect(invalidVote.status()).toBe(400);

    const leaderboard = await request.get("/api/leaderboard");
    const body = await leaderboard.json();
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect(JSON.stringify(body)).not.toContain(users[0].email);

  });
});
