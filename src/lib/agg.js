export function groupBy(list, keyFn) {
  const out = {};
  for (const item of list) {
    const k = keyFn(item);
    (out[k] || (out[k] = [])).push(item);
  }
  return out;
}

export function sumBy(list, valFn) {
  let total = 0;
  for (const item of list) total += Number(valFn(item)) || 0;
  return total;
}
