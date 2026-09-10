import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateWorkspaceInput,
  ErrorCodes,
  WorkspaceSummary,
} from '@crosspilot/shared';

@Injectable()
export class WorkspaceService {
  constructor(private prisma: PrismaService) {}

  async getCurrentWorkspace(
    userId: string,
    requestedWorkspaceId?: string,
  ): Promise<WorkspaceSummary> {
    // If a specific workspace is requested, verify access
    if (requestedWorkspaceId) {
      const membership = await this.prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: requestedWorkspaceId,
            userId,
          },
        },
        include: {
          workspace: {
            include: {
              defaultMarketplace: true,
            },
          },
        },
      });

      if (!membership) {
        throw new ForbiddenException({
          code: ErrorCodes.WORKSPACE_ACCESS_DENIED,
          message: 'You do not have access to this workspace',
        });
      }

      return {
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
        role: membership.role,
        defaultMarketplace:
          membership.workspace.defaultMarketplace?.code || 'AMAZON_US',
        createdAt: membership.workspace.createdAt,
        updatedAt: membership.workspace.updatedAt,
      };
    }

    // Default to the first workspace where user is a member
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId },
      include: {
        workspace: {
          include: {
            defaultMarketplace: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!membership) {
      // If user has no workspace, find or create the demo workspace for them
      let demoWs = await this.prisma.workspace.findUnique({
        where: { slug: 'crosspilot-demo' },
        include: { defaultMarketplace: true },
      });

      if (!demoWs) {
        let mp = await this.prisma.marketplace.findUnique({
          where: { code: 'AMAZON_US' },
        });
        if (!mp) {
          mp = await this.prisma.marketplace.create({
            data: {
              code: 'AMAZON_US',
              name: 'Amazon US',
              countryCode: 'US',
              currencyCode: 'USD',
              languageCode: 'en-US',
              timezone: 'America/Los_Angeles',
            },
          });
        }
        demoWs = await this.prisma.workspace.create({
          data: {
            name: 'CrossPilot Demo',
            slug: 'crosspilot-demo',
            defaultMarketplaceId: mp.id,
          },
          include: { defaultMarketplace: true },
        });
      }

      // Add user as member
      await this.prisma.workspaceMember.create({
        data: {
          workspaceId: demoWs.id,
          userId,
          role: 'OWNER',
        },
      });

      return {
        id: demoWs.id,
        name: demoWs.name,
        slug: demoWs.slug,
        role: 'OWNER',
        defaultMarketplace: demoWs.defaultMarketplace?.code || 'AMAZON_US',
        createdAt: demoWs.createdAt,
        updatedAt: demoWs.updatedAt,
      };
    }

    return {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      role: membership.role,
      defaultMarketplace:
        membership.workspace.defaultMarketplace?.code || 'AMAZON_US',
      createdAt: membership.workspace.createdAt,
      updatedAt: membership.workspace.updatedAt,
    };
  }

  async listUserWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            defaultMarketplace: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
      defaultMarketplace: m.workspace.defaultMarketplace?.code || 'AMAZON_US',
      createdAt: m.workspace.createdAt,
      updatedAt: m.workspace.updatedAt,
    }));
  }

  async getWorkspaceById(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceSummary> {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        workspace: {
          include: {
            defaultMarketplace: true,
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException({
        code: ErrorCodes.WORKSPACE_NOT_FOUND,
        message: 'Workspace not found or access denied',
      });
    }

    return {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      role: membership.role,
      defaultMarketplace:
        membership.workspace.defaultMarketplace?.code || 'AMAZON_US',
      createdAt: membership.workspace.createdAt,
      updatedAt: membership.workspace.updatedAt,
    };
  }

  async createWorkspace(
    userId: string,
    input: CreateWorkspaceInput,
  ): Promise<WorkspaceSummary> {
    const existing = await this.prisma.workspace.findUnique({
      where: { slug: input.slug },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCodes.WORKSPACE_SLUG_CONFLICT,
        message: 'A workspace with this slug already exists',
      });
    }

    let defaultMarketplaceId = input.defaultMarketplaceId;
    if (!defaultMarketplaceId) {
      const defaultMp = await this.prisma.marketplace.findFirst({
        where: { isActive: true },
      });
      defaultMarketplaceId = defaultMp?.id;
    }

    const workspace = await this.prisma.workspace.create({
      data: {
        name: input.name,
        slug: input.slug,
        defaultMarketplaceId,
        members: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
      },
      include: {
        defaultMarketplace: true,
      },
    });

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: 'OWNER',
      defaultMarketplace: workspace.defaultMarketplace?.code || 'AMAZON_US',
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }
}
