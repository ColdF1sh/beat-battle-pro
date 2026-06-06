import { NextRequest, NextResponse } from "next/server";

import { validateSearchParams } from "@/lib/api/validation";
import { prisma } from "@/lib/prisma";
import {
  getProducerRankName,
  getRankFromElo,
  getRapRankName,
} from "@/lib/ranking/elo-config";
import { leaderboardQuerySchema } from "@/lib/validations/leaderboard";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const query = validateSearchParams(
      request.nextUrl.searchParams,
      leaderboardQuerySchema,
    );

    if (!query.success) {
      return query.response;
    }

    const { category, limit } = query.data;
    const leaderboardCategory = category === "rap" ? "rap" : "beatmaking";
    let normalizedUsers: Array<{
      username: string;
      avatarUrl: string | null;
      eloRating: number;
      wins: number;
      games: number;
    }>;

    if (leaderboardCategory === "rap") {
      const users = await prisma.user.findMany({
            take: limit,
            where: {
              rapElo: {
                not: null,
              },
            },
            orderBy: [
              {
                rapElo: "desc",
              },
              {
                rapWins: "desc",
              },
              {
                username: "asc",
              },
            ],
            select: {
              username: true,
              avatarUrl: true,
              rapElo: true,
              rapWins: true,
              rapGames: true,
            },
          });

      normalizedUsers = users.map((user) => ({
        username: user.username,
        avatarUrl: user.avatarUrl,
        eloRating: user.rapElo ?? 0,
        wins: user.rapWins,
        games: user.rapGames,
      }));
    } else {
      const users = await prisma.user.findMany({
        take: limit,
        where: {
          producerElo: {
            not: null,
          },
        },
        orderBy: [
          {
            producerElo: "desc",
          },
          {
            producerWins: "desc",
          },
          {
            username: "asc",
          },
        ],
        select: {
          username: true,
          avatarUrl: true,
          producerElo: true,
          producerWins: true,
          producerGames: true,
        },
      });

      normalizedUsers = users.map((user) => ({
        username: user.username,
        avatarUrl: user.avatarUrl,
        eloRating: user.producerElo ?? 0,
        wins: user.producerWins,
        games: user.producerGames,
      }));
    }

    const players = normalizedUsers.map((user, index) => {
      const battlesPlayed = user.games;
      const winrate =
        battlesPlayed > 0
          ? Math.round((user.wins / battlesPlayed) * 1000) / 10
          : 0;

      return {
        rank: index + 1,
        username: user.username,
        avatarUrl: user.avatarUrl,
        eloRating: user.eloRating,
        rankTitle:
          leaderboardCategory === "rap"
            ? getRapRankName(getRankFromElo(user.eloRating).name)
            : getProducerRankName(getRankFromElo(user.eloRating).name),
        wins: user.wins,
        battlesPlayed,
        winrate,
      };
    });

    const response = NextResponse.json({
      category: leaderboardCategory,
      players,
    });

    if (process.env.NODE_ENV !== "production") {
      console.debug("leaderboard query timing", {
        category: leaderboardCategory,
        count: players.length,
        elapsedMs: Date.now() - startedAt,
      });
    }

    return response;
  } catch (error) {
    console.error("Failed to load leaderboard", error);

    return NextResponse.json(
      {
        error: "Failed to load leaderboard.",
      },
      { status: 500 },
    );
  }
}
