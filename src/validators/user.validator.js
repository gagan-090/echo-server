import { z } from 'zod';

export const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(60).optional(),
  avatar_url: z.string().url().optional(),
  bio: z.string().max(200).optional(),
});
