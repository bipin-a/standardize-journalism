const COMPACT_FORMATTER = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  notation: 'compact',
  maximumFractionDigits: 1
})

const FULL_FORMATTER = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0
})

export const formatCompactCurrency = (value) => {
  if (value === null || value === undefined) {
    return '-'
  }
  return COMPACT_FORMATTER.format(value)
}

export const formatCurrency = (value) => {
  if (value === null || value === undefined) {
    return '-'
  }
  return FULL_FORMATTER.format(value)
}

export const formatCount = (value) => {
  if (value === null || value === undefined) {
    return '-'
  }
  return Number(value).toLocaleString('en-CA')
}

export const formatPercent = (value) => {
  if (value === null || value === undefined) {
    return '-'
  }
  return `${value.toFixed(1)}%`
}

export const formatSignedPercent = (value) => {
  if (value === null || value === undefined) {
    return '-'
  }
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

export const formatSignedCurrency = (value) => {
  if (value === null || value === undefined) {
    return '-'
  }
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatCompactCurrency(Math.abs(value))}`
}

export const formatDate = (value) => {
  if (!value) {
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export const getHealthColor = (value, threshold, reverse = false) => {
  if (value === null || value === undefined) return '#94a3b8'
  const isWarning = reverse ? value < threshold : value > threshold
  return isWarning ? '#dc2626' : '#16a34a'
}
