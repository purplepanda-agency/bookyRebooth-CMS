import type { RequestHandler } from "express";
import { activityStorage } from "../lib/activityContext.js";
import { flushActivity } from "../lib/activityLog.js";

/**
 * Keeps one activity buffer for the request and writes it after a successful response.
 * AsyncLocalStorage must wrap next() so route handlers and Prisma calls stay in context.
 */
export const captureActivity: RequestHandler = (req, res, next) => {
  const store = { changes: [] };

  activityStorage.run(store, () => {
    res.on("finish", () => {
      if (res.statusCode >= 400 || !req.user || store.changes.length === 0) return;
      void flushActivity(req.user, store.changes).catch((error) => {
        console.error("[activity] write failed", error);
      });
    });
    next();
  });
};
