import type { AuthenticatedUser } from "../middlewares/authTypes.js";

declare global {
  namespace Express {
    interface Request {
      /** Presente solo después de pasar por requireAuth. Ver authTypes.ts. */
      authUser?: AuthenticatedUser;
    }
  }
}

export {};
