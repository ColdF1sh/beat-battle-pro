import { z } from "zod";

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address."),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters.")
    .max(24, "Username must be at most 24 characters.")
    .regex(
      /^[a-z0-9_]+$/,
      "Username can only contain lowercase letters, numbers, and underscores.",
    ),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Please enter your email or username."),
  password: z.string().min(1, "Please enter your password."),
});

export type LoginInput = z.infer<typeof loginSchema>;
