import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      displayName?: string | null;
      avatarUrl: string | null;
      eloRating: number;
      producerElo: number | null;
      rapElo: number | null;
    } & DefaultSession["user"];
  }

  interface User {
    username: string;
    displayName?: string | null;
    avatarUrl: string | null;
    eloRating: number;
    producerElo: number | null;
    rapElo: number | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    displayName?: string | null;
    avatarUrl: string | null;
    eloRating: number;
    producerElo: number | null;
    rapElo: number | null;
  }
}
