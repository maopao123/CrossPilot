export interface InventoryState {
  fulfillableQuantity: number;
  reservedQuantity: number;
  inboundQuantity: number;
  unfulfillableQuantity: number;
}

export class InventoryMovementService {
  /**
   * AC 1: PO Receive -> Inventory +
   * Increases fulfillable quantity by receivedQuantity.
   */
  public static calculateReceiptInbound(
    current: InventoryState,
    receivedQuantity: number,
  ): InventoryState {
    if (receivedQuantity <= 0) {
      throw new Error('Received quantity must be greater than zero');
    }

    const newInbound = Math.max(0, current.inboundQuantity - receivedQuantity);
    const newFulfillable = current.fulfillableQuantity + receivedQuantity;

    return {
      fulfillableQuantity: newFulfillable,
      reservedQuantity: current.reservedQuantity,
      inboundQuantity: newInbound,
      unfulfillableQuantity: current.unfulfillableQuantity,
    };
  }

  /**
   * AC 2: Order -> Inventory -
   * Deducts orderQuantity from fulfillable stock.
   * Throws INVENTORY_NOT_ENOUGH if stock is insufficient.
   */
  public static calculateOrderFulfillment(
    current: InventoryState,
    orderQuantity: number,
  ): InventoryState {
    if (orderQuantity <= 0) {
      throw new Error('Order quantity must be greater than zero');
    }

    if (current.fulfillableQuantity < orderQuantity) {
      throw new Error(
        `INVENTORY_NOT_ENOUGH: Requested quantity ${orderQuantity} exceeds available fulfillable inventory ${current.fulfillableQuantity}`,
      );
    }

    const newFulfillable = current.fulfillableQuantity - orderQuantity;

    return {
      fulfillableQuantity: newFulfillable,
      reservedQuantity: current.reservedQuantity,
      inboundQuantity: current.inboundQuantity,
      unfulfillableQuantity: current.unfulfillableQuantity,
    };
  }
}
