import { NotFoundException } from '@nestjs/common';
import { CreativeService } from '../src/modules/creative/creative.service.js';

describe('V91-001 Creative SKU tenant isolation', () => {
  const workspaceA = 'ws_tenant_a';
  const workspaceB = 'ws_tenant_b';
  const collidingCode = 'MTH-WHITE-001';

  let prisma: any;
  let toolCenter: any;
  let service: CreativeService;

  beforeEach(() => {
    prisma = {
      sku: {
        findFirst: jest.fn(),
      },
    };
    toolCenter = {
      executeTool: jest.fn().mockResolvedValue({
        data: { imageUrl: 'https://example.invalid/img.jpg' },
        cost: { amount: 0 },
      }),
    };
    service = new CreativeService(prisma, toolCenter);
  });

  it('scopes sku lookup with the caller workspaceId', async () => {
    prisma.sku.findFirst.mockResolvedValue({
      skuCode: collidingCode,
      product: { name: 'Workspace A Product' },
    });

    await service.generateCreativePack(collidingCode, workspaceA);

    expect(prisma.sku.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: workspaceA,
        }),
      }),
    );
    const where = prisma.sku.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { id: collidingCode },
        { skuCode: collidingCode },
      ]),
    );
  });

  it('does not leak Workspace B product name when skuCode collides', async () => {
    prisma.sku.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.workspaceId === workspaceA) {
        return {
          skuCode: collidingCode,
          product: { name: 'Workspace A Product' },
        };
      }
      return {
        skuCode: collidingCode,
        product: { name: 'Workspace B Secret Name' },
      };
    });

    const pack = await service.generateCreativePack(collidingCode, workspaceA);

    expect(pack.productName).toBe('Workspace A Product');
    expect(pack.productName).not.toBe('Workspace B Secret Name');
    expect(prisma.sku.findFirst.mock.calls[0][0].where.workspaceId).toBe(
      workspaceA,
    );
    expect(prisma.sku.findFirst.mock.calls[0][0].where.workspaceId).not.toBe(
      workspaceB,
    );
  });

  it('throws NotFound when the SKU does not belong to the workspace', async () => {
    prisma.sku.findFirst.mockResolvedValue(null);

    await expect(
      service.generateCreativePack(collidingCode, workspaceA),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(toolCenter.executeTool).not.toHaveBeenCalled();
  });
});
