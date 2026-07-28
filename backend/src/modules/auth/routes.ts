import { Router } from "express";

import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { getAdminCheck, getMe, postSession } from "./controller.js";

export const authRouter = Router();

// Sin requireAuth a propósito: resuelve el primer acceso (vinculación
// firebaseUid ↔ User) además del acceso normal — ver postSession en
// controller.ts y docs/DECISIONS.md.
authRouter.post("/session", postSession);

authRouter.get("/me", requireAuth, getMe);

// Solo técnica/temporal, para validar autorización por rol de punta a punta
// (ver docs/DECISIONS.md) — no forma parte de ningún flujo de negocio.
authRouter.get("/admin-check", requireAuth, requireRole("ADMIN"), getAdminCheck);
