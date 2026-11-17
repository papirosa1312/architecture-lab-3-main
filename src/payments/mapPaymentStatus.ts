import type { StripeResponse } from "./internal/StripeClient.ts";

export type PaymentStatus = "paid" | "processing" | "failed";

export function mapPaymentStatus(
  response: StripeResponse | { state: string },
): PaymentStatus {
  if (response.state === "succeeded") return "paid";
  if (response.state === "requires_action" || response.state === "processing") {
    return "processing";
  }
  return "failed";
}