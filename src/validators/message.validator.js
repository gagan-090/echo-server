import { z } from 'zod';
export const createMessageSchema = z.object({
  content: z.string().min(1).max(4096),
  type: z.enum(['text', 'image', 'file']).default('text'),
});
