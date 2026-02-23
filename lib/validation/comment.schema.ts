import { z } from "zod";

export const createCommentSchema = z.object({
  body: z.string().min(1, "Comment body is required").max(5000).trim(),
});

export const commentCursorSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
