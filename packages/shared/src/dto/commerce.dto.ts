import { z } from 'zod';

export const CreateProductSchema = z.object({
  marketplaceId: z.string().min(1),
  name: z.string().min(2),
  brand: z.string().min(1),
  category: z.string().min(1),
  subCategory: z.string().optional(),
  targetPrice: z.number().positive().optional(),
  description: z.string().optional(),
  productBrief: z.string().optional(),
});
export type CreateProductInput = z.infer<typeof CreateProductSchema>;

export const CreateSkuSchema = z.object({
  productId: z.string().min(1),
  skuCode: z.string().min(2),
  variantName: z.string().min(1),
  sellingPrice: z.number().positive(),
  asin: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  material: z.string().optional(),
  weightKg: z.number().positive().optional(),
});
export type CreateSkuInput = z.infer<typeof CreateSkuSchema>;

export const CreateSupplierSchema = z.object({
  name: z.string().min(2),
  contactPerson: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  leadTimeDays: z.number().int().min(1).default(15),
});
export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;

export const CreateSupplierQuoteSchema = z.object({
  supplierId: z.string().min(1),
  skuId: z.string().min(1),
  unitCost: z.number().positive(),
  moq: z.number().int().min(1).default(1),
  currencyCode: z.string().default('USD'),
});
export type CreateSupplierQuoteInput = z.infer<typeof CreateSupplierQuoteSchema>;

export const CreatePurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  poNumber: z.string().min(2),
  currencyCode: z.string().default('USD'),
  expectedDeliveryDate: z.string().datetime().optional(),
  items: z.array(
    z.object({
      skuId: z.string().min(1),
      quantity: z.number().int().positive(),
      unitCost: z.number().positive(),
    }),
  ).min(1),
});
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderSchema>;

export const ReceivePurchaseOrderSchema = z.object({
  externalReceiptId: z.string().optional(),
  items: z.array(
    z.object({
      skuId: z.string().min(1),
      receivedQuantity: z.number().int().positive(),
    }),
  ).min(1),
});
export type ReceivePurchaseOrderInput = z.infer<typeof ReceivePurchaseOrderSchema>;

export const CreateOrderSchema = z.object({
  marketplaceId: z.string().min(1),
  orderNumber: z.string().min(2),
  currencyCode: z.string().optional().default('USD'),
  orderedAt: z.string().datetime().optional(),
  items: z.array(
    z.object({
      skuId: z.string().min(1),
      quantity: z.number().int().positive(),
      unitPrice: z.number().positive(),
      itemTax: z.number().min(0).optional().default(0),
      shippingFee: z.number().min(0).optional().default(0),
    }),
  ).min(1),
});
export type CreateOrderInput = z.input<typeof CreateOrderSchema>;

export const CreateReturnSchema = z.object({
  orderItemId: z.string().min(1),
  skuId: z.string().min(1),
  refundAmount: z.number().positive(),
  reason: z.string().optional(),
  returnDate: z.string().datetime().optional(),
});
export type CreateReturnInput = z.infer<typeof CreateReturnSchema>;
