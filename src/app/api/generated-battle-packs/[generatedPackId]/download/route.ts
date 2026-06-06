import { NextResponse } from "next/server";
import JSZip from "jszip";

import { prisma } from "@/lib/prisma";

type GeneratedPackDownloadRouteProps = {
  params: Promise<{
    generatedPackId: string;
  }>;
};

const mimeTypeExtensions = new Map([
  ["audio/mpeg", ".mp3"],
  ["audio/mp3", ".mp3"],
  ["audio/wav", ".wav"],
  ["audio/x-wav", ".wav"],
  ["audio/flac", ".flac"],
  ["audio/x-flac", ".flac"],
]);

const categorySlugByKey = new Map([
  ["BASS_808", "808"],
  ["HI_HAT", "hi_hat"],
  ["OPEN_HAT", "open_hat"],
]);

function getExtensionFromName(fileName: string | null | undefined) {
  if (!fileName) {
    return null;
  }

  const match = fileName.match(/\.[a-z0-9]+$/i);

  return match ? match[0].toLowerCase() : null;
}

function getExtension(sound: {
  originalFileName: string;
  fileUrl: string;
  mimeType: string | null;
}) {
  return (
    getExtensionFromName(sound.originalFileName) ??
    getExtensionFromName(sound.fileUrl.split("?")[0]) ??
    (sound.mimeType ? mimeTypeExtensions.get(sound.mimeType.toLowerCase()) : null) ??
    ".mp3"
  );
}

function getCategorySlug(category: string) {
  const mappedSlug = categorySlugByKey.get(category);

  if (mappedSlug) {
    return mappedSlug;
  }

  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function GET(
  _request: Request,
  { params }: GeneratedPackDownloadRouteProps,
) {
  const { generatedPackId } = await params;
  const generatedPack = await prisma.generatedBattlePack.findUnique({
    where: {
      id: generatedPackId,
    },
    include: {
      sounds: {
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  if (!generatedPack) {
    return NextResponse.json(
      { error: "Generated pack not found." },
      { status: 404 },
    );
  }

  if (generatedPack.sounds.length === 0) {
    return NextResponse.json(
      { error: "Generated pack has no sounds to download." },
      { status: 400 },
    );
  }

  try {
    const zip = new JSZip();

    for (const [index, sound] of generatedPack.sounds.entries()) {
      const response = await fetch(new URL(sound.fileUrl, process.env.NEXTAUTH_URL));

      if (!response.ok) {
        throw new Error(`Failed to fetch ${sound.fileName}`);
      }

      const buffer = await response.arrayBuffer();
      const safeCategory = getCategorySlug(sound.category) || "sound";
      const extension = getExtension(sound);
      const archiveFileName = `sound_${String(index + 1).padStart(
        2,
        "0",
      )}_${safeCategory}${extension}`;

      zip.file(archiveFileName, buffer);
    }

    const archive = await zip.generateAsync({ type: "nodebuffer" });
    const body = archive.buffer.slice(
      archive.byteOffset,
      archive.byteOffset + archive.byteLength,
    ) as ArrayBuffer;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="generated-pack.zip"',
      },
    });
  } catch (error) {
    console.error("Generated pack archive error:", error);

    return NextResponse.json(
      { error: "Could not generate battle pack archive." },
      { status: 500 },
    );
  }
}
