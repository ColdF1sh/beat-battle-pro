import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import {
  ApiAccessError,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import { prisma } from "@/lib/prisma";

const maxAvatarSizeBytes = 5 * 1024 * 1024;
const allowedAvatarTypes = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("Avatar file is required.", 400);
    }

    const extension = allowedAvatarTypes.get(file.type);

    if (!extension) {
      return jsonError("Avatar must be a PNG, JPG, JPEG, or WEBP image.", 400);
    }

    if (file.size > maxAvatarSizeBytes) {
      return jsonError("Avatar must be 5MB or smaller.", 400);
    }

    const uploadsDirectory = path.join(
      process.cwd(),
      "public",
      "uploads",
      "avatars",
    );
    await mkdir(uploadsDirectory, { recursive: true });

    const fileName = `${user.id}-${randomUUID()}${extension}`;
    const filePath = path.join(uploadsDirectory, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const avatarUrl = `/uploads/avatars/${fileName}`;

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        avatarUrl,
      },
    });

    return NextResponse.json({
      status: "success",
      avatarUrl,
    });
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Avatar upload failed", error);

    return jsonError("Failed to upload avatar.", 500);
  }
}
