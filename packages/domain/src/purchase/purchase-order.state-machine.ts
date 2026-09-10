export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'SHIPPED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export class PurchaseOrderStateMachine {
  private static readonly VALID_TRANSITIONS: Record<
    PurchaseOrderStatus,
    PurchaseOrderStatus[]
  > = {
    DRAFT: ['SUBMITTED', 'CONFIRMED', 'CANCELLED'],
    SUBMITTED: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
    PARTIALLY_RECEIVED: ['RECEIVED', 'CANCELLED'],
    RECEIVED: [], // Terminal success state
    CANCELLED: [], // Terminal state
  };

  public static canTransition(
    current: PurchaseOrderStatus,
    next: PurchaseOrderStatus,
  ): boolean {
    const allowed = this.VALID_TRANSITIONS[current] || [];
    return allowed.includes(next);
  }

  public static assertTransition(
    current: PurchaseOrderStatus,
    next: PurchaseOrderStatus,
  ): void {
    if (!this.canTransition(current, next)) {
      throw new Error(
        `PURCHASE_INVALID_STATUS_TRANSITION: Cannot transition purchase order from ${current} to ${next}`,
      );
    }
  }
}
