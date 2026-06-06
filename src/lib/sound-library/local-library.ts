import fs from "node:fs";
import path from "node:path";

import type { SoundLibraryCategory } from "@/lib/sound-library/categories";
import { detectSoundCategory } from "@/lib/sound-library/categories";
import { isLocalAudioUrl, requireRemoteAudioUrlInProduction } from "@/lib/audio-url";
import {
  getAudioMimeType,
  validateSoundFile,
} from "@/lib/sound-library/custom-pack-parser";

export type GlobalLocalSound = {
  id: string;
  originalFileName: string;
  fileName: string;
  fileUrl: string;
  category: SoundLibraryCategory;
  source: "GLOBAL_LOCAL" | "R2_LIBRARY" | "DB_LIBRARY";
  sizeBytes: number;
  mimeType: string;
};

export type GlobalLocalRapBeat = {
  id: string;
  fileName: string;
  fileUrl: string;
  sizeBytes: number;
  mimeType: string;
};

const globalLibraryRelativePath = path.join(
  "public",
  "demo-audio",
  "Global Library",
);
let hasWarnedLocalDemoDisabled = false;
const warnedRemoteLocalUrls = new Set<string>();

export function isLocalDemoAudioAllowed() {
  return process.env.ENABLE_LOCAL_DEMO_AUDIO === "true";
}

function warnLocalDemoDisabled() {
  if (hasWarnedLocalDemoDisabled) {
    return;
  }

  hasWarnedLocalDemoDisabled = true;
  console.warn(
    "Local demo audio is disabled. Set ENABLE_LOCAL_DEMO_AUDIO=true for local dev fixtures.",
  );
}

function isRemoteLikeEnvironment() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "test-server" ||
    Boolean(process.env.VERCEL || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT)
  );
}

export function warnIfR2UsesLocalDemoAudio(fileUrl: string, context: string) {
  if (!isLocalAudioUrl(fileUrl) || !isRemoteLikeEnvironment()) {
    return;
  }

  if (warnedRemoteLocalUrls.has(`${context}:${fileUrl}`)) {
    return;
  }

  warnedRemoteLocalUrls.add(`${context}:${fileUrl}`);
  requireRemoteAudioUrlInProduction(fileUrl, context);
}

export function getGlobalLibraryPath() {
  return path.join(process.cwd(), globalLibraryRelativePath);
}

export function getGlobalRapBeatPath() {
  return path.join(getGlobalLibraryPath(), "Beat");
}

function toPublicUrl(filePath: string) {
  const relativePath = path
    .relative(path.join(process.cwd(), "public"), filePath)
    .split(path.sep)
    .join("/");

  return `/${relativePath}`;
}

function createSoundId(fileUrl: string) {
  return fileUrl
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function scanGlobalLocalLibrary(): GlobalLocalSound[] {
  if (!isLocalDemoAudioAllowed()) {
    warnLocalDemoDisabled();
    return [];
  }

  const libraryPath = getGlobalLibraryPath();

  if (!fs.existsSync(libraryPath)) {
    return [];
  }

  const sounds: GlobalLocalSound[] = [];
  const folderEntries = fs.readdirSync(libraryPath, {
    withFileTypes: true,
  });

  for (const folderEntry of folderEntries) {
    if (!folderEntry.isDirectory()) {
      continue;
    }

    const category = detectSoundCategory(folderEntry.name);
    const folderPath = path.join(libraryPath, folderEntry.name);
    const fileEntries = fs.readdirSync(folderPath, {
      withFileTypes: true,
    });

    for (const fileEntry of fileEntries) {
      if (!fileEntry.isFile()) {
        continue;
      }

      const validation = validateSoundFile(fileEntry.name);

      if (!validation.isValid) {
        continue;
      }

      const filePath = path.join(folderPath, fileEntry.name);
      const stats = fs.statSync(filePath);
      const fileUrl = toPublicUrl(filePath);

      sounds.push({
        id: createSoundId(fileUrl),
        originalFileName: fileEntry.name,
        fileName: path.parse(fileEntry.name).name,
        fileUrl,
        category,
        source: "GLOBAL_LOCAL",
        sizeBytes: stats.size,
        mimeType: getAudioMimeType(validation.extension),
      });
    }
  }

  return sounds.sort((left, right) =>
    `${left.category}:${left.fileName}`.localeCompare(
      `${right.category}:${right.fileName}`,
    ),
  );
}

export function scanGlobalLocalRapBeats(): GlobalLocalRapBeat[] {
  if (!isLocalDemoAudioAllowed()) {
    warnLocalDemoDisabled();
    return [];
  }

  const beatPath = getGlobalRapBeatPath();

  if (!fs.existsSync(beatPath)) {
    return [];
  }

  return fs
    .readdirSync(beatPath, {
      withFileTypes: true,
    })
    .filter((fileEntry) => fileEntry.isFile())
    .flatMap((fileEntry) => {
      const validation = validateSoundFile(fileEntry.name);

      if (!validation.isValid) {
        return [];
      }

      const filePath = path.join(beatPath, fileEntry.name);
      const stats = fs.statSync(filePath);
      const fileUrl = toPublicUrl(filePath);

      return [
        {
          id: createSoundId(fileUrl),
          fileName: path.parse(fileEntry.name).name,
          fileUrl,
          sizeBytes: stats.size,
          mimeType: getAudioMimeType(validation.extension),
        },
      ];
    })
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
}
