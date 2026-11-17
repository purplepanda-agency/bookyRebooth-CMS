import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env.js";
import {
  decryptCalendarConfig,
  getGoogleRedirectUri,
  loadEntityCalendar,
} from "../../lib/calendar/resolve.js";
import { canAccessEntity, resolveEntityFilter } from "../../lib/entityScope.js";
import { prisma } from "../../lib/prisma.js";
import { encryptSecret } from "../../lib/secretCrypto.js";
import { requireAuth } from "../../middleware/auth.js";

export const googleOauthRouter = Router();

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

type OAuthState = {
  sellerId: string;
  entityId: string;
  userId: string;
  returnOrigin: string;
};

const startSchema = z.object({
  sellerId: z.string().cuid(),
  entityId: z.string().cuid().optional(),
  returnOrigin: z.string().url().optional(),
});

const disconnectSchema = z.object({
  sellerId: z.string().cuid(),
  entityId: z.string().cuid().optional(),
});

function adminBaseUrl(returnOrigin?: string | null) {
  const fromReturn = returnOrigin?.trim().replace(/\/$/, "");
  if (fromReturn) return fromReturn;
  const admin = env.ADMIN_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (admin) return admin;
  const pub = env.PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (pub) return pub;
  return "http://localhost:5173";
}

function settingsRedirect(
  returnOrigin: string | null | undefined,
  params: Record<string, string>,
) {
  const url = new URL("/settings", `${adminBaseUrl(returnOrigin)}/`);
  url.searchParams.set("tab", "sellers");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function signState(payload: OAuthState) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "15m" });
}

function verifyState(token: string): OAuthState | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as OAuthState;
    if (
      !payload?.sellerId ||
      !payload?.entityId ||
      !payload?.userId ||
      !payload?.returnOrigin
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function loadGoogleEntityConfig(entityId: string) {
  const entity = await loadEntityCalendar(entityId);
  if (!entity) return { ok: false as const, error: "Entiteit niet gevonden" };
  const resolved = decryptCalendarConfig(entity);
  if (!resolved.ok) return resolved;
  if (resolved.config.provider !== "GOOGLE") {
    return {
      ok: false as const,
      error: "Stel eerst Google in als agenda-provider onder Integraties.",
    };
  }
  const redirectUri = getGoogleRedirectUri();
  if (!redirectUri) {
    return {
      ok: false as const,
      error: "GOOGLE_OAUTH_REDIRECT_URI / PUBLIC_BASE_URL ontbreekt op de server.",
    };
  }
  return {
    ok: true as const,
    config: resolved.config,
    redirectUri,
  };
}

googleOauthRouter.post("/start", requireAuth, async (req, res, next) => {
  try {
    const body = startSchema.parse(req.body);
    const filter = resolveEntityFilter(req.user!, body.entityId ?? null);
    if ("error" in filter) {
      res.status(filter.status).json({ error: filter.error });
      return;
    }
    if (!filter.entityId) {
      res.status(400).json({ error: "entityId is verplicht" });
      return;
    }

    const seller = await prisma.seller.findFirst({
      where: {
        id: body.sellerId,
        entityId: filter.entityId,
        active: true,
      },
      select: { id: true, entityId: true, name: true },
    });

    if (!seller) {
      res.status(404).json({ error: "Verkoper niet gevonden" });
      return;
    }

    const google = await loadGoogleEntityConfig(seller.entityId);
    if (!google.ok) {
      res.status(400).json({ error: google.error });
      return;
    }

    const returnOrigin = adminBaseUrl(body.returnOrigin);
    const state = signState({
      sellerId: seller.id,
      entityId: seller.entityId,
      userId: req.user!.id,
      returnOrigin,
    });

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set("client_id", google.config.clientId);
    url.searchParams.set("redirect_uri", google.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);

    res.json({ url: url.toString() });
  } catch (error) {
    next(error);
  }
});

googleOauthRouter.get("/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const stateToken = typeof req.query.state === "string" ? req.query.state : null;
  const oauthError =
    typeof req.query.error === "string" ? req.query.error : null;

  const state = stateToken ? verifyState(stateToken) : null;
  const returnOrigin = state?.returnOrigin;

  if (oauthError) {
    res.redirect(
      settingsRedirect(returnOrigin, {
        googleOauth: "error",
        message: oauthError,
      }),
    );
    return;
  }

  if (!code || !state) {
    res.redirect(
      settingsRedirect(returnOrigin, {
        googleOauth: "error",
        message: "Ongeldige of verlopen OAuth-state",
      }),
    );
    return;
  }

  try {
    const seller = await prisma.seller.findFirst({
      where: { id: state.sellerId, entityId: state.entityId },
      select: { id: true },
    });
    if (!seller) {
      res.redirect(
        settingsRedirect(returnOrigin, {
          googleOauth: "error",
          message: "Verkoper niet gevonden",
        }),
      );
      return;
    }

    const google = await loadGoogleEntityConfig(state.entityId);
    if (!google.ok) {
      res.redirect(
        settingsRedirect(returnOrigin, {
          googleOauth: "error",
          message: google.error,
        }),
      );
      return;
    }

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: google.config.clientId,
        client_secret: google.config.clientSecret,
        redirect_uri: google.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      res.redirect(
        settingsRedirect(returnOrigin, {
          googleOauth: "error",
          message: `Token-uitwisseling mislukt: ${text.slice(0, 180)}`,
        }),
      );
      return;
    }

    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
    };

    if (!tokens.refresh_token) {
      res.redirect(
        settingsRedirect(returnOrigin, {
          googleOauth: "error",
          message:
            "Geen refresh token ontvangen. Ontkoppel de app in Google-account en probeer opnieuw.",
        }),
      );
      return;
    }

    let connectedEmail: string | null = null;
    if (tokens.access_token) {
      const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (profileResponse.ok) {
        const profile = (await profileResponse.json()) as { email?: string };
        connectedEmail = profile.email?.trim().toLowerCase() || null;
      }
    }

    await prisma.seller.update({
      where: { id: seller.id },
      data: {
        googleRefreshTokenEnc: encryptSecret(tokens.refresh_token),
        googleConnectedEmail: connectedEmail,
        googleConnectedAt: new Date(),
      },
    });

    res.redirect(
      settingsRedirect(returnOrigin, {
        googleOauth: "success",
        message: connectedEmail
          ? `Google gekoppeld als ${connectedEmail}`
          : "Google gekoppeld",
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Onbekende OAuth-fout";
    res.redirect(
      settingsRedirect(returnOrigin, {
        googleOauth: "error",
        message,
      }),
    );
  }
});

googleOauthRouter.post("/disconnect", requireAuth, async (req, res, next) => {
  try {
    const body = disconnectSchema.parse(req.body);
    const filter = resolveEntityFilter(req.user!, body.entityId ?? null);
    if ("error" in filter) {
      res.status(filter.status).json({ error: filter.error });
      return;
    }
    if (!filter.entityId) {
      res.status(400).json({ error: "entityId is verplicht" });
      return;
    }

    const seller = await prisma.seller.findFirst({
      where: {
        id: body.sellerId,
        entityId: filter.entityId,
      },
      select: { id: true },
    });

    if (!seller) {
      res.status(404).json({ error: "Verkoper niet gevonden" });
      return;
    }

    if (!canAccessEntity(req.user!, filter.entityId)) {
      res.status(403).json({ error: "Geen toegang tot deze entiteit" });
      return;
    }

    await prisma.seller.update({
      where: { id: seller.id },
      data: {
        googleRefreshTokenEnc: null,
        googleConnectedEmail: null,
        googleConnectedAt: null,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
