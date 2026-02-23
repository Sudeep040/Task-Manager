import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifyToken } from "@/lib/auth/jwt";

const PUBLIC_API_ROUTES = ["/api/auth/register", "/api/auth/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/api/")) return NextResponse.next();
  if (PUBLIC_API_ROUTES.includes(pathname)) return NextResponse.next();

  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return NextResponse.json(
      { success: false, error: { message: "Authentication required", code: "UNAUTHORIZED" } },
      { status: 401 }
    );
  }

  try {
    verifyToken(token);
    return NextResponse.next();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Invalid or expired token", code: "INVALID_TOKEN" } },
      { status: 401 }
    );
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
