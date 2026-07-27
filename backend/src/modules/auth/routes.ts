import { Router } from "express";

import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { getAdminCheck, getMe } from "./controller.js";

export const authRouter = Router();

authRouter.get("/me", requireAuth, getMe);

// Solo técnica/temporal, para validar autorización por rol de punta a punta
// (ver docs/DECISIONS.md) — no forma parte de ningún flujo de negocio.
authRouter.get("/admin-check", requireAuth, requireRole("ADMIN"), getAdminCheck);
