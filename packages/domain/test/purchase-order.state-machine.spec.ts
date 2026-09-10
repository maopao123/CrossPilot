import { PurchaseOrderStateMachine } from '../src/purchase/purchase-order.state-machine';

describe('PurchaseOrderStateMachine', () => {
  it('should allow valid lifecycle transitions', () => {
    expect(PurchaseOrderStateMachine.canTransition('DRAFT', 'CONFIRMED')).toBe(true);
    expect(PurchaseOrderStateMachine.canTransition('CONFIRMED', 'SHIPPED')).toBe(true);
    expect(PurchaseOrderStateMachine.canTransition('SHIPPED', 'RECEIVED')).toBe(true);
  });

  it('should reject invalid lifecycle transitions', () => {
    expect(PurchaseOrderStateMachine.canTransition('DRAFT', 'RECEIVED')).toBe(false);
    expect(PurchaseOrderStateMachine.canTransition('RECEIVED', 'DRAFT')).toBe(false);
    expect(PurchaseOrderStateMachine.canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
  });

  it('should throw PURCHASE_INVALID_STATUS_TRANSITION on illegal transition', () => {
    expect(() => {
      PurchaseOrderStateMachine.assertTransition('DRAFT', 'RECEIVED');
    }).toThrow(/PURCHASE_INVALID_STATUS_TRANSITION/);
  });
});
