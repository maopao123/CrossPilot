import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import bcrypt from 'bcrypt';
import {
  AuthSession,
  ErrorCodes,
  JwtPayload,
  LoginInput,
  RegisterInput,
  UserProfile,
  UserStatus,
  WorkspaceRole,
} from '@crosspilot/shared';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(input: LoginInput): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: {
        memberships: {
          include: {
            workspace: {
              include: {
                defaultMarketplace: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    const primaryMembership = user.memberships[0];
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      workspaceId: primaryMembership?.workspaceId,
      role: primaryMembership?.role,
    };

    const token = this.jwtService.sign(payload);

    return {
      token,
      user: this.toUserProfile(user),
      activeWorkspace: primaryMembership
        ? {
            id: primaryMembership.workspace.id,
            name: primaryMembership.workspace.name,
            slug: primaryMembership.workspace.slug,
            role: primaryMembership.role,
            defaultMarketplace:
              primaryMembership.workspace.defaultMarketplace?.code || 'AMAZON_US',
          }
        : undefined,
    };
  }

  async demoLogin(role: WorkspaceRole = 'OWNER'): Promise<AuthSession> {
    try {
      // 1. Ensure Marketplace exists
      let marketplace = await this.prisma.marketplace.findUnique({
        where: { code: 'AMAZON_US' },
      });
      if (!marketplace) {
        marketplace = await this.prisma.marketplace.create({
          data: {
            code: 'AMAZON_US',
            name: 'Amazon US',
            countryCode: 'US',
            currencyCode: 'USD',
            languageCode: 'en-US',
            timezone: 'America/Los_Angeles',
            isActive: true,
          },
        });
      }

      // 2. Ensure Demo User exists
      let demoUser = await this.prisma.user.findUnique({
        where: { email: 'demo@crosspilot.com' },
      });
      if (!demoUser) {
        const passwordHash = await bcrypt.hash('crosspilot123', 10);
        demoUser = await this.prisma.user.create({
          data: {
            email: 'demo@crosspilot.com',
            name: 'CrossPilot Demo User',
            passwordHash,
            status: 'ACTIVE',
          },
        });
      }

      // 3. Ensure Demo Workspace exists
      let demoWorkspace = await this.prisma.workspace.findUnique({
        where: { slug: 'crosspilot-demo' },
      });
      if (!demoWorkspace) {
        demoWorkspace = await this.prisma.workspace.create({
          data: {
            name: 'CrossPilot Demo',
            slug: 'crosspilot-demo',
            defaultMarketplaceId: marketplace.id,
          },
        });
      }

      // 4. Ensure Workspace Membership exists
      let membership = await this.prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: demoWorkspace.id,
            userId: demoUser.id,
          },
        },
      });
      if (!membership) {
        membership = await this.prisma.workspaceMember.create({
          data: {
            workspaceId: demoWorkspace.id,
            userId: demoUser.id,
            role,
          },
        });
      }

      const payload: JwtPayload = {
        sub: demoUser.id,
        email: demoUser.email,
        workspaceId: demoWorkspace.id,
        role: membership.role,
      };

      const token = this.jwtService.sign(payload);

      return {
        token,
        user: this.toUserProfile(demoUser),
        activeWorkspace: {
          id: demoWorkspace.id,
          name: demoWorkspace.name,
          slug: demoWorkspace.slug,
          role: membership.role,
          defaultMarketplace: marketplace.code,
        },
      };
    } catch (dbError) {
      console.warn('⚠️ Database offline during demoLogin, issuing offline preview session');
      const payload: JwtPayload = {
        sub: 'usr_demo_offline',
        email: 'demo@crosspilot.com',
        workspaceId: 'ws_demo_preview',
        role: role || 'OWNER',
      };
      const token = this.jwtService.sign(payload);
      return {
        token,
        user: {
          id: 'usr_demo_offline',
          email: 'demo@crosspilot.com',
          name: 'CrossPilot Demo User',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        activeWorkspace: {
          id: 'ws_demo_preview',
          name: 'CrossPilot Demo',
          slug: 'crosspilot-demo',
          role: role || 'OWNER',
          defaultMarketplace: 'AMAZON_US',
        },
      };
    }
  }

  async register(input: RegisterInput): Promise<AuthSession> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCodes.AUTH_USER_ALREADY_EXISTS,
        message: 'A user with this email already exists',
      });
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    // Get default marketplace
    const marketplace = await this.prisma.marketplace.findFirst({
      where: { isActive: true },
    });

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        status: 'ACTIVE',
      },
    });

    const workspaceName = input.workspaceName || `${input.name}'s Workspace`;
    const slug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + `-${Date.now().toString(36)}`;

    const workspace = await this.prisma.workspace.create({
      data: {
        name: workspaceName,
        slug,
        defaultMarketplaceId: marketplace?.id,
        members: {
          create: {
            userId: user.id,
            role: 'OWNER',
          },
        },
      },
      include: {
        defaultMarketplace: true,
      },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      workspaceId: workspace.id,
      role: 'OWNER',
    };

    const token = this.jwtService.sign(payload);

    return {
      token,
      user: this.toUserProfile(user),
      activeWorkspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: 'OWNER',
        defaultMarketplace: workspace.defaultMarketplace?.code || 'AMAZON_US',
      },
    };
  }

  async getProfile(userId: string): Promise<UserProfile & { workspaces: any[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            workspace: {
              include: {
                defaultMarketplace: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.AUTH_USER_NOT_FOUND,
        message: 'User profile not found',
      });
    }

    return {
      ...this.toUserProfile(user),
      workspaces: user.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role,
        defaultMarketplace: m.workspace.defaultMarketplace?.code || 'AMAZON_US',
      })),
    };
  }

  private toUserProfile(user: any): UserProfile {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
