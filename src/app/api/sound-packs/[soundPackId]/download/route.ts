import { NextResponse } from "next/server";
import JSZip from "jszip";

import { prisma } from "@/lib/prisma";

type SoundPackDownloadRouteProps = {
  params: Promise<{
    soundPackId: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: SoundPackDownloadRouteProps,
) {
  const { soundPackId } = await params;
  const soundPack = await prisma.soundPack.findUnique({
    where: {
      id: soundPackId,
    },
    include: {
      sounds: true,
    },
  });

  if (!soundPack) {
    return NextResponse.json({ error: "Sound pack not found." }, { status: 404 });
  }

  if (soundPack.sounds.length === 0) {
    return NextResponse.json(
      { error: "Sound pack has no sounds to download." },
      { status: 400 },
    );
  }

  try {
    const zip = new JSZip();

    for (const sound of soundPack.sounds) {
      const response = await fetch(new URL(sound.fileUrl, process.env.NEXTAUTH_URL));

      if (!response.ok) {
        throw new Error(`Failed to fetch ${sound.name}`);
      }

      const buffer = await response.arrayBuffer();
      const extension = sound.fileType ? `.${sound.fileType.replace(".", "")}` : "";
      const safeName = `${sound.name.replace(/[^a-z0-9-_ ]/gi, "_")}${extension}`;

      zip.file(safeName, buffer);
    }

    const archive = await zip.generateAsync({ type: "nodebuffer" });
    const safePackName = soundPack.name.replace(/[^a-z0-9-_ ]/gi, "_");
    const body = archive.buffer.slice(
      archive.byteOffset,
      archive.byteOffset + archive.byteLength,
    ) as ArrayBuffer;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safePackName}.zip"`,
      },
    });
  } catch (error) {
    console.error("Sound pack archive error:", error);

    return NextResponse.json(
      { error: "Could not generate sound pack archive." },
      { status: 500 },
    );
  }
}
