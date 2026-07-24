import { Router } from "express";

import { createCheckIn } from "./controller.js";

export const checkInRouter = Router();

checkInRouter.post("/:eventPublicId/check-ins", createCheckIn);
