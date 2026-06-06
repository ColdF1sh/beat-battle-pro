import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { rateLimit } from "@/lib/api/rate-limit";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: {
          label: "Email or username",
          type: "text",
          placeholder: "test@example.com",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials, request) {
        const limit = rateLimit(request, {
          route: "auth:login",
          windowMs: 10 * 60 * 1000,
          maxRequests: 10,
        });

        if (!limit.allowed) {
          throw new Error("Too many login attempts. Please try again later.");
        }

        const parsed = loginSchema.safeParse(credentials);

        if (!parsed.success) {
          throw new Error("Please enter your email or username and password.");
        }

        const identifier = parsed.data.identifier.toLowerCase();

        const user = await prisma.user.findFirst({
          where: {
            OR: [{ email: identifier }, { username: identifier }],
          },
          select: {
            id: true,
            email: true,
            username: true,
            passwordHash: true,
            displayName: true,
            avatarUrl: true,
            eloRating: true,
            producerElo: true,
            rapElo: true,
          },
        });

        if (!user) {
          throw new Error("Invalid email, username, or password.");
        }

        const isPasswordValid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );

        if (!isPasswordValid) {
          throw new Error("Invalid email, username, or password.");
        }

        return {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          eloRating: user.eloRating,
          producerElo: user.producerElo,
          rapElo: user.rapElo,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.displayName = user.displayName;
        token.avatarUrl = user.avatarUrl;
        token.eloRating = user.eloRating;
        token.producerElo = user.producerElo;
        token.rapElo = user.rapElo;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.displayName = token.displayName;
        session.user.avatarUrl = token.avatarUrl;
        session.user.eloRating = token.eloRating;
        session.user.producerElo = token.producerElo;
        session.user.rapElo = token.rapElo;
      }

      return session;
    },
  },
};

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      eloRating: true,
      producerElo: true,
      rapElo: true,
    },
  });

  return user;
}
