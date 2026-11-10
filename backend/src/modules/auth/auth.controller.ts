import type { Request, Response } from 'express';
import { SECURITY_CONSTANTS } from '../../config/security';
import { clearAuthCookies, setAuthCookies } from '../../security/cookie';
import { hashRequestFingerprint } from '../../security/token-hash';
import { UnauthorizedError } from '../../shared/errors';
import { createdResponse, okResponse } from '../../shared/utils';
import type { AuthService } from './auth.service';

function extractAuditContext(req: Request, res: Response) {
  return {
    requestId: res.locals.requestId as string | undefined,
    ipHash: hashRequestFingerprint(req.ip),
    userAgentHash: hashRequestFingerprint(req.header('user-agent')),
  };
}

export class AuthController {
  constructor(private readonly service: AuthService) {}

  registerUnified = async (req: Request, res: Response) => {
    const result = await this.service.registerUnified(req.body, extractAuditContext(req, res));
    return createdResponse(res, result);
  };

  registerPatient = async (req: Request, res: Response) => {
    const result = await this.service.registerPatient(req.body, extractAuditContext(req, res));
    return createdResponse(res, result);
  };

  registerDoctor = async (req: Request, res: Response) => {
    const result = await this.service.registerDoctor(req.body, extractAuditContext(req, res));
    return createdResponse(res, result);
  };

  registerHospital = async (req: Request, res: Response) => {
    const result = await this.service.registerHospital(req.body, extractAuditContext(req, res));
    return createdResponse(res, result);
  };

  verifyEmail = async (req: Request, res: Response) => {
    const user = await this.service.verifyEmail(req.body, extractAuditContext(req, res));
    return okResponse(res, { user });
  };

  login = async (req: Request, res: Response) => {
    const { user, tokens } = await this.service.login(req.body, extractAuditContext(req, res));
    setAuthCookies(res, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    return okResponse(res, { user });
  };

  refresh = async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.[SECURITY_CONSTANTS.REFRESH_COOKIE_NAME] as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedError('MISSING_REFRESH_TOKEN', 'Refresh cookie is required.');
    }
    const tokens = await this.service.refresh(refreshToken, extractAuditContext(req, res));
    setAuthCookies(res, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    return okResponse(res, { refreshed: true });
  };

  logout = async (req: Request, res: Response) => {
    if (req.principal) {
      await this.service.logout(
        req.principal.sessionId,
        req.principal.userId,
        req.principal.role,
        extractAuditContext(req, res),
      );
    }
    clearAuthCookies(res);
    return okResponse(res, { loggedOut: true });
  };

  me = async (req: Request, res: Response) => {
    const profile = await this.service.getMe(req.principal!.userId);
    return okResponse(res, {
      user: profile,
      permissions: req.principal!.permissions,
    });
  };

  forgotPassword = async (req: Request, res: Response) => {
    const result = await this.service.forgotPassword(req.body, extractAuditContext(req, res));
    return okResponse(res, result);
  };

  resetPassword = async (req: Request, res: Response) => {
    const result = await this.service.resetPassword(req.body, extractAuditContext(req, res));
    clearAuthCookies(res);
    return okResponse(res, result);
  };

  changePassword = async (req: Request, res: Response) => {
    const principal = req.principal!;
    const result = await this.service.changePassword(
      principal.userId,
      principal.sessionId,
      req.body,
      extractAuditContext(req, res),
    );
    setAuthCookies(res, {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    });
    return okResponse(res, { passwordChanged: true });
  };
}
