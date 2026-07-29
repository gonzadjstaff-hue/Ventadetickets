import { Router } from "express";

import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { createCheckIn } from "./controller.js";

export const checkInRouter = Router();

// Solo ADMIN y VALIDATOR pueden validar entradas (ver docs/DECISIONS.md) —
// requireAuth resuelve la identidad/estado, requireRole decide el rol.
checkInRouter.post("/:eventPublicId/check-ins", requireAuth, requireRole("ADMIN", "VALIDATOR"), createCheckIn);
