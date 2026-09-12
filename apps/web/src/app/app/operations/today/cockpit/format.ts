export function usd(value: number): string {
  if (!Number.isFinite(value)) return 'N/A';
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function usdExact(value: number): string {
  if (!Number.isFinite(value)) return 'N/A';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(rate: number): string {
  if (!Number.isFinite(rate)) return 'N/A';
  return `${(rate * 100).toFixed(1)}%`;
}

export function ratio(value: number): string {
  if (!Number.isFinite(value)) return 'N/A';
  return value.toFixed(2);
}
