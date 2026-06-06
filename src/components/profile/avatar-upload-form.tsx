"use client";

import { ImagePlusIcon, Loader2Icon, MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import Cropper, { type Area } from "react-easy-crop";

type AvatarUploadFormProps = {
  isCurrentUser: boolean;
  username?: string;
};

const maxAvatarSizeBytes = 5 * 1024 * 1024;
const cropSize = 512;
const minZoom = 1;
const maxZoom = 3;
const allowedAvatarTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function validateFile(file: File) {
  if (!allowedAvatarTypes.has(file.type)) {
    return "Avatar must be a PNG, JPG, JPEG, or WEBP image.";
  }

  if (file.size > maxAvatarSizeBytes) {
    return "Avatar must be 5MB or smaller.";
  }

  return null;
}

async function loadImage(previewUrl: string) {
  const image = new Image();
  image.src = previewUrl;
  await image.decode();

  return image;
}

async function cropToSquareFile(
  file: File,
  previewUrl: string,
  croppedAreaPixels: Area,
) {
  const image = await loadImage(previewUrl);
  const canvas = document.createElement("canvas");
  canvas.width = cropSize;
  canvas.height = cropSize;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not prepare avatar crop.");
  }

  context.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    cropSize,
    cropSize,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, file.type === "image/png" ? "image/png" : "image/webp", 0.92);
  });

  if (!blob) {
    throw new Error("Could not crop avatar.");
  }

  const extension = file.type === "image/png" ? "png" : "webp";
  return new File([blob], `avatar.${extension}`, {
    type: blob.type,
  });
}

export function AvatarUploadForm({
  isCurrentUser,
  username = "Upload avatar",
}: AvatarUploadFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  if (!isCurrentUser) {
    return null;
  }

  function openPicker() {
    inputRef.current?.click();
  }

  function clearSelection() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(null);
    setPreviewUrl(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setIsUploading(false);
  }

  async function uploadSelectedAvatar() {
    if (!selectedFile || !previewUrl) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const croppedFile = await cropToSquareFile(
        selectedFile,
        previewUrl,
        croppedAreaPixels ?? {
          x: 0,
          y: 0,
          width: cropSize,
          height: cropSize,
        },
      );
      const formData = new FormData();
      formData.append("file", croppedFile);

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as
        | { status: "success"; avatarUrl: string }
        | { error?: string }
        | null;

      if (!response.ok || !data || !("status" in data)) {
        setError(
          data && "error" in data && data.error
            ? data.error
            : "Could not upload avatar.",
        );
        return;
      }

      clearSelection();
      router.refresh();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload avatar.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";

          if (!file) {
            return;
          }

          const validationError = validateFile(file);

          if (validationError) {
            setError(validationError);
            return;
          }

          setError(null);
          setSelectedFile(file);
          setCrop({ x: 0, y: 0 });
          setZoom(1);
          setCroppedAreaPixels(null);
          setPreviewUrl(URL.createObjectURL(file));
        }}
      />
      <button
        type="button"
        onClick={openPicker}
        className="absolute inset-0 rounded-full outline-none transition hover:bg-black/20 focus-visible:ring-2 focus-visible:ring-[var(--bb-toxic)]"
        aria-label="Upload avatar"
      />
      <button
        type="button"
        onClick={openPicker}
        className="absolute bottom-0 right-0 z-10 flex size-10 items-center justify-center border border-[var(--bb-toxic)] bg-[var(--bb-toxic)] text-zinc-950 shadow-[5px_5px_0_rgba(0,0,0,0.55)] transition hover:-translate-x-0.5 hover:-translate-y-0.5"
        aria-label="Upload avatar"
      >
        <ImagePlusIcon className="size-4" />
      </button>
      {error && !previewUrl ? (
        <p className="absolute -bottom-8 left-0 w-64 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      {previewUrl && typeof document !== "undefined"
        ? createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/88 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-4xl overflow-visible bg-[#111] p-4 text-white shadow-[18px_18px_0_rgba(0,0,0,0.72),0_30px_100px_rgba(0,0,0,0.7)] sm:p-5">
            <div className="absolute inset-0 pointer-events-none border border-white/10" />
            <div className="absolute inset-2 pointer-events-none border border-dashed border-white/10" />
            <div className="relative z-10 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-3xl font-black leading-none tracking-[-0.04em] text-white sm:text-4xl">
                  {username}
                </h2>
                <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-zinc-200 sm:text-base">
                  For best results, upload images of at least 1000x1000 pixels.
                  5MB file-size limit.
                </p>
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="flex size-9 items-center justify-center border border-white/10 bg-white/[0.04] text-zinc-100 transition hover:bg-white/10"
              >
                <XIcon className="size-4" />
              </button>
            </div>

            <div className="relative z-10 mx-auto mt-6 aspect-square w-[min(74vw,34rem)] overflow-hidden rounded-full bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.09),0_18px_70px_rgba(0,0,0,0.55)]">
              <Cropper
                image={previewUrl}
                crop={crop}
                zoom={zoom}
                minZoom={minZoom}
                maxZoom={maxZoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                objectFit="cover"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
              />
            </div>

            {error ? (
              <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </p>
            ) : null}

            <div className="relative z-10 mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3 md:flex-1">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => setZoom((current) => Math.max(minZoom, current - 0.1))}
                  className="flex size-11 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-white transition hover:bg-zinc-700 disabled:opacity-50"
                  aria-label="Zoom out"
                >
                  <MinusIcon className="size-4" />
                </button>
                <input
                  type="range"
                  min={minZoom}
                  max={maxZoom}
                  step={0.01}
                  value={zoom}
                  disabled={isUploading}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="h-2 w-full max-w-sm accent-white"
                  aria-label="Avatar zoom"
                />
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => setZoom((current) => Math.min(maxZoom, current + 0.1))}
                  className="flex size-11 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-white transition hover:bg-zinc-700 disabled:opacity-50"
                  aria-label="Zoom in"
                >
                  <PlusIcon className="size-4" />
                </button>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={clearSelection}
                  className="h-11 rounded-md bg-zinc-800 px-5 text-sm font-black text-white transition hover:bg-zinc-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={uploadSelectedAvatar}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-black text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
                >
                  {isUploading ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : null}
                  {isUploading ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>,
          document.body,
        )
        : null}
    </>
  );
}
