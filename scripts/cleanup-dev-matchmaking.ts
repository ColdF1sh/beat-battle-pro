import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type DeleteDelegate = {
  deleteMany: () => Promise<{ count: number }>;
};

const cleanupTargets = [
  ["matchmakingQueue", "MatchmakingQueue"],
  ["battleSubmission", "BattleSubmission"],
  ["vote", "Vote"],
  ["battleParticipant", "BattleParticipant"],
  ["battle", "Battle"],
] as const;

function hasDeleteMany(value: unknown): value is DeleteDelegate {
  return (
    typeof value === "object" &&
    value !== null &&
    "deleteMany" in value &&
    typeof value.deleteMany === "function"
  );
}

async function deleteModel(modelName: string, label: string) {
  const client = prisma as unknown as Record<string, unknown>;
  const model = client[modelName];

  if (!hasDeleteMany(model)) {
    console.log(`${label}: skipped because model is not available.`);
    return;
  }

  const result = await model.deleteMany();
  console.log(`${label}: deleted ${result.count}`);
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to clean matchmaking data in production.");
  }

  console.log(
    `Cleaning development matchmaking data. NODE_ENV=${process.env.NODE_ENV ?? "development"}`,
  );

  for (const [modelName, label] of cleanupTargets) {
    await deleteModel(modelName, label);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
