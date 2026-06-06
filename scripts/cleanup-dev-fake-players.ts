import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const fakeUsernames = [
  "dev_fake_player_1",
  "dev_fake_player_2",
  "dev_fake_player_3",
  "dev_fake_player_4",
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to clean dev fake player data in production.");
  }

  const fakeUsers = await prisma.user.findMany({
    where: {
      username: {
        in: fakeUsernames,
      },
    },
    select: {
      id: true,
    },
  });
  const fakeUserIds = fakeUsers.map((user) => user.id);

  if (fakeUserIds.length === 0) {
    console.log("No dev fake users found.");
    return;
  }

  const fakeBattleIds = await prisma.battleParticipant
    .findMany({
      where: {
        userId: {
          in: fakeUserIds,
        },
      },
      select: {
        battleId: true,
      },
      distinct: ["battleId"],
    })
    .then((participants) =>
      participants.map((participant) => participant.battleId),
    );

  const deletedQueues = await prisma.matchmakingQueue.deleteMany({
    where: {
      userId: {
        in: fakeUserIds,
      },
    },
  });

  const deletedBattles =
    fakeBattleIds.length > 0
      ? await prisma.battle.deleteMany({
          where: {
            id: {
              in: fakeBattleIds,
            },
          },
        })
      : { count: 0 };

  console.log(`Fake matchmaking queues deleted: ${deletedQueues.count}`);
  console.log(`Fake battles deleted: ${deletedBattles.count}`);
  console.log("Fake user accounts were kept for reuse.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
