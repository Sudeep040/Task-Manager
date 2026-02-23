/**
 * This route is intentionally kept minimal.
 * Socket.io is initialized via the custom server (server.ts) at startup.
 * This endpoint exists to confirm the socket server is running and provide
 * the client with connection info.
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3000",
      transport: ["websocket", "polling"],
    },
  });
}
