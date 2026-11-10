import type { Request, Response } from 'express';
import { hashRequestFingerprint } from '../../security/token-hash';
import { createdResponse, okResponse } from '../../shared/utils';
import type { UserService } from './user.service';

function extractContext(req: Request, res: Response) {
  return {
    requestId: res.locals.requestId as string | undefined,
    ipHash: hashRequestFingerprint(req.ip),
    userAgentHash: hashRequestFingerprint(req.header('user-agent')),
  };
}

export class UserController {
  constructor(private readonly service: UserService) {}

  list = async (req: Request, res: Response) => {
    const result = await this.service.listUsers(req.query);
    return okResponse(res, result);
  };

  getById = async (req: Request, res: Response) => {
    const user = await this.service.getUserById(String(req.params.id ?? ''));
    return okResponse(res, { user });
  };

  createAdmin = async (req: Request, res: Response) => {
    const actor = req.principal!;
    const user = await this.service.createAdminUser(
      { userId: actor.userId, role: actor.role },
      req.body,
      extractContext(req, res),
    );
    return createdResponse(res, { user });
  };

  update = async (req: Request, res: Response) => {
    const actor = req.principal!;
    const user = await this.service.updateUserProfile(
      { userId: actor.userId, role: actor.role },
      String(req.params.id ?? ''),
      req.body,
      extractContext(req, res),
    );
    return okResponse(res, { user });
  };

  updateStatus = async (req: Request, res: Response) => {
    const actor = req.principal!;
    const user = await this.service.updateUserStatus(
      { userId: actor.userId, role: actor.role },
      String(req.params.id ?? ''),
      req.body,
      extractContext(req, res),
    );
    return okResponse(res, { user });
  };

  softDelete = async (req: Request, res: Response) => {
    const actor = req.principal!;
    const result = await this.service.softDeleteUser(
      { userId: actor.userId, role: actor.role },
      String(req.params.id ?? ''),
      extractContext(req, res),
    );
    return okResponse(res, result);
  };
}
