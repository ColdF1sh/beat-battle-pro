export const MAX_AUDIO_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_AUDIO_MIME_TYPES = new Set(["audio/mpeg"]);

export const ALLOWED_AUDIO_EXTENSIONS = new Set([".mp3"]);

export type AudioFileValidationResult =
  | {
      success: true;
    }
  | {
      success: false;
      status: number;
      message: string;
    };

function getFileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex === -1) {
    return "";
  }

  return fileName.slice(dotIndex).toLowerCase();
}

export function validateAudioUploadFile(file: File): AudioFileValidationResult {
  const extension = getFileExtension(file.name);

  if (!ALLOWED_AUDIO_EXTENSIONS.has(extension)) {
    return {
      success: false,
      status: 400,
      message: "Only MP3 files are allowed.",
    };
  }

  if (!ALLOWED_AUDIO_MIME_TYPES.has(file.type)) {
    return {
      success: false,
      status: 400,
      message: "Only MP3 audio files are allowed.",
    };
  }

  if (file.size > MAX_AUDIO_UPLOAD_SIZE_BYTES) {
    return {
      success: false,
      status: 400,
      message: "Audio submissions must be 10MB or smaller.",
    };
  }

  if (file.size === 0) {
    return {
      success: false,
      status: 400,
      message: "Uploaded audio file cannot be empty.",
    };
  }

  return {
    success: true,
  };
}
