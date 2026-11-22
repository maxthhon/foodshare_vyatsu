import { PaymentStatus } from '../generated/prisma/enums.js';

export type PaymentOutcome = 'success' | 'failure';
type ChargeResult = { provider: string; status: typeof PaymentStatus.SUCCEEDED | typeof PaymentStatus.FAILED };

export interface PaymentService {
  charge(amount: number, outcome: PaymentOutcome): ChargeResult;
  refund(amount: number): { status: typeof PaymentStatus.REFUNDED; refundedAt: Date };
}

export const paymentService: PaymentService = {
  charge(_amount, outcome) {
    return { provider: 'MOCK', status: outcome === 'success' ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED };
  },
  refund(_amount) {
    return { status: PaymentStatus.REFUNDED, refundedAt: new Date() };
  },
};
