import { applyFilters, resolveYearList } from './data-loader'

export { applyFilters, resolveYearList }

export const formatMoney = (amount) => {
  const value = Number(amount) || 0
  if (Math.abs(value) >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`
  }
  if (Math.abs(value) >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`
  }
  return `$${value.toFixed(0)}`
}
