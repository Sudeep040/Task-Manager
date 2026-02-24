import { z } from "zod";

export const taskStatuses = ["todo", "in_progress", "done", "archived"] as const;

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).trim(),
  description: z.string().max(5000).trim().optional(),
  status: z.enum(taskStatuses).default("todo"),
  assignees: z.array(z.string()).optional().default([]),
  priority: z.number().int().min(1).max(5).default(3),
  dueAt: z.preprocess((val) => {
    // Accept ISO strings with timezone offsets or Date objects, normalize to Z-terminated ISO
    if (typeof val === "string") {
      const d = new Date(val);
      if (!isNaN(d.valueOf())) return d.toISOString();
    } else if (val instanceof Date) {
      if (!isNaN(val.valueOf())) return val.toISOString();
    }
    return val;
  }, z.string().datetime().optional()),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(5000).trim().optional(),
  status: z.enum(taskStatuses).optional(),
  assignees: z.array(z.string()).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  dueAt: z.preprocess((val) => {
    if (typeof val === "string") {
      const d = new Date(val);
      if (!isNaN(d.valueOf())) return d.toISOString();
    } else if (val instanceof Date) {
      if (!isNaN(val.valueOf())) return val.toISOString();
    }
    return val;
  }, z.string().datetime().optional().nullable()),
});

export const assignSchema = z.object({
  userId: z.string().min(1, "userId is required"),
});

export const dashboardQuerySchema = z.object({
  status: z.enum(taskStatuses).optional(),
  assignee: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100).trim(),
  description: z.string().max(500).trim().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  description: z.string().max(500).trim().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
