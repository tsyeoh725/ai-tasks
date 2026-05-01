import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie:
      req.headers.get("x-forwarded-proto") === "https" ||
      process.env.NODE_ENV === "production",
  });
  const isLoggedIn = !!token;
  const isAuthPage = req.nextUrl.pathname.startsWith("/login") || req.nextUrl.pathname.startsWith("/register");
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isApiV1 = req.nextUrl.pathname.startsWith("/api/v1");

  const isPublicApi =
    req.nextUrl.pathname.startsWith("/api/f") ||
    /^\/api\/forms\/[^/]+\/submit$/.test(req.nextUrl.pathname);
  const isPublicPage = req.nextUrl.pathname.startsWith("/f/");

  if (isApiAuth || isApiV1 || isPublicApi || isPublicPage) {
    return NextResponse.next();
  }

  if (isAuthPage) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/", req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
