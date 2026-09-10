export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  workspaceId?: string;
  role?: WorkspaceRole;
}

export interface AuthSession {
  token: string;
  user: UserProfile;
  activeWorkspace?: {
    id: string;
    name: string;
    slug: string;
    role: WorkspaceRole;
    defaultMarketplace: string;
  };
}
