import bcrypt from "bcryptjs";
import { BattleStatus, PrismaClient } from "@prisma/client";

import {
  E2E_EMAIL_DOMAIN,
  E2E_USERNAME_PREFIX,
  type E2ETestUser,
} from "./test-users";

export const prisma = new PrismaClient();

export function assertNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("E2E cleanup refused to run in production.");
  }
}

export async function disconnectDb() {
  await prisma.$disconnect();
}

export async function cleanupE2EData() {
  assertNotProduction();

  const e2eUsers = await prisma.user.findMany({
    where: {
      OR: [
        {
          email: {
            endsWith: `@${E2E_EMAIL_DOMAIN}`,
          },
        },
        {
          username: {
            startsWith: E2E_USERNAME_PREFIX,
          },
        },
        {
          username: {
            startsWith: "e2e_producer_",
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });
  const userIds = e2eUsers.map((user) => user.id);

  if (userIds.length === 0) {
    return;
  }

  const battleIds = (
    await prisma.battle.findMany({
      where: {
        OR: [
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

  await prisma.matchmakingQueue.deleteMany({
    where: {
      userId: {
        in: userIds,
      },
    },
  });

  if (battleIds.length > 0) {
    await prisma.battle.deleteMany({
      where: {
        id: {
          in: battleIds,
        },
      },
    });
  }

  await prisma.user.deleteMany({
    where: {
      id: {
        in: userIds,
      },
    },
  });
}

export async function upsertTestUser(user: E2ETestUser) {
  const passwordHash = await bcrypt.hash(user.password, 12);

  return prisma.user.upsert({
    where: {
      email: user.email,
    },
    update: {
      username: user.username,
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

export async function upsertTestUsers(users: E2ETestUser[]) {
  return Promise.all(users.map((user) => upsertTestUser(user)));
}

export async function ensureDemoSoundPack() {
  return prisma.soundPack.upsert({
    where: {
      id: "e2e-demo-sound-pack",
    },
    update: {
      isActive: true,
    },
    create: {
      id: "e2e-demo-sound-pack",
      name: "E2E Demo Sound Pack",
      description: "Safe E2E demo audio files.",
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

export { BattleStatus };
