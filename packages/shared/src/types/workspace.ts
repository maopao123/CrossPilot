import { WorkspaceRole } from './auth.js';

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  defaultMarketplace: string;
  role?: WorkspaceRole;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface WorkspaceMemberInfo {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  user?: {
    email: string;
    name: string;
  };
  createdAt: Date | string;
}
