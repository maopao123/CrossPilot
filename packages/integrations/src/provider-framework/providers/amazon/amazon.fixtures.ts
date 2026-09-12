export const MOCK_AMAZON_FIXTURES = {
  participations: {
    payload: [
      {
        marketplace: {
          id: 'ATVPDKIKX0DER',
          countryCode: 'US',
          name: 'Amazon.com',
          defaultCurrencyCode: 'USD',
          defaultLanguageCode: 'en_US',
        },
        participation: { isParticipating: true },
      },
    ],
  },
  listings: {
    items: [
      {
        sku: 'MTH-WHITE-001',
        summaries: [{ asin: 'B0C7M8W101', itemName: 'Marble Toothbrush Holder White', status: 'BUYABLE' }],
        offers: [{ price: { amount: '29.99', currencyCode: 'USD' } }],
      },
    ],
  },
  orders: {
    payload: {
      Orders: [
        {
          AmazonOrderId: '114-0000001-0000001',
          OrderStatus: 'Shipped',
          PurchaseDate: '2026-09-01T12:00:00Z',
          MarketplaceId: 'ATVPDKIKX0DER',
          OrderTotal: { Amount: '29.99', CurrencyCode: 'USD' },
          OrderItems: [
            { SellerSKU: 'MTH-WHITE-001', ASIN: 'B0C7M8W101', QuantityOrdered: 1, ItemPrice: { Amount: '29.99' } },
          ],
        },
      ],
    },
  },
  inventory: {
    payload: {
      inventorySummaries: [
        {
          sellerSku: 'MTH-WHITE-001',
          asin: 'B0C7M8W101',
          inventoryDetails: {
            fulfillableQuantity: 42,
            reservedQuantity: { totalReservedQuantity: 2 },
            inboundWorkingQuantity: 0,
            inboundShippedQuantity: 10,
            inboundReceivingQuantity: 0,
            unfulfillableQuantity: 0,
          },
        },
      ],
    },
  },
  finances: {
    payload: {
      transactions: [
        {
          postedDate: '2026-09-01T00:00:00Z',
          transactionType: 'Shipment',
          totalAmount: { currencyAmount: -4.5, currencyCode: 'USD' },
          description: 'FBA fee (fixture)',
        },
      ],
    },
  },
};
