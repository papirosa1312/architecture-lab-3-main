// Deliberate boundary violation: Payments reaches into Orders internals.
import { markOrderPaid } from "../../orders/internal/orderMutations.ts";

export type StripePayload = {
  id: string;
  amount: number;
  currency: string;
  metadata: { orderId: string };
};

export type StripeResponse = {
  charge_id: string;
  state: "succeeded" | "requires_action" | "declined";
};

export class StripeClient {
  async createCharge(payload: StripePayload): Promise<StripeResponse> {
    let state: StripeResponse["state"] = "succeeded";
    if (payload.id.startsWith("fail_")) {
      state = "declined";
    } else if (payload.id.startsWith("proc_")) {
      state = "requires_action";
    }

    const response: StripeResponse = { charge_id: `ch_${payload.id}`, state };
    const mappedStatus =
      state === "succeeded"
        ? "paid"
        : state === "requires_action"
          ? "processing"
          : "failed";
    markOrderPaid(payload.metadata.orderId, mappedStatus);
    return response;
  }
}