import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const globalLibraryPrefix = process.env.R2_GLOBAL_LIBRARY_PREFIX ?? "Global Library/";
const soundPackName = process.env.R2_GLOBAL_SOUND_PACK_NAME ?? "R2 Global Library";

function getFileNameFromKey(key: string) {
  const baseName = key.split("/").pop() ?? key;
  return path.parse(baseName).name;
}

function isBeatKey(key: string, normalizeFolderName: (folderName: string) => string) {
  return key
    .split("/")
    .slice(0, -1)
    .map((segment) => normalizeFolderName(segment))
    .some((segment) =>
      ["beat", "beats", "rap_beat", "rap_beats"].includes(segment),
    );
}

async function main() {
  const [
    { prisma },
    { getStoragePublicUrl, listStorageObjects },
    { detectSoundCategory, normalizeFolderName },
    { validateSoundFile },
  ] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/storage/s3"),
    import("@/lib/sound-library/categories"),
    import("@/lib/sound-library/custom-pack-parser"),
  ]);

  try {
    const objects = await listStorageObjects(globalLibraryPrefix);
    const existingSoundPack = await prisma.soundPack.findFirst({
      where: {
        name: soundPackName,
      },
      select: {
        id: true,
      },
    });
    const soundPack = existingSoundPack
      ? await prisma.soundPack.update({
          where: {
            id: existingSoundPack.id,
          },
          data: {
            isActive: true,
          },
          select: {
            id: true,
          },
        })
      : await prisma.soundPack.create({
          data: {
            name: soundPackName,
            description: "Cloudflare R2 Global Library registry.",
            isActive: true,
          },
          select: {
            id: true,
          },
        });
    let importedSounds = 0;
    let importedBeats = 0;
    let skipped = 0;
    let errors = 0;

    for (const object of objects) {
      const fileName = object.key.split("/").pop() ?? object.key;
      const validation = validateSoundFile(fileName);

      if (!validation.isValid) {
        skipped += 1;
        continue;
      }

      const fileUrl = getStoragePublicUrl(object.key);
      const title = getFileNameFromKey(object.key);

      if (fileUrl.startsWith("/demo-audio/")) {
        skipped += 1;
        console.warn("Skipping local demo URL during R2 import", {
          key: object.key,
          fileUrl,
        });
        continue;
      }

      try {
        if (isBeatKey(object.key, normalizeFolderName)) {
          await prisma.rapBeat.upsert({
            where: {
              fileUrl,
            },
            update: {
              fileName: title,
              title,
              analysisStatus: "PENDING",
              analysisSource: null,
              producerUsername: "test_user",
              isApprovedForRapPool: true,
            },
            create: {
              fileUrl,
              fileName: title,
              title,
              analysisStatus: "PENDING",
              producerUsername: "test_user",
              isApprovedForRapPool: true,
            },
          });
          importedBeats += 1;
          continue;
        }

        const category = detectSoundCategory(
          object.key.split("/").slice(-2, -1)[0] ?? "",
        );
        const existingSound = await prisma.soundPackSound.findFirst({
          where: {
            soundPackId: soundPack.id,
            fileUrl,
          },
          select: {
            id: true,
          },
        });

        if (existingSound) {
          await prisma.soundPackSound.update({
            where: {
              id: existingSound.id,
            },
            data: {
              name: title,
              fileType: category,
              sizeBytes: object.sizeBytes,
            },
          });
        } else {
          await prisma.soundPackSound.create({
            data: {
              soundPackId: soundPack.id,
              name: title,
              fileUrl,
              fileType: category,
              sizeBytes: object.sizeBytes,
            },
          });
        }

        importedSounds += 1;
      } catch (error) {
        errors += 1;
        console.error("Could not import R2 library object", {
          key: object.key,
          fileUrl,
          error,
        });
      }
    }

    console.info("R2 Global Library import complete", {
      prefix: globalLibraryPrefix,
      totalScanned: objects.length,
      importedSounds,
      importedBeats,
      skipped,
      errors,
      soundPackName,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("R2 Global Library import failed", error);
  process.exit(1);
});
