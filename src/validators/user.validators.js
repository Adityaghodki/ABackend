import { z } from "zod";

const email = z.string().trim().pipe(z.email());

export const registerSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  username: z.string().trim().min(1).max(50),
  email,
  password: z.string().min(8).max(72),
});

export const loginSchema = z
  .object({
    email: email.optional(),
    username: z.string().trim().min(1).optional(),
    password: z.string().min(1),
  })
  .refine((data) => Boolean(data.email || data.username), {
    message: "Username or email is required",
    path: ["email"],
  });

export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(100).optional(),
    email: email.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required to update",
  });
