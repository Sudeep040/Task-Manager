import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().min(1, "Search query is required").max(200).trim(),
  projectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
