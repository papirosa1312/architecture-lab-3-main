import test from "node:test";
import assert from "node:assert/strict";
import { CheckoutController } from "../src/checkout/CheckoutController.ts";
import { database, resetDatabase } from "../src/database.ts";
import { auditLog, runtimeConfig } from "../src/config.ts";
import { mapPaymentStatus } from "../src/payments/mapPaymentStatus.ts";

test.beforeEach(() => {
  resetDatabase();
  auditLog.length = 0;
  runtimeConfig.taxRate = 0.2;
  runtimeConfig.discountPercent = 0;
  database.stock.set("book", { productId: "book", available: 5 });
});

test("successful checkout preserves the public response", async () => {
  const response = await new CheckoutController().checkout({
    orderId: "order-1",
    paymentToken: "tok_valid",
    currency: "UAH",
    lines: [{ productId: "book", unitPrice: 100, quantity: 2 }],
  });

  assert.deepEqual(response, {
    orderId: "order-1",
    status: "confirmed",
    total: 240,
    paymentStatus: "paid",
  });
  assert.equal(database.stock.get("book")?.available, 3);
});

test("failed payment keeps the existing API behaviour", async () => {
  const response = await new CheckoutController().checkout({
    orderId: "order-2",
    paymentToken: "fail_card",
    currency: "UAH",
    lines: [{ productId: "book", unitPrice: 50, quantity: 1 }],
  });

  assert.equal(response.paymentStatus, "failed");
  assert.equal(response.status, "payment_pending");
});

test("checkout rejects an unavailable product", async () => {
  await assert.rejects(
    () => new CheckoutController().checkout({
      orderId: "order-3",
      paymentToken: "tok_valid",
      currency: "UAH",
      lines: [{ productId: "book", unitPrice: 100, quantity: 6 }],
    }),
    /Insufficient stock/,
  );
});

test("mapPaymentStatus normalizes paid, processing, failed and unknown provider statuses", () => {
  assert.equal(mapPaymentStatus({ charge_id: "ch_1", state: "succeeded" }), "paid");
  assert.equal(mapPaymentStatus({ charge_id: "ch_2", state: "requires_action" }), "processing");
  assert.equal(mapPaymentStatus({ charge_id: "ch_3", state: "declined" }), "failed");
  assert.equal(mapPaymentStatus({ state: "unexpected_gateway_code" }), "failed");
});

test("checkout supports processing payment status without breaking existing contract", async () => {
  const response = await new CheckoutController().checkout({
    orderId: "order-proc",
    paymentToken: "proc_3ds",
    currency: "UAH",
    lines: [{ productId: "book", unitPrice: 100, quantity: 1 }],
  });

  assert.equal(response.paymentStatus, "processing");
  assert.equal(response.status, "payment_pending");
});