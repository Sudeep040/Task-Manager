import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { verifyToken } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/db/connect";
import User from "@/lib/db/models/User";
import { EVENTS } from "./events";

declare global {
  var _socketIO: SocketServer | undefined;
}

interface PresenceEntry {
  userId: string;
  name: string;
  email: string;
  socketId: string;
  joinedAt: string;
}

// In-memory presence map: projectId -> Map<userId, PresenceEntry>
const presenceMap = new Map<string, Map<string, PresenceEntry>>();

function getProjectPresence(projectId: string): PresenceEntry[] {
  return Array.from(presenceMap.get(projectId)?.values() ?? []);
}

function addPresence(projectId: string, entry: PresenceEntry) {
  if (!presenceMap.has(projectId)) presenceMap.set(projectId, new Map());
  presenceMap.get(projectId)!.set(entry.userId, entry);
}

function removePresence(projectId: string, userId: string) {
  presenceMap.get(projectId)?.delete(userId);
}

export async function initSocketServer(httpServer: HttpServer): Promise<SocketServer> {
  if (global._socketIO) return global._socketIO;

  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // Attach Redis adapter if a Redis URL is provided (supports pub/sub)
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const pubClient = createClient({ url: redisUrl });
      await pubClient.connect();
      const subClient = pubClient.duplicate();
      await subClient.connect();

      io.adapter(createAdapter(pubClient, subClient));
      console.log("[Socket] Redis adapter attached");
    } catch (err) {
      console.warn("[Socket] Redis adapter failed, using in-memory adapter:", err);
    }
  } else {
    console.log("[Socket] Running with in-memory adapter (no Redis configured)");
  }

  // JWT Authentication middleware
  io.use(async (socket: Socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string) ||
        (socket.handshake.headers?.authorization as string)?.replace("Bearer ", "");

      if (!token) return next(new Error("Authentication required"));

      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      socket.data.email = payload.email;

      await connectDB();
      const user = await User.findById(payload.userId).select("name email");
      if (!user) return next(new Error("User not found"));
      socket.data.name = user.name;

      await User.findByIdAndUpdate(payload.userId, { lastActiveAt: new Date() });
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const { userId, name, email } = socket.data as {
      userId: string;
      name: string;
      email: string;
    };

    console.log(`[Socket] Connected: ${name} (${userId})`);

    // Track which project rooms this socket is in
    const joinedProjects = new Set<string>();

    socket.on(EVENTS.JOIN_PROJECT, (projectId: string) => {
      if (!projectId) return;
      socket.join(`project:${projectId}`);
      joinedProjects.add(projectId);

      addPresence(projectId, {
        userId,
        name,
        email,
        socketId: socket.id,
        joinedAt: new Date().toISOString(),
      });

      // Broadcast updated presence list to everyone in the room
      io.to(`project:${projectId}`).emit(EVENTS.PRESENCE_UPDATE, {
        projectId,
        users: getProjectPresence(projectId),
      });

      console.log(`[Socket] ${name} joined project:${projectId}`);
    });

    socket.on(EVENTS.LEAVE_PROJECT, (projectId: string) => {
      if (!projectId) return;
      socket.leave(`project:${projectId}`);
      joinedProjects.delete(projectId);
      removePresence(projectId, userId);

      io.to(`project:${projectId}`).emit(EVENTS.PRESENCE_UPDATE, {
        projectId,
        users: getProjectPresence(projectId),
      });
    });

    socket.on("disconnect", () => {
      for (const projectId of joinedProjects) {
        removePresence(projectId, userId);
        io.to(`project:${projectId}`).emit(EVENTS.PRESENCE_UPDATE, {
          projectId,
          users: getProjectPresence(projectId),
        });
      }
      joinedProjects.clear();
      console.log(`[Socket] Disconnected: ${name} (${userId})`);
    });
  });

  global._socketIO = io;
  return io;
}

export function getSocketServer(): SocketServer | undefined {
  return global._socketIO;
}
