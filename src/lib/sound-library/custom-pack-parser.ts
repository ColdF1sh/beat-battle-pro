import path from "node:path";

import {
  detectSoundCategory,
  normalizeFolderName,
  type SoundLibraryCategory,
} from "@/lib/sound-library/categories";

export const allowedSoundFileExtensions = [
  ".mp3",
  ".wav",
  ".flac",
  ".aiff",
  ".aif",
  ".ogg",
  ".m4a",
] as const;

export type ValidatedSoundFile = {
  isValid: boolean;
  extension: string;
  mimeType: string;
};

export function getAudioMimeType(extension: string) {
  switch (extension.toLowerCase()) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".flac":
      return "audio/flac";
    case ".aiff":
    case ".aif":
      return "audio/aiff";
    case ".ogg":
      return "audio/ogg";
    case ".m4a":
      return "audio/mp4";
    default:
      return "application/octet-stream";
  }
}

export function validateSoundFile(fileName: string): ValidatedSoundFile {
  const extension = path.extname(fileName).toLowerCase();

  return {
    isValid: allowedSoundFileExtensions.includes(
      extension as (typeof allowedSoundFileExtensions)[number],
    ),
    extension,
    mimeType: getAudioMimeType(extension),
  };
}

export function detectCategoryFromPath(filePath: string): SoundLibraryCategory {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const parentFolder = normalizedPath.split("/").slice(-2, -1)[0] ?? "";

  return detectSoundCategory(parentFolder);
}

export function summarizeLibraryByCategory<T extends { category: string }>(
  sounds: T[],
) {
  return sounds.reduce<Record<string, number>>((summary, sound) => {
    summary[sound.category] = (summary[sound.category] ?? 0) + 1;

    return summary;
  }, {});
}

export { normalizeFolderName };
