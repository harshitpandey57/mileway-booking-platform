import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .refine(
    (v) => new TextEncoder().encode(v).length <= 72,
    "Use at most 72 bytes for your password",
  );
export const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter at least two characters")
  .max(100);
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d ()-]{7,20}$/, "Enter a valid contact number")
  .or(z.literal(""));
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});
export const registerSchema = z
  .object({ name: nameSchema, email: emailSchema, password: passwordSchema })
  .strict();
export const profileSchema = z
  .object({ name: nameSchema, phone: phoneSchema })
  .strict();
export const passengerSchema = z.object({
  name: nameSchema,
  age: z.coerce.number().int().min(1).max(120),
});
export const routePairSchema = z.object({
  from: z.string().trim().min(1).max(80),
  to: z.string().trim().min(1).max(80),
});
export const searchEntrySchema = routePairSchema.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const supportSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(4, "Add a subject of four or more characters")
    .max(120),
  message: z
    .string()
    .trim()
    .min(10, "Please include at least 10 characters")
    .max(3000),
});
