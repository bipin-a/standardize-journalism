export const getCategoryLabel = (category) => {
  const labels = {
    transportation: 'Transit & Transportation',
    housing_development: 'Housing & Development',
    environment: 'Environment & Climate',
    budget_finance: 'Budget & Taxes',
    public_safety: 'Police & Safety',
    social_services: 'Community Services',
    governance: 'Council Operations',
    other: 'Other'
  }
  return labels[category] || category
}

export const formatWardLabel = (wardNumber, wardName) => {
  if (!wardNumber) return wardName || 'Unknown'
  return `Ward ${wardNumber} - ${wardName || 'Unknown'}`
}
