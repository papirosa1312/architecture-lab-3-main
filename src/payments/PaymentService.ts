import { StripeClient, type StripePayload } from "./internal/StripeClient.ts";
import { mapPaymentStatus, type PaymentStatus } from "./mapPaymentStatus.ts";

export type AuthorizePaymentRequest = {
  orderId: string;
  paymentToken: string;
  amount: number;
  currency: string;
};

export type AuthorizePaymentResult = {
  transactionId: string;
  status: PaymentStatus;
};

export class PaymentService {
  private readonly stripe: StripeClient;

  constructor(stripe = new StripeClient()) {
    this.stripe = stripe;
  }

  async authorizePayment(
    request: AuthorizePaymentRequest,
  ): Promise<AuthorizePaymentResult> {
    const payload: StripePayload = {
      id: request.paymentToken,
      amount: Math.round(request.amount * 100),
      currency: request.currency,
      metadata: { orderId: request.orderId },
    };

    const response = await this.stripe.createCharge(payload);
    return {
      transactionId: response.charge_id,
      status: mapPaymentStatus(response),
    };
  }
}