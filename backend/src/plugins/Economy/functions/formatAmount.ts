/** Formats a currency amount with thousands separators, e.g. 13566 -> "13,566". */
export function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US");
}
