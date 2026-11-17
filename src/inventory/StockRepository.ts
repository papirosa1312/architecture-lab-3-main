import { database } from "../database.ts";

export type StockReservationItem = {
  productId: string;
  quantity: number;
};

export class StockRepository {
  find(productId: string) {
    return database.stock.get(productId);
  }

  reserve(items: readonly StockReservationItem[]): void {
    const plannedUpdates = new Map<string, number>();

    for (const item of items) {
      if (item.quantity <= 0) {
        throw new Error(`Invalid quantity for ${item.productId}`);
      }

      const currentAvailable =
        plannedUpdates.get(item.productId) ??
        database.stock.get(item.productId)?.available;

      if (currentAvailable === undefined || currentAvailable < item.quantity) {
        throw new Error(`Insufficient stock for ${item.productId}`);
      }

      plannedUpdates.set(item.productId, currentAvailable - item.quantity);
    }

    for (const [productId, available] of plannedUpdates.entries()) {
      database.stock.set(productId, { productId, available });
    }
  }
}