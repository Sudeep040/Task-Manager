import { TaskStatus } from "./db/models/Task";

export type StatusTransitionResult =
  | { allowed: true }
  | { allowed: false; reason: string };

// Allowed forward transitions
const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ["in_progress", "archived"],
  in_progress: ["todo", "done", "archived"],
  done: ["in_progress", "archived"],
  archived: [],
};

/**
 * Validates whether a status transition is permitted.
 * Archived tasks are terminal — no transitions out are allowed.
 */
export function validateStatusTransition(
  from: TaskStatus,
  to: TaskStatus
): StatusTransitionResult {
  if (from === to) return { allowed: true };

  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) {
    return { allowed: false, reason: `Unknown status: ${from}` };
  }

  if (!allowed.includes(to)) {
    return {
      allowed: false,
      reason: `Cannot transition from '${from}' to '${to}'. Allowed: ${allowed.join(", ") || "none"}`,
    };
  }

  return { allowed: true };
}

/**
 * Applies a status update to a task-like object, enforcing transition rules.
 * Returns a new object (immutable update).
 */
export function applyStatusUpdate<T extends { status: TaskStatus }>(
  task: T,
  newStatus: TaskStatus
): T {
  const result = validateStatusTransition(task.status, newStatus);
  if (!result.allowed) {
    throw new Error(result.reason);
  }
  return { ...task, status: newStatus };
}
