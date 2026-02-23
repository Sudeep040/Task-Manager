export const EVENTS = {
  // Task events (server -> clients)
  TASK_CREATED: "task:created",
  TASK_UPDATED: "task:updated",
  TASK_DELETED: "task:deleted",

  // Comment events
  COMMENT_CREATED: "comment:created",

  // Presence events
  PRESENCE_UPDATE: "presence:update",

  // Client -> Server
  JOIN_PROJECT: "project:join",
  LEAVE_PROJECT: "project:leave",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
