import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { verifyToken, extractBearerToken, JwtPayload } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/db/connect";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { success: false, error: { message: error.message, code: error.code ?? "ERROR" } },
      { status: error.statusCode }
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: "Validation failed",
          code: "VALIDATION_ERROR",
          details: error.issues,
        },
      },
      { status: 400 }
    );
  }
  // Malformed JSON body (req.json() throws SyntaxError)
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { success: false, error: { message: "Invalid JSON in request body", code: "INVALID_JSON" } },
      { status: 400 }
    );
  }
  console.error("[API Error]", error);
  return NextResponse.json(
    { success: false, error: { message: "Internal server error", code: "INTERNAL_ERROR" } },
    { status: 500 }
  );
}

export function getAuthUser(req: NextRequest): JwtPayload {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
  try {
    return verifyToken(token);
  } catch {
    throw new ApiError(401, "Invalid or expired token", "INVALID_TOKEN");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteContext = { params: Promise<any> };
type RouteHandler = (req: NextRequest, context: RouteContext) => Promise<NextResponse>;

/**
 * Wraps a route handler with a global try/catch that formats all errors
 * consistently using apiError(). Use this for public routes that don't
 * require authentication.
 */
export function withHandler(handler: RouteHandler): RouteHandler {
  return async (req, context) => {
    try {
      await connectDB();
      return await handler(req, context);
    } catch (error) {
      return apiError(error);
    }
  };
}

/**
 * Wraps a route handler with DB connection, JWT authentication, and global
 * error handling. Throws 401 before the handler runs if the token is missing
 * or invalid.
 */
export function withAuth(handler: RouteHandler): RouteHandler {
  return async (req, context) => {
    try {
      await connectDB();
      getAuthUser(req);
      return await handler(req, context);
    } catch (error) {
      return apiError(error);
    }
  };
}

// Cursor-based pagination helpers
export interface Cursor {
  updatedAt: string;
  _id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(encoded: string): Cursor {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Cursor;
  } catch {
    throw new ApiError(400, "Invalid pagination cursor", "INVALID_CURSOR");
  }
}
