export type IncludedTaxBreakdown = {
  taxableAmount: number;
  taxAmount: number;
  total: number;
  taxRate: number;
};

function round(value: number, decimals = 2): number {
  return Number(Number(value || 0).toFixed(decimals));
}

export function normalizeTaxRate(rate: number): number {
  const numeric = Number(rate || 0);
  return numeric > 1 ? numeric / 100 : numeric;
}

export function splitIncludedTax(totalWithTax: number, rate: number): IncludedTaxBreakdown {
  const total = round(totalWithTax);
  const taxRate = normalizeTaxRate(rate);

  if (!taxRate) {
    return { taxableAmount: total, taxAmount: 0, total, taxRate };
  }

  const taxableAmount = round(total / (1 + taxRate));
  const taxAmount = round(total - taxableAmount);

  return { taxableAmount, taxAmount, total, taxRate };
}
