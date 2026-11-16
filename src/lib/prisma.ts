import { PrismaClient } from "@prisma/client";
import { noteActivityFromQuery } from "./activityCapture.js";

const basePrisma = new PrismaClient();

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);
        if (model) noteActivityFromQuery(model, operation, args, result);
        return result;
      },
    },
  },
});
