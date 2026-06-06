import { prisma } from "@/lib/prisma";

async function main() {
  const avatarResult = await prisma.user.updateMany({
    where: {
      OR: [
        {
          avatarUrl: {
            startsWith: "/uploads/",
          },
        },
        {
          avatarUrl: {
            startsWith: "/demo-audio/",
          },
        },
        {
          avatarUrl: {
            startsWith: "http://localhost",
          },
        },
      ],
    },
    data: {
      avatarUrl: null,
    },
  });
  const localRapBeatResult = await prisma.rapBeat.updateMany({
    where: {
      fileUrl: {
        startsWith: "/demo-audio/",
      },
    },
    data: {
      isApprovedForRapPool: false,
      analysisStatus: "FAILED",
    },
  });

  console.info("Local URL cleanup complete", {
    avatarUrlsCleared: avatarResult.count,
    localRapBeatsDisabled: localRapBeatResult.count,
  });
}

main()
  .catch((error) => {
    console.error("Local URL cleanup failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
