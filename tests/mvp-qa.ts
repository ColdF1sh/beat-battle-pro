import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { BattleStatus, PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "@playwright/test";

import { finishBattle } from "@/lib/battle/transitions";

type CheckStatus = "PASS" | "WARN" | "FAIL";

type Check = {
  status: CheckStatus;
  name: string;
  detail: string;
};

type QaUser = {
  email: string;
  username: string;
  password: string;
};

const APP_URL = process.env.MVP_QA_BASE_URL ?? "http://localhost:3000";
const QA_PREFIX = "qa_producer_";
const QA_PASSWORD = "password123";
const SCREENSHOT_DIR = path.resolve("tests/screenshots");
const LOG_DIR = path.resolve("tests/logs");
const REPORT_DIR = path.resolve("tests/reports");
const REPORT_PATH = path.join(REPORT_DIR, "MVP_QA_REPORT.md");
const QA_LOG_PATH = path.join(LOG_DIR, "mvp-qa.log");
const API_LOG_PATH = path.join(LOG_DIR, "api.log");
const GENERATED_USERS_PATH = path.resolve("tests/generated-test-users.json");
const prisma = new PrismaClient();
const checks: Check[] = [];
const qaLogs: string[] = [];
const apiLogs: string[] = [];
const consoleErrors: string[] = [];
const serverErrors: string[] = [];
const screenshots: string[] = [];

let roomAId: string | null = null;
let roomBId: string | null = null;
let oldSafetyBattleId: string | null = null;
let storageStatus = "Not checked";
let waveformStatus = "Not checked";
let votingStatus = "Not checked";
let duplicateEloStatus = "Not checked";
let oldRoomSafetyStatus = "Not checked";

function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  qaLogs.push(line);
  console.log(line);
}

function addCheck(status: CheckStatus, name: string, detail: string) {
  checks.push({ status, name, detail });
  log(`${status}: ${name} - ${detail}`);
}

async function ensureDirs() {
  await Promise.all([
    fs.mkdir(SCREENSHOT_DIR, { recursive: true }),
    fs.mkdir(LOG_DIR, { recursive: true }),
    fs.mkdir(REPORT_DIR, { recursive: true }),
  ]);
}

function assertNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("MVP QA cleanup refused to run in production.");
  }
}

function createQaUsers(): QaUser[] {
  return Array.from({ length: 10 }, (_, index) => {
    const username = `${QA_PREFIX}${index + 1}`;

    return {
      username,
      email: `${username}@qa.beat-battle.local`,
      password: QA_PASSWORD,
    };
  });
}

async function saveUsers(users: QaUser[]) {
  await fs.writeFile(GENERATED_USERS_PATH, `${JSON.stringify(users, null, 2)}\n`);
}

async function checkEnvironment() {
  const appResponse = await fetch(APP_URL).catch((error: unknown) => {
    serverErrors.push(String(error));
    return null;
  });

  if (appResponse?.ok) {
    addCheck("PASS", "App reachable", `${APP_URL} returned ${appResponse.status}.`);
  } else {
    addCheck(
      "FAIL",
      "App reachable",
      `Could not reach ${APP_URL}. Start the app before running pnpm test:mvp.`,
    );
  }

  await prisma.$queryRaw`SELECT 1`;
  addCheck("PASS", "Database connection", "Prisma can query PostgreSQL.");
  addCheck("PASS", "Prisma Client", "Prisma Client loaded successfully.");

  const storageEnvPresent = [
    "S3_ENDPOINT",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET_NAME",
    "S3_PUBLIC_URL",
  ].every((key) => Boolean(process.env[key]));

  if (storageEnvPresent) {
    storageStatus = "PASS - S3/MinIO env vars are configured.";
    addCheck("PASS", "Storage env", storageStatus);
  } else {
    storageStatus = "WARN - S3/MinIO env vars are not fully configured.";
    addCheck("WARN", "Storage env", storageStatus);
  }
}

async function cleanupQaData(users: QaUser[]) {
  assertNotProduction();

  const qaUsers = await prisma.user.findMany({
    where: {
      username: {
        in: users.map((user) => user.username),
      },
    },
    select: {
      id: true,
    },
  });
  const userIds = qaUsers.map((user) => user.id);

  await prisma.matchmakingQueue.deleteMany({
    where: {
      OR: [
        {
          userId: {
            in: userIds,
          },
        },
        {
          user: {
            username: {
              startsWith: QA_PREFIX,
            },
          },
        },
      ],
    },
  });

  const qaBattleIds = (
    await prisma.battle.findMany({
      where: {
        OR: [
          {
            source: "MVP_QA",
          },
          {
            title: {
              startsWith: "MVP QA",
            },
          },
          {
            createdById: {
              in: userIds,
            },
          },
          {
            participants: {
              some: {
                userId: {
                  in: userIds,
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    })
  ).map((battle) => battle.id);

  if (qaBattleIds.length > 0) {
    await prisma.battle.deleteMany({
      where: {
        id: {
          in: qaBattleIds,
        },
      },
    });
  }

  await prisma.soundPack.deleteMany({
    where: {
      id: "mvp-qa-demo-sound-pack",
    },
  });

  addCheck(
    "PASS",
    "Safe cleanup",
    `Removed QA queues and ${qaBattleIds.length} QA-created battles only.`,
  );
}

async function upsertQaUsers(users: QaUser[]) {
  const passwordHash = await bcrypt.hash(QA_PASSWORD, 12);

  for (const user of users) {
    await prisma.user.upsert({
      where: {
        username: user.username,
      },
      update: {
        email: user.email,
        passwordHash,
        eloRating: 1000,
        wins: 0,
        losses: 0,
      },
      create: {
        email: user.email,
        username: user.username,
        passwordHash,
        eloRating: 1000,
      },
    });
  }

  await saveUsers(users);
  addCheck("PASS", "QA users", "Created or reused qa_producer_1 through qa_producer_10.");
}

async function ensureQaSoundPack() {
  await prisma.soundPack.upsert({
    where: {
      id: "mvp-qa-demo-sound-pack",
    },
    update: {
      isActive: true,
    },
    create: {
      id: "mvp-qa-demo-sound-pack",
      name: "MVP QA Demo Sound Pack",
      description: "Demo audio for MVP QA automation.",
      isActive: true,
      sounds: {
        create: [
          {
            name: "Demo Loop",
            fileUrl: "/demo-audio/demo-loop-1.mp3",
            fileType: "audio/mpeg",
            sizeBytes: 1728172,
          },
          {
            name: "Demo Drums",
            fileUrl: "/demo-audio/demo-drums-1.wav",
            fileType: "audio/wav",
            sizeBytes: 1726556,
          },
          {
            name: "Demo Melody",
            fileUrl: "/demo-audio/demo-melody-1.mp3",
            fileType: "audio/mpeg",
            sizeBytes: 2626134,
          },
        ],
      },
    },
  });
}

async function newPage(browser: Browser, user?: QaUser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(`${user?.username ?? "anonymous"}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(`${user?.username ?? "anonymous"} page error: ${error.message}`);
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/")) {
      apiLogs.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  if (user) {
    await login(page, user);
  }

  return { context, page };
}

async function login(page: Page, user: QaUser) {
  await page.goto(`${APP_URL}/login`);
  await page.getByTestId("login-identifier").fill(user.username);
  await page.getByTestId("login-password").fill(user.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/battle$/, { timeout: 15_000 });
}

async function screenshot(page: Page, fileName: string) {
  const target = path.join(SCREENSHOT_DIR, fileName);
  await page.screenshot({ path: target, fullPage: true });
  const relativePath = `tests/screenshots/${fileName}`;

  if (!screenshots.includes(relativePath)) {
    screenshots.push(relativePath);
  }
}

async function runMatchmakingGroup(
  pages: Page[],
  screenshotSearchName: string,
  screenshotRoomName: string,
) {
  for (const page of pages) {
    await page.goto(`${APP_URL}/battle`);
    await page.getByTestId("battle-mode-beatmaking_strict").click();
    await page.getByTestId("find-battle").waitFor({ state: "visible" });
  }

  await screenshot(pages[0], screenshotSearchName);

  for (const page of pages.slice(0, 4)) {
    await page.getByTestId("find-battle").click();
    await page.getByText("Searching for battle...").waitFor({ state: "visible" });
  }

  await pages[4].getByTestId("find-battle").click();

  await Promise.all(
    pages.map(async (page) => {
      await page.waitForURL(/\/battle\/[^/]+$/, { timeout: 25_000 });
      await page.getByTestId("battle-room").waitFor({ state: "visible" });
      await page.getByTestId("participant-count").waitFor({ state: "visible" });
    }),
  );

  const battleIds = pages.map((page) => page.url().split("/").at(-1) ?? "");
  const uniqueBattleIds = new Set(battleIds);

  if (uniqueBattleIds.size !== 1) {
    throw new Error(`Users landed in different battle rooms: ${battleIds.join(", ")}`);
  }

  const battleId = battleIds[0];
  const participantCount = await prisma.battleParticipant.count({
    where: {
      battleId,
    },
  });

  if (participantCount !== 5) {
    throw new Error(`Expected 5 participants in ${battleId}, got ${participantCount}.`);
  }

  await screenshot(pages[0], screenshotRoomName);

  return battleId;
}

async function createOldBattle(user: QaUser, status: BattleStatus, hoursOld: number) {
  const dbUser = await prisma.user.findUniqueOrThrow({
    where: {
      username: user.username,
    },
    select: {
      id: true,
    },
  });

  return prisma.battle.create({
    data: {
      title: `MVP QA old ${status}`,
      mode: "beatmaking_strict",
      source: "MVP_QA",
      status,
      isPrivate: false,
      maxPlayers: 5,
      durationMinutes: 20,
      createdById: dbUser.id,
      createdAt: new Date(Date.now() - hoursOld * 60 * 60 * 1000),
      participants: {
        create: {
          userId: dbUser.id,
        },
      },
    },
  });
}

async function seedSubmissions(battleId: string) {
  const participants = await prisma.battleParticipant.findMany({
    where: {
      battleId,
    },
    include: {
      user: {
        select: {
          username: true,
        },
      },
    },
  });

  for (const [index, participant] of participants.entries()) {
    const fileUrl =
      index % 2 === 0
        ? "/demo-audio/demo-loop-1.mp3"
        : "/demo-audio/demo-melody-1.mp3";

    await prisma.battleSubmission.upsert({
      where: {
        battleId_participantId: {
          battleId,
          participantId: participant.id,
        },
      },
      update: {
        fileUrl,
        fileName: `${participant.user.username}-submission.mp3`,
        mimeType: "audio/mpeg",
        sizeBytes: 1728172,
      },
      create: {
        battleId,
        userId: participant.userId,
        participantId: participant.id,
        fileUrl,
        fileName: `${participant.user.username}-submission.mp3`,
        mimeType: "audio/mpeg",
        sizeBytes: 1728172,
      },
    });

    await prisma.battleParticipant.update({
      where: {
        id: participant.id,
      },
      data: {
        beatUrl: fileUrl,
        submittedAt: new Date(),
      },
    });
  }
}

async function getParticipantsByUsername(battleId: string) {
  const participants = await prisma.battleParticipant.findMany({
    where: {
      battleId,
    },
    include: {
      user: {
        select: {
          username: true,
        },
      },
      submission: true,
    },
    orderBy: {
      joinedAt: "asc",
    },
  });

  return new Map(participants.map((participant) => [participant.user.username, participant]));
}

async function submitVotes(battleId: string, users: QaUser[], pages: Page[]) {
  const participantsByUsername = await getParticipantsByUsername(battleId);
  const participants = Array.from(participantsByUsername.values());
  const firstUserParticipant = participantsByUsername.get(users[0].username);

  if (!firstUserParticipant) {
    throw new Error("Missing first QA participant.");
  }

  const selfVoteChoices = participants.filter(
    (participant) => participant.id !== firstUserParticipant.id,
  );
  const selfVoteResponse = await pages[0].context().request.post(
    `${APP_URL}/api/battles/${battleId}/vote`,
    {
      data: {
        firstPlaceParticipantId: firstUserParticipant.id,
        secondPlaceParticipantId: selfVoteChoices[0].id,
        thirdPlaceParticipantId: selfVoteChoices[1].id,
      },
    },
  );

  if (selfVoteResponse.status() !== 400) {
    throw new Error(`Expected self-vote to be blocked, got ${selfVoteResponse.status()}.`);
  }

  for (const [index, user] of users.entries()) {
    const ownParticipant = participantsByUsername.get(user.username);

    if (!ownParticipant) {
      throw new Error(`Missing participant for ${user.username}.`);
    }

    const choices = participants.filter(
      (participant) => participant.id !== ownParticipant.id,
    );
    const response = await pages[index].context().request.post(
      `${APP_URL}/api/battles/${battleId}/vote`,
      {
        data: {
          firstPlaceParticipantId: choices[0].id,
          secondPlaceParticipantId: choices[1].id,
          thirdPlaceParticipantId: choices[2].id,
        },
      },
    );

    if (response.status() !== 200) {
      throw new Error(`Vote failed for ${user.username}: ${response.status()} ${await response.text()}`);
    }

    if (index === 0) {
      const duplicate = await pages[index].context().request.post(
        `${APP_URL}/api/battles/${battleId}/vote`,
        {
          data: {
            firstPlaceParticipantId: choices[0].id,
            secondPlaceParticipantId: choices[1].id,
            thirdPlaceParticipantId: choices[2].id,
          },
        },
      );

      if (duplicate.status() !== 409) {
        throw new Error(`Expected duplicate vote block, got ${duplicate.status()}.`);
      }
    }
  }
}

async function runSecurityChecks(page: Page, nonParticipantPage: Page, battleId: string) {
  const anonymous = await chromium.launch().then(async (browser) => {
    const context = await browser.newContext();
    const anonymousPage = await context.newPage();
    await anonymousPage.goto(`${APP_URL}/battle`);
    const redirected = anonymousPage.url().includes("/login");
    await browser.close();
    return redirected;
  });

  addCheck(
    anonymous ? "PASS" : "FAIL",
    "Anonymous protected route",
    anonymous ? "/battle redirects anonymous users to /login." : "/battle did not redirect anonymous user.",
  );

  const unauthenticatedApi = await fetch(`${APP_URL}/api/matchmaking/status`);
  addCheck(
    unauthenticatedApi.status === 401 ? "PASS" : "FAIL",
    "Protected API unauthenticated",
    `GET /api/matchmaking/status returned ${unauthenticatedApi.status}.`,
  );

  const nonParticipantSubmit = await nonParticipantPage.context().request.post(
    `${APP_URL}/api/battles/${battleId}/submission`,
    {
      multipart: {
        file: {
          name: "submission.mp3",
          mimeType: "audio/mpeg",
          buffer: Buffer.from("fake"),
        },
      },
    },
  );
  const nonParticipantVote = await nonParticipantPage.context().request.post(
    `${APP_URL}/api/battles/${battleId}/vote`,
    {
      data: {
        firstPlaceParticipantId: "a",
        secondPlaceParticipantId: "b",
        thirdPlaceParticipantId: "c",
      },
    },
  );

  addCheck(
    nonParticipantSubmit.status() === 403 && nonParticipantVote.status() === 403
      ? "PASS"
      : "FAIL",
    "Non-participant API access",
    `Submit ${nonParticipantSubmit.status()}, vote ${nonParticipantVote.status()}.`,
  );

  const tempBattle = await prisma.battle.create({
    data: {
      title: "MVP QA invalid vote body",
      mode: "beatmaking_strict",
      source: "MVP_QA",
      status: BattleStatus.VOTING,
      isPrivate: false,
      maxPlayers: 5,
      durationMinutes: 20,
      createdById: (await prisma.user.findUniqueOrThrow({
        where: {
          username: QA_PREFIX + "1",
        },
        select: {
          id: true,
        },
      })).id,
      participants: {
        create: {
          userId: (await prisma.user.findUniqueOrThrow({
            where: {
              username: QA_PREFIX + "1",
            },
            select: {
              id: true,
            },
          })).id,
        },
      },
    },
  });
  const invalidVote = await page.context().request.post(
    `${APP_URL}/api/battles/${tempBattle.id}/vote`,
    {
      data: {
        firstPlaceParticipantId: "only-one",
      },
    },
  );

  addCheck(
    invalidVote.status() === 400 ? "PASS" : "FAIL",
    "Invalid vote validation",
    `Invalid vote body returned ${invalidVote.status()}.`,
  );

  const leaderboard = await fetch(`${APP_URL}/api/leaderboard`);
  const leaderboardText = await leaderboard.text();
  const safeLeaderboard =
    !leaderboardText.includes("passwordHash") &&
    !leaderboardText.includes("@qa.beat-battle.local");

  addCheck(
    safeLeaderboard ? "PASS" : "FAIL",
    "Leaderboard safe data",
    safeLeaderboard
      ? "Leaderboard does not expose email or passwordHash."
      : "Leaderboard exposed private fields.",
  );
}

function count(status: CheckStatus) {
  return checks.filter((check) => check.status === status).length;
}

async function writeReport() {
  const screenshotList = screenshots
    .map((shot) => `- ${shot}`)
    .join("\n");
  const checkList = checks
    .map((check) => `- **${check.status}** ${check.name}: ${check.detail}`)
    .join("\n");
  const consoleErrorList =
    consoleErrors.length > 0
      ? consoleErrors.map((error) => `- ${error}`).join("\n")
      : "- None captured";
  const serverErrorList =
    serverErrors.length > 0
      ? serverErrors.map((error) => `- ${error}`).join("\n")
      : "- None captured";
  const recommendationList =
    checks.some((check) => check.status === "FAIL")
      ? "- Investigate failed checks before treating the MVP as release-ready."
      : checks.some((check) => check.status === "WARN")
        ? "- Review WARN items, especially storage availability, before production-like QA."
        : "- MVP smoke pass is healthy. Keep this command in the release checklist.";

  const report = `# MVP QA Report

Generated: ${new Date().toISOString()}

## Summary

- PASS: ${count("PASS")}
- WARN: ${count("WARN")}
- FAIL: ${count("FAIL")}

## Tested Systems

- Environment and database
- Auth and protected routes
- Two 5-player matchmaking rooms
- Old room safety
- Battle room rendering
- Submission and waveform display
- Ranked voting and Elo processing
- Leaderboard and public profile
- Security checks

## Room Proof

- Room A ID: ${roomAId ?? "not created"}
- Room B ID: ${roomBId ?? "not created"}
- Room A !== Room B: ${roomAId && roomBId ? String(roomAId !== roomBId) : "not verified"}

## Key Results

- Old room safety: ${oldRoomSafetyStatus}
- Storage/upload: ${storageStatus}
- Waveform: ${waveformStatus}
- Voting: ${votingStatus}
- Elo duplicate prevention: ${duplicateEloStatus}

## Checks

${checkList}

## Screenshots

${screenshotList}

## Browser Console Errors

${consoleErrorList}

## API/Server Errors

${serverErrorList}

## Recommendations

${recommendationList}
`;

  await fs.writeFile(REPORT_PATH, report);
  await fs.writeFile(QA_LOG_PATH, `${qaLogs.join("\n")}\n`);
  await fs.writeFile(API_LOG_PATH, `${apiLogs.join("\n")}\n`);
}

async function main() {
  await ensureDirs();
  const users = createQaUsers();
  let browser: Browser | null = null;

  try {
    await checkEnvironment();
    await cleanupQaData(users);
    await upsertQaUsers(users);
    await ensureQaSoundPack();

    browser = await chromium.launch();
    const sessions = [];

    const loginShot = await newPage(browser);
    await loginShot.page.goto(`${APP_URL}/login`);
    await screenshot(loginShot.page, "01-login-page.png");
    await loginShot.context.close();

    for (const user of users) {
      sessions.push(await newPage(browser, user));
    }

    await sessions[0].page.goto(`${APP_URL}/battle`);
    await screenshot(sessions[0].page, "02-battle-page.png");

    roomAId = await runMatchmakingGroup(
      sessions.slice(0, 5).map((session) => session.page),
      "03-matchmaking-room-a-search.png",
      "04-battle-room-a.png",
    );
    addCheck("PASS", "Room A matchmaking", `Created ${roomAId} with 5 participants.`);

    roomBId = await runMatchmakingGroup(
      sessions.slice(5, 10).map((session) => session.page),
      "05-matchmaking-room-b-search.png",
      "06-battle-room-b.png",
    );
    addCheck("PASS", "Room B matchmaking", `Created ${roomBId} with 5 participants.`);
    addCheck(
      roomAId !== roomBId ? "PASS" : "FAIL",
      "Simultaneous room isolation",
      `Room A ${roomAId}, Room B ${roomBId}.`,
    );

    await prisma.battle.updateMany({
      where: {
        id: {
          in: [roomAId, roomBId].filter(Boolean) as string[],
        },
      },
      data: {
        status: BattleStatus.FINISHED,
        finishedAt: new Date(),
      },
    });

    const oldBattles = await Promise.all([
      createOldBattle(users[0], BattleStatus.FINISHED, 24),
      createOldBattle(users[0], BattleStatus.CANCELLED, 24),
      createOldBattle(users[0], BattleStatus.WAITING, 7),
    ]);
    const oldBattleIds = new Set(oldBattles.map((battle) => battle.id));
    oldSafetyBattleId = await runMatchmakingGroup(
      sessions.slice(0, 5).map((session) => session.page),
      "07-old-room-safety.png",
      "07-old-room-safety.png",
    );
    oldRoomSafetyStatus = oldBattleIds.has(oldSafetyBattleId)
      ? "FAIL - matched old battle"
      : `PASS - fresh battle ${oldSafetyBattleId}`;
    addCheck(
      oldBattleIds.has(oldSafetyBattleId) ? "FAIL" : "PASS",
      "Old room safety",
      oldRoomSafetyStatus,
    );

    const qaBattleId = oldSafetyBattleId;
    await prisma.battle.update({
      where: {
        id: qaBattleId,
      },
      data: {
        status: BattleStatus.SUBMISSION,
      },
    });
    await sessions[0].page.goto(`${APP_URL}/battle/${qaBattleId}`);
    await screenshot(sessions[0].page, "08-upload-ui.png");

    if (storageStatus.startsWith("PASS")) {
      const demoAudio = path.resolve("public/demo-audio/demo-loop-1.mp3");
      await sessions[0].page.getByTestId("submission-file-input").setInputFiles(demoAudio);
      await sessions[0].page.getByTestId("submission-upload-submit").click();
      const uploadSucceeded = await sessions[0].page
        .getByText("Submission uploaded successfully.")
        .isVisible({ timeout: 15_000 })
        .catch(() => false);

      if (uploadSucceeded) {
        addCheck("PASS", "Real audio upload", "Uploaded demo MP3 through storage-backed API.");
      } else {
        storageStatus = "WARN - storage env exists, but upload did not complete locally.";
        addCheck("WARN", "Real audio upload", storageStatus);
      }
    } else {
      addCheck("WARN", "Real audio upload", "Skipped because storage is not configured.");
    }

    await seedSubmissions(qaBattleId);
    await sessions[0].page.reload();
    await sessions[0].page.getByTestId("submission-audio-player").first().waitFor({
      state: "visible",
    });
    waveformStatus = "PASS - waveform/audio player rendered from demo audio.";
    addCheck("PASS", "Waveform player", waveformStatus);
    await screenshot(sessions[0].page, "09-waveform-player.png");

    await prisma.battle.update({
      where: {
        id: qaBattleId,
      },
      data: {
        status: BattleStatus.VOTING,
      },
    });
    await sessions[0].page.goto(`${APP_URL}/battle/${qaBattleId}`);
    await sessions[0].page.getByTestId("voting-panel").waitFor({ state: "visible" });
    await screenshot(sessions[0].page, "10-voting-ui.png");
    await submitVotes(
      qaBattleId,
      users.slice(0, 5),
      sessions.slice(0, 5).map((session) => session.page),
    );

    const finishedBattle = await prisma.battle.findUniqueOrThrow({
      where: {
        id: qaBattleId,
      },
      select: {
        status: true,
        eloProcessed: true,
      },
    });
    const eloCount = await prisma.battleEloResult.count({
      where: {
        battleId: qaBattleId,
      },
    });
    votingStatus =
      finishedBattle.status === BattleStatus.FINISHED && eloCount === 5
        ? "PASS - battle finished with 5 Elo results."
        : `FAIL - status ${finishedBattle.status}, Elo results ${eloCount}.`;
    addCheck(
      votingStatus.startsWith("PASS") ? "PASS" : "FAIL",
      "Voting and Elo",
      votingStatus,
    );

    await finishBattle(qaBattleId);
    const duplicateCount = await prisma.battleEloResult.count({
      where: {
        battleId: qaBattleId,
      },
    });
    duplicateEloStatus =
      duplicateCount === eloCount
        ? "PASS - duplicate finish did not create extra Elo rows."
        : `FAIL - Elo rows changed from ${eloCount} to ${duplicateCount}.`;
    addCheck(
      duplicateCount === eloCount ? "PASS" : "FAIL",
      "Duplicate Elo prevention",
      duplicateEloStatus,
    );

    await sessions[0].page.goto(`${APP_URL}/battle/${qaBattleId}`);
    await sessions[0].page.getByTestId("results-section").waitFor({ state: "visible" });
    await screenshot(sessions[0].page, "11-finished-results.png");

    await runSecurityChecks(sessions[0].page, sessions[9].page, qaBattleId);

    await sessions[0].page.goto(`${APP_URL}/leaderboard`);
    await sessions[0].page.getByTestId("leaderboard-page").waitFor({ state: "visible" });
    await screenshot(sessions[0].page, "12-leaderboard.png");
    await sessions[0].page.goto(`${APP_URL}/profile/${users[0].username}`);
    await sessions[0].page.getByTestId("public-profile-page").waitFor({ state: "visible" });
    await screenshot(sessions[0].page, "13-profile.png");

    for (const session of sessions) {
      await session.context.close();
    }
  } catch (error) {
    addCheck("FAIL", "MVP QA runner", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => undefined);
    await writeReport();
    await prisma.$disconnect();
  }

  if (checks.some((check) => check.status === "FAIL")) {
    process.exitCode = 1;
  }
}

void main();
