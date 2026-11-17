import { database } from "../database.ts";
import type { CartLine } from "../shared/calculateTotal.ts";
import { StockRepository } from "../inventory/StockRepository.ts";
import { PaymentService } from "../payments/PaymentService.ts";

export type PlaceOrderCommand = {
  orderId: string;
  lines: readonly CartLine[];
  total: number;
  paymentToken: string;
  currency: string;
};

export class OrderService {
  private readonly stock: StockRepository;
  private readonly payments: PaymentService;

  constructor(
    stock = new StockRepository(),
    payments = new PaymentService(),
  ) {
    this.stock = stock;
    this.payments = payments;
  }

  async placeOrder(command: PlaceOrderCommand) {
    this.stock.reserve(command.lines);

    database.orders.set(command.orderId, {
      id: command.orderId,
      status: "created",
      total: command.total,
    });

    const paymentResult = await this.payments.authorizePayment({
      orderId: command.orderId,
      paymentToken: command.paymentToken,
      amount: command.total,
      currency: command.currency,
    });

    const order = database.orders.get(command.orderId)!;
    order.paymentStatus = paymentResult.status;
    order.status =
      paymentResult.status === "paid" ? "confirmed" : "payment_pending";

    return { ...order };
  }
}