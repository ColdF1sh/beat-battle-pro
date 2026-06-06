import { getToken } from "next-auth/jwt";
import { type NextRequest, NextResponse } from "next/server";

const protectedRoutes = [
  "/battle",
  "/leaderboard",
  "/shop",
  "/community",
  "/messages",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedRoute =
    pathname === "/profile" ||
    protectedRoutes.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (token) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.href);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/battle/:path*",
    "/leaderboard/:path*",
    "/shop/:path*",
    "/community/:path*",
    "/profile",
    "/messages/:path*",
  ],
};
