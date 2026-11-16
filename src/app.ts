import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authRouter } from "./modules/auth/auth.routes.js";
import { entitiesRouter } from "./modules/entities/entities.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { productSetsRouter } from "./modules/productSets/productSets.routes.js";
import { locationsRouter } from "./modules/locations/locations.routes.js";
import { categoriesRouter } from "./modules/categories/categories.routes.js";
import { sellersRouter } from "./modules/sellers/sellers.routes.js";
import { sellerConnectionsRouter } from "./modules/sellerConnections/sellerConnections.routes.js";
import { publicRouter } from "./modules/public/public.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";
import { flowsRouter } from "./modules/flows/flows.routes.js";
import { mediaRouter } from "./modules/media/media.routes.js";
import { statsRouter } from "./modules/stats/stats.routes.js";
import { activityRouter } from "./modules/activity/activity.routes.js";
import { captureActivity } from "./middleware/captureActivity.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { ensureMediaDir, mediaRoot } from "./lib/media.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDist = path.resolve(__dirname, "../admin/dist");

export function createApp() {
  const app = express();
  ensureMediaDir();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(captureActivity);

  app.use("/media", express.static(mediaRoot));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/entities", entitiesRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/product-sets", productSetsRouter);
  app.use("/api/locations", locationsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/sellers", sellersRouter);
  app.use("/api/seller-connections", sellerConnectionsRouter);
  app.use("/api/public", publicRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/flows", flowsRouter);
  app.use("/api/media", mediaRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/activity", activityRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);

  if (fs.existsSync(adminDist)) {
    app.use(express.static(adminDist));

    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/media")) {
        next();
        return;
      }

      res.sendFile(path.join(adminDist, "index.html"));
    });
  }

  return app;
}
