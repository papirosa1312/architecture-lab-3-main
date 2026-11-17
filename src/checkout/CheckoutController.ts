import { auditLog, runtimeConfig } from "../config.ts";
import { calculateTotal, type CartLine } from "../shared/calculateTotal.ts";
import { OrderService } from "../orders/OrderService.ts";

export type CheckoutRequest = {
  orderId: string;
  paymentToken: string;
  currency: string;
  lines: CartLine[];
};

export class CheckoutController {
  private readonly orders: OrderService;

  constructor(orders = new OrderService()) {
    this.orders = orders;
  }

  async checkout(request: CheckoutRequest) {
    const total = calculateTotal(request.lines, {
      taxRate: runtimeConfig.taxRate,
      discountPercent: runtimeConfig.discountPercent,
    });
    auditLog.push(`total_calculated:${total}`);

    const order = await this.orders.placeOrder({
      orderId: request.orderId,
      lines: request.lines,
      total,
      paymentToken: request.paymentToken,
      currency: request.currency,
    });

    return {
      orderId: order.id,
      status: order.status,
      total: order.total,
      paymentStatus: order.paymentStatus,
    };
  }
}