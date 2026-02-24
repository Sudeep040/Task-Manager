import { z } from "zod";

export const memberSchema = z.object({
  email: z.string().email("Valid email required"),
});

export type MemberInput = z.infer<typeof memberSchema>;
