import type { AuthenticatedPrincipal } from '../shared/types';

declare global {
  namespace Express {
    interface Request {
      principal?: AuthenticatedPrincipal;
    }
  }
}
