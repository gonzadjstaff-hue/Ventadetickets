import { Router } from "express";

import { createGeneralRegistration } from "./controller.js";

export const registrationsRouter = Router();

registrationsRouter.post("/:eventPublicId/registrations/general", createGeneralRegistration);
