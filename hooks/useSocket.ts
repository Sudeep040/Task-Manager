"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { EVENTS } from "@/lib/socket/events";

interface UseSocketOptions {
  projectId?: string;
  onTaskCreated?: (task: unknown) => void;
  onTaskUpdated?: (task: unknown) => void;
  onTaskDeleted?: (data: { taskId: string }) => void;
  onCommentCreated?: (data: { taskId: string; comment: unknown }) => void;
  onPresenceUpdate?: (data: { projectId: string; users: PresenceUser[] }) => void;
}

export interface PresenceUser {
  userId: string;
  name: string;
  email: string;
  socketId: string;
  joinedAt: string;
}

export function useSocket({
  projectId,
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted,
  onCommentCreated,
  onPresenceUpdate,
}: UseSocketOptions = {}) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3000";
    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      if (projectId) {
        socket.emit(EVENTS.JOIN_PROJECT, projectId);
      }
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on(EVENTS.TASK_CREATED, (task: unknown) => onTaskCreated?.(task));
    socket.on(EVENTS.TASK_UPDATED, (task: unknown) => onTaskUpdated?.(task));
    socket.on(EVENTS.TASK_DELETED, (data: { taskId: string }) => onTaskDeleted?.(data));
    socket.on(EVENTS.COMMENT_CREATED, (data: { taskId: string; comment: unknown }) =>
      onCommentCreated?.(data)
    );
    socket.on(EVENTS.PRESENCE_UPDATE, (data: { projectId: string; users: PresenceUser[] }) => {
      setPresenceUsers(data.users);
      onPresenceUpdate?.(data);
    });

    return () => {
      if (projectId) socket.emit(EVENTS.LEAVE_PROJECT, projectId);
      socket.disconnect();
    };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { socket: socketRef.current, connected, presenceUsers };
}
