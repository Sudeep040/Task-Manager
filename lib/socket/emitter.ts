import { getSocketServer } from "./server";

export async function emitToProject(projectId: string, event: string, data: unknown) {
  const io = getSocketServer();
  if (!io) return;
  io.to(`project:${projectId}`).emit(event, data);
}
