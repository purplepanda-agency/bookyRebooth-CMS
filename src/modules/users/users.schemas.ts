import { z } from "zod";
import { strongPasswordSchema } from "../../lib/password.js";

const roleSchema = z.enum(["SUPER_ADMIN", "ADMIN"]);

export const createUserSchema = z
  .object({
    email: z.string().email(),
    password: strongPasswordSchema,
    role: roleSchema.optional(),
    entityIds: z.array(z.string().cuid()).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.role === "SUPER_ADMIN" &&
      data.entityIds &&
      data.entityIds.length > 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["entityIds"],
        message: "Een super admin is aan alle entiteiten gekoppeld",
      });
    }

    if (data.role === "ADMIN" && data.entityIds && data.entityIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["entityIds"],
        message: "Kies minstens één entiteit",
      });
    }
  });

export const updateUserSchema = z
  .object({
    role: roleSchema.optional(),
    entityIds: z.array(z.string().cuid()).optional(),
    password: strongPasswordSchema.optional(),
  })
  .refine(
    (data) =>
      data.role !== undefined ||
      data.entityIds !== undefined ||
      data.password !== undefined,
    {
      message: "Niets om bij te werken",
    },
  );
