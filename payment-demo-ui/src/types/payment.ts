export type PaymentStatus = "Created" | "Authorised" | "Captured" | "Refunded";

export type CreatePaymentRequest = {
  amount: number;
  currency: string;
  merchantReference: string;
  cardLast4: string;
};

export type PaymentSummary = {
  id: string;
  amount: number;
  currency: string;
  merchantReference: string;
  cardLast4: string;
  createdAt: string;
  status: PaymentStatus;
};

export type CreatePaymentResult = {
  payment: PaymentSummary;
  idempotentReplay: boolean;
};

export type PaymentHistoryEntry = {
  id: number;
  paymentId: string;
  at: string;
  status: PaymentStatus;
  note: string;
};
