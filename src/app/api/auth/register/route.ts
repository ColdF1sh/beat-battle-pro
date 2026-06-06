import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import {
  rateLimit,
  rateLimitResponse,
  withRateLimitHeaders,
} from "@/lib/api/rate-limit";
import { validateJsonBody } from "@/lib/api/validation";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations/auth";

/*
Manual test body:
{
  "email": "test@example.com",
  "username": "test_user",
  "password": "password123"
}
*/

export async function POST(request: Request) {
  try {
    const limit = rateLimit(request, {
      route: "auth:register",
      windowMs: 10 * 60 * 1000,
      maxRequests: 5,
    });

    if (!limit.allowed) {
      return rateLimitResponse(limit);
    }

    const parsedBody = await validateJsonBody(request, registerSchema);

    if (!parsedBody.success) {
      return withRateLimitHeaders(parsedBody.response, limit);
    }

    const parsed = parsedBody.data;
    const email = parsed.email;
    const username = parsed.username;

    const existingEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingEmail) {
      return withRateLimitHeaders(
        NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 409 },
        ),
        limit,
      );
    }

    const existingUsername = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (existingUsername) {
      return withRateLimitHeaders(
        NextResponse.json(
          { error: "This username is already taken." },
          { status: 409 },
        ),
        limit,
      );
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        username: true,
        eloRating: true,
        createdAt: true,
      },
    });

    return withRateLimitHeaders(
      NextResponse.json({ user }, { status: 201 }),
      limit,
    );
  } catch (error) {
    console.error("Registration error:", error);

    return NextResponse.json(
      { error: "Something went wrong while creating your account." },
      { status: 500 },
    );
  }
}
