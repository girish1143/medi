export interface RequestAuditContext {
  requestId?: string;
  ipHash?: string | null;
  userAgentHash?: string | null;
}

export interface RepositoryFindOptions {
  skip?: number;
  take?: number;
}
