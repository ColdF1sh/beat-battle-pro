import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const protectedRoutes = [
  "/battle",
  "/leaderboard",
  "/shop",
  "/community",
  "/messages",
];

export async function middleware(request: NextRequest) {
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
    const response = NextResponse.next();
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    return response;
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.href);

  const response = NextResponse.redirect(loginUrl);
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
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
