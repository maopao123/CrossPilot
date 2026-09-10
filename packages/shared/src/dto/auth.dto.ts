import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const DemoLoginSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'OPERATOR', 'VIEWER']).default('OWNER'),
});

export type DemoLoginInput = z.infer<typeof DemoLoginSchema>;

export const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(6),
  workspaceName: z.string().min(2).optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  defaultMarketplaceId: z.string().optional(),
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;
