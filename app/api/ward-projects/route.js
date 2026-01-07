import { readFile } from 'fs/promises'
import { join } from 'path'
import { loadJsonData } from '../_lib/load-json'
import { getCapitalDataUrl } from '../_lib/gcs-urls'

export const revalidate = 3600

const LOCAL_DATA_PATH = 'data/processed/capital_by_ward.json'

// Variance Report Links
const VARIANCE_PDF_LINKS = {
  2021: 'https://www.toronto.ca/legdocs/mmis/2022/ex/bgrd/backgroundfile-228039.pdf',
  2022: 'https://www.toronto.ca/legdocs/mmis/2023/ex/bgrd/backgroundfile-237833.pdf',
  2023: 'https://www.toronto.ca/legdocs/mmis/2024/ex/bgrd/backgroundfile-247343.pdf',
  2024: 'https://www.toronto.ca/legdocs/mmis/2025/ex/bgrd/backgroundfile-257072.pdf'
}

const loadLocalJson = async (localPath) => {
  const fileContent = await readFile(join(process.cwd(), localPath), 'utf-8')
  return JSON.parse(fileContent)
}

const loadCapitalProcessed = async () => {
  return loadJsonData({
    url: getCapitalDataUrl(),
    localPath: LOCAL_DATA_PATH,
    revalidateSeconds: revalidate,
    cacheMode: 'no-store'
  })
}

// Generate a search URL for the Toronto Open Data portal
const getTorontoOpenDataSearchUrl = (projectName) => {
  const searchTerm = encodeURIComponent(projectName.toLowerCase().split(' ').slice(0, 4).join(' '))
  return `https://open.toronto.ca/catalogue/?search=${searchTerm}`
}

// Generate a URL to search Toronto city website
const getTorontoSearchUrl = (projectName) => {
  const searchTerm = encodeURIComponent(projectName)
  return `https://www.toronto.ca/search/?s=${searchTerm}`
}

// Slugify ward name for URL (e.g., "Etobicoke North" -> "etobicoke-north")
const slugifyWardName = (wardName) => {
  return wardName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
}

// Generate ward profile URL
const getWardProfileUrl = (wardNumber, wardName) => {
  const slug = slugifyWardName(wardName)
  return `https://www.toronto.ca/city-government/data-research-maps/neighbourhoods-communities/ward-profiles/ward-${wardNumber}-${slug}/`
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const wardNumber = Number.parseInt(searchParams.get('ward'), 10)
    const requestedYear = Number.parseInt(searchParams.get('year'), 10)

    if (!Number.isFinite(wardNumber)) {
      return Response.json({ error: 'Ward number is required' }, { status: 400 })
    }

    const allRecords = await loadCapitalProcessed()
    
    // Get available years
    const availableYears = [...new Set(allRecords.map(r => r.fiscal_year))].sort((a, b) => b - a)
    const displayYear = Number.isFinite(requestedYear) && availableYears.includes(requestedYear)
      ? requestedYear
      : availableYears[0]

    // Filter records for this ward AND the selected year only
    const wardRecords = allRecords.filter(
      r => r.ward_number === wardNumber && r.fiscal_year === displayYear
    )

    if (wardRecords.length === 0) {
      return Response.json({
        error: `No projects found for ward ${wardNumber}`,
        wardNumber,
        displayYear,
        availableYears
      }, { status: 404 })
    }

    // Aggregate projects (same project may appear multiple times with different categories)
    const projectMap = new Map()

    for (const record of wardRecords) {
      const key = record.project_name
      const existing = projectMap.get(key)

      if (existing) {
        existing.totalAmount += record.amount
        existing.categories.add(record.category)
        if (!existing.programs.includes(record.program_name)) {
          existing.programs.push(record.program_name)
        }
        // Aggregate yearly breakdown for this project
        const recordYear = record.fiscal_year
        existing.yearlyBreakdown[recordYear] = (existing.yearlyBreakdown[recordYear] || 0) + record.amount
      } else {
        projectMap.set(key, {
          project_name: record.project_name,
          totalAmount: record.amount,
          programs: [record.program_name],
          categories: new Set([record.category]),
          source_url: record.source_url,
          ward_name: record.ward_name,
          yearlyBreakdown: { [record.fiscal_year]: record.amount }
        })
      }
    }

    // Convert to array and add links
    const projects = Array.from(projectMap.values())
      .map(project => {
        // Calculate timeline from yearly breakdown
        const projectYears = Object.keys(project.yearlyBreakdown).map(Number).sort()
        const startYear = Math.min(...projectYears)
        const endYear = Math.max(...projectYears)
        const duration = endYear - startYear + 1

        return {
          project_name: project.project_name,
          amount: project.totalAmount,
          programs: project.programs,
          categories: Array.from(project.categories),
          primary_category: Array.from(project.categories)[0],
          ward_name: project.ward_name,
          yearlyBreakdown: project.yearlyBreakdown,
          timeline: {
            startYear,
            endYear,
            duration
          },
          links: {
            toronto_search: getTorontoSearchUrl(project.project_name),
            open_data: getTorontoOpenDataSearchUrl(project.project_name),
            source_data: project.source_url,
            ward_profile: getWardProfileUrl(wardNumber, project.ward_name),
            ...(VARIANCE_PDF_LINKS[displayYear] && { capital_variance_report: VARIANCE_PDF_LINKS[displayYear] }),
            ...(project.totalAmount > 10000000 && {
              major_projects: 'https://www.toronto.ca/services-payments/streets-parking-transportation/road-restrictions-closures/restrictions-and-closures/major-projects/'
            })
          }
        }
      })
      .sort((a, b) => b.amount - a.amount)

    // Get ward metadata
    const wardName = wardRecords[0]?.ward_name || `Ward ${wardNumber}`
    const totalInvestment = projects.reduce((sum, p) => sum + p.amount, 0)

    // Category breakdown for this ward
    const categoryTotals = new Map()
    for (const project of projects) {
      for (const category of project.categories) {
        const current = categoryTotals.get(category) || 0
        categoryTotals.set(category, current + project.amount)
      }
    }
    const categoryBreakdown = Array.from(categoryTotals.entries())
      .map(([name, amount]) => ({ name, amount, share: (amount / totalInvestment) * 100 }))
      .sort((a, b) => b.amount - a.amount)

    return Response.json({
      wardNumber,
      wardName,
      displayYear,  // Year for display context (highlighting current year in viz)
      totalInvestment,  // Total across ALL years
      projectCount: projects.length,
      projects,  // Each project includes full 10-year breakdown
      categoryBreakdown,
      availableYears,  // All years in dataset
      links: {
        ward_profile: getWardProfileUrl(wardNumber, wardName),
        capital_budget_data: 'https://open.toronto.ca/dataset/budget-capital-budget-plan-by-ward-10-yr-approved/',
        budget_overview: 'https://www.toronto.ca/city-government/budget-finances/city-budget/',
        ...(VARIANCE_PDF_LINKS[displayYear] && { capital_variance_report: VARIANCE_PDF_LINKS[displayYear] })
      },
      metadata: {
        note: 'totalInvestment and yearlyBreakdown include all years. displayYear is for context only.'
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Ward Projects API error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
