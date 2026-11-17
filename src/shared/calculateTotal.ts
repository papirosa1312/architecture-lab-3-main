export type CartLine = {
  productId: string;
  unitPrice: number;
  quantity: number;
  lineTotal?: number;
};

export type PricingRules = {
  taxRate: number;
  discountPercent: number;
};

export function calculateTotal(
  lines: readonly CartLine[],
  pricing: PricingRules = { taxRate: 0.2, discountPercent: 0 },
): number {
  let subtotal = 0;

  for (const line of lines) {
    subtotal += line.unitPrice * line.quantity;
  }

  const discounted = subtotal * (1 - pricing.discountPercent / 100);
  return Number((discounted * (1 + pricing.taxRate)).toFixed(2));
}