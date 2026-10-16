export function toOptions<T extends string | number>(list: readonly T[], labels: Record<T, string>) {
  return list.map(v => ({ value: String(v), label: labels[v] }));
}
