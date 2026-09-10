import { InventoryMovementService, InventoryState } from '../src/inventory/inventory-movement.service';

describe('InventoryMovementService', () => {
  const baseState: InventoryState = {
    fulfillableQuantity: 100,
    reservedQuantity: 0,
    inboundQuantity: 50,
    unfulfillableQuantity: 0,
  };

  it('AC 1: PO Receive -> Inventory + should increase fulfillable quantity', () => {
    const nextState = InventoryMovementService.calculateReceiptInbound(baseState, 30);
    expect(nextState.fulfillableQuantity).toBe(130);
    expect(nextState.inboundQuantity).toBe(20);
  });

  it('AC 2: Order -> Inventory - should decrease fulfillable quantity', () => {
    const nextState = InventoryMovementService.calculateOrderFulfillment(baseState, 25);
    expect(nextState.fulfillableQuantity).toBe(75);
  });

  it('AC 2: Order -> Inventory - should throw INVENTORY_NOT_ENOUGH when stock is insufficient', () => {
    expect(() => {
      InventoryMovementService.calculateOrderFulfillment(baseState, 150);
    }).toThrow(/INVENTORY_NOT_ENOUGH/);
  });
});
