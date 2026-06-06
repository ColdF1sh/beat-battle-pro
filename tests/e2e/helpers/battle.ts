import { BattleStatus, ensureDemoSoundPack, prisma } from "./db";
import type { E2ETestUser } from "./test-users";

export async function createBattleForUsers({
  users,
  status = BattleStatus.WAITING,
  title = "E2E Battle",
  createdAt,
}: {
  users: E2ETestUser[];
  status?: BattleStatus;
  title?: string;
  createdAt?: Date;
}) {
  const dbUsers = await prisma.user.findMany({
    where: {
      username: {
        in: users.map((user) => user.username),
      },
    },
    select: {
      id: true,
      username: true,
    },
  });

  if (dbUsers.length !== users.length) {
    throw new Error("Cannot create E2E battle before all users exist.");
  }

  const soundPack = await ensureDemoSoundPack();
  const battle = await prisma.battle.create({
    data: {
      title,
      mode: "beatmaking_strict",
      source: "MATCHMAKING",
      status,
      isPrivate: false,
      maxPlayers: users.length,
      durationMinutes: 20,
      createdById: dbUsers[0].id,
      soundPackId: soundPack.id,
      createdAt,
      participants: {
        create: dbUsers.map((user) => ({
          userId: user.id,
        })),
      },
    },
    include: {
      participants: {
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
      },
    },
  });

  return battle;
}

export async function seedSubmissionsForBattle(battleId: string) {
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
    orderBy: {
      joinedAt: "asc",
    },
  });

  await Promise.all(
    participants.map((participant, index) =>
      prisma.battleSubmission.upsert({
        where: {
          battleId_participantId: {
            battleId,
            participantId: participant.id,
          },
        },
        update: {
          fileUrl: "/demo-audio/demo-loop-1.mp3",
          fileName: `${participant.user.username}-submission.mp3`,
          mimeType: "audio/mpeg",
          sizeBytes: 1728172,
        },
        create: {
          battleId,
          userId: participant.userId,
          participantId: participant.id,
          fileUrl:
            index % 2 === 0
              ? "/demo-audio/demo-loop-1.mp3"
              : "/demo-audio/demo-melody-1.mp3",
          fileName: `${participant.user.username}-submission.mp3`,
          mimeType: "audio/mpeg",
          sizeBytes: 1728172,
        },
      }),
    ),
  );

  await prisma.battleParticipant.updateMany({
    where: {
      battleId,
    },
    data: {
      beatUrl: "/demo-audio/demo-loop-1.mp3",
      submittedAt: new Date(),
    },
  });
}

export async function moveBattleToVoting(battleId: string) {
  await prisma.battle.update({
    where: {
      id: battleId,
    },
    data: {
      status: BattleStatus.VOTING,
    },
  });
}

export async function createOldBattleForUser({
  user,
  status,
  hoursOld,
}: {
  user: E2ETestUser;
  status: BattleStatus;
  hoursOld: number;
}) {
  return createBattleForUsers({
    users: [user],
    status,
    title: `Old ${status} E2E battle`,
    createdAt: new Date(Date.now() - hoursOld * 60 * 60 * 1000),
  });
}
