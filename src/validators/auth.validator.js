import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Must be at least 8 characters').max(128),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Must be at least 8 characters').max(128),
  display_name: z.string().min(1, 'Display name is required').max(60, 'Display name too long'),
});
