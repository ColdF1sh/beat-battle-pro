import { PrismaClient } from "@prisma/client";
import { stat } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

async function getPublicFileSize(fileUrl: string) {
  const filePath = path.join(process.cwd(), "public", fileUrl.replace(/^\//, ""));
  const file = await stat(filePath);

  return file.size;
}

async function seedDemoStarterPack() {
  const existingPack = await prisma.soundPack.findFirst({
    where: {
      name: "Demo Starter Pack",
    },
    select: {
      id: true,
    },
  });

  if (existingPack) {
    await prisma.soundPack.update({
      where: {
        id: existingPack.id,
      },
      data: {
        isActive: true,
      },
    });

    return;
  }

  await prisma.soundPack.create({
    data: {
      name: "Demo Starter Pack",
      description:
        "Placeholder sounds for local development until real storage is connected.",
      isActive: true,
      sounds: {
        create: [
          {
            name: "Kick Loop",
            fileUrl: "/demo-sounds/kick-loop.wav",
            fileType: "wav",
            sizeBytes: 512000,
          },
          {
            name: "Snare One Shot",
            fileUrl: "/demo-sounds/snare-one-shot.wav",
            fileType: "wav",
            sizeBytes: 196000,
          },
          {
            name: "Melody Stem",
            fileUrl: "/demo-sounds/melody-stem.wav",
            fileType: "wav",
            sizeBytes: 2048000,
          },
        ],
      },
    },
  });
}

async function seedDemoBeatBattlePack() {
  const sounds = [
    {
      name: "Demo Loop 1",
      fileUrl: "/demo-audio/demo-loop-1.mp3",
      fileType: "audio/mpeg",
    },
    {
      name: "Demo Drums 1",
      fileUrl: "/demo-audio/demo-drums-1.wav",
      fileType: "audio/wav",
    },
    {
      name: "Demo Melody 1",
      fileUrl: "/demo-audio/demo-melody-1.mp3",
      fileType: "audio/mpeg",
    },
  ];
  const soundsWithSizes = await Promise.all(
    sounds.map(async (sound) => ({
      ...sound,
      sizeBytes: await getPublicFileSize(sound.fileUrl),
    })),
  );
  const existingPack = await prisma.soundPack.findFirst({
    where: {
      name: "Demo Beat Battle Pack",
    },
    select: {
      id: true,
    },
  });

  if (existingPack) {
    await prisma.$transaction([
      prisma.soundPack.update({
        where: {
          id: existingPack.id,
        },
        data: {
          description: "A local development sound pack using demo audio files.",
          isActive: true,
        },
      }),
      prisma.soundPackSound.deleteMany({
        where: {
          soundPackId: existingPack.id,
        },
      }),
      prisma.soundPackSound.createMany({
        data: soundsWithSizes.map((sound) => ({
          soundPackId: existingPack.id,
          name: sound.name,
          fileUrl: sound.fileUrl,
          fileType: sound.fileType,
          sizeBytes: sound.sizeBytes,
        })),
      }),
    ]);

    return;
  }

  await prisma.soundPack.create({
    data: {
      name: "Demo Beat Battle Pack",
      description: "A local development sound pack using demo audio files.",
      isActive: true,
      sounds: {
        create: soundsWithSizes,
      },
    },
  });
}

async function main() {
  await seedDemoStarterPack();
  await seedDemoBeatBattlePack();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
