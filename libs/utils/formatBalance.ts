export function formatBalance(value: string | number, maxDecimals = 6): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  const fixed = num.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, '');
}
