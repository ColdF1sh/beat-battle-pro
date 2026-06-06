"use client";

import { FileAudioIcon, UploadCloudIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { useRef, useState } from "react";

import { SubmissionAudioPlayer } from "@/components/audio/submission-audio-player";
import { Button } from "@/components/ui/button";
import { gameButtonClassName } from "@/components/ui/game-button";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

type Submission = {
  id: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type SubmissionUploadFormProps = {
  battleId: string;
  currentSubmission?: Submission | null;
  canSubmit: boolean;
};

type UploadResponse =
  | {
      status: "success";
      submission: Submission;
    }
  | {
      error?: string;
    };

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

export function SubmissionUploadForm({
  battleId,
  currentSubmission,
  canSubmit,
}: SubmissionUploadFormProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(
    currentSubmission ?? null,
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function selectFile(file: File | null) {
    setError(null);
    setSuccessMessage(null);

    if (file && !file.name.toLowerCase().endsWith(".mp3")) {
      setSelectedFile(null);
      setError("Only MP3 files are allowed.");
      return;
    }

    if (file && file.size > MAX_FILE_SIZE_BYTES) {
      setSelectedFile(null);
      setError("Audio submissions must be 10MB or smaller.");
      return;
    }

    setSelectedFile(file);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0] ?? null);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (canSubmit && !isUploading) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);

    if (!canSubmit || isUploading) {
      return;
    }

    selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit || isUploading) {
      return;
    }

    if (!selectedFile) {
      setError("Please choose an audio file to upload.");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError("Audio submissions must be 10MB or smaller.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(`/api/battles/${battleId}/submission`, {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as
        | UploadResponse
        | null;

      if (!response.ok || !data || !("status" in data)) {
        setError(
          data && "error" in data && data.error
            ? data.error
            : "Upload failed. Please try again.",
        );
        return;
      }

      setSubmission(data.submission);
      setSelectedFile(null);
      setSuccessMessage("Submission uploaded successfully.");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      router.refresh();
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form
      className="space-y-4"
      data-testid="submission-upload-form"
      onSubmit={handleSubmit}
    >
      {submission ? (
        <div className="bb-graffiti-texture border border-violet-300/20 bg-gradient-to-br from-violet-300/15 to-fuchsia-400/5 p-4 shadow-[0_0_34px_rgba(168,85,247,0.1)]">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center border border-violet-300/20 bg-violet-300/10 text-violet-100">
              <FileAudioIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-violet-100">
                Current submission
              </p>
              <p className="mt-2 break-all text-sm font-semibold text-white">
                {submission.fileName}
              </p>
              <p className="mt-1 text-xs text-violet-100/70">
                {submission.mimeType} / {formatBytes(submission.sizeBytes)}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <SubmissionAudioPlayer
              fileUrl={submission.fileUrl}
              fileName={submission.fileName}
            />
          </div>
        </div>
      ) : null}

      {!canSubmit ? (
        <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-400">
          Submissions are not open yet.
        </p>
      ) : null}

      <div
        role="button"
        tabIndex={canSubmit && !isUploading ? 0 : -1}
        onClick={() => {
          if (canSubmit && !isUploading) {
            inputRef.current?.click();
          }
        }}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && canSubmit) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "group relative cursor-pointer border border-dashed p-6 text-center transition",
          "bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.14),transparent_44%),rgba(0,0,0,0.24)]",
          canSubmit && !isUploading
            ? "border-violet-300/30 hover:border-fuchsia-200/70 hover:bg-fuchsia-300/10"
            : "cursor-not-allowed border-white/10 opacity-60",
          isDragging &&
            "border-fuchsia-300/80 bg-fuchsia-300/10 shadow-[0_0_42px_rgba(217,70,239,0.18)]",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          data-testid="submission-file-input"
          accept=".mp3,audio/mpeg"
          disabled={!canSubmit || isUploading}
          onChange={handleFileChange}
          className="sr-only"
        />
        <div className="mx-auto flex size-16 items-center justify-center border border-violet-300/25 bg-violet-300/10 text-violet-100 transition group-hover:scale-105 group-hover:text-fuchsia-100">
          <UploadCloudIcon className="size-8" />
        </div>
        <p className="mt-4 text-xl font-black uppercase text-white">
          Drop your MP3 here
        </p>
        <p className="mt-1 text-sm text-zinc-400">or click to choose a file</p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          MP3 only / max 10MB
        </p>
        {selectedFile ? (
          <div className="mx-auto mt-5 max-w-md rounded-xl border border-white/10 bg-black/30 p-3 text-left">
            <p className="break-all text-sm font-semibold text-white">
              {selectedFile.name}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {formatBytes(selectedFile.size)}
            </p>
          </div>
        ) : null}
      </div>

      {isUploading ? (
        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-fuchsia-300" />
          </div>
          <p className="text-sm text-zinc-400">Uploading submission...</p>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {successMessage ? (
        <p className="rounded-lg border border-violet-300/20 bg-violet-300/10 px-3 py-2 text-sm text-violet-100">
          {successMessage}
        </p>
      ) : null}

      <Button
        type="submit"
        data-testid="submission-upload-submit"
        disabled={!canSubmit || isUploading}
        className={gameButtonClassName("primary")}
      >
        <UploadIcon className="size-4" />
        {isUploading
          ? "Uploading..."
          : submission
            ? "Replace Submission"
            : "Upload Submission"}
      </Button>
    </form>
  );
}
