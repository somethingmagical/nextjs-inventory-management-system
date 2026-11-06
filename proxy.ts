import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const proxy = auth((request) => {
  const isSignedIn = Boolean(request.auth?.user);

  if (request.nextUrl.pathname === "/") {
    return isSignedIn
      ? NextResponse.redirect(new URL("/dashboard", request.nextUrl))
      : NextResponse.next();
  }

  if (!isSignedIn) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.).*)",
  ],
};
