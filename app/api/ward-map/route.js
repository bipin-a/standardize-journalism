import { loadJsonData } from '../_lib/load-json'
import { getCapitalDataUrl, getWardGeoJsonUrl } from '../_lib/gcs-urls'

export const revalidate = 3600

const LOCAL_DATA_PATH = 'data/processed/capital_by_ward.json'
const LOCAL_GEOJSON_PATH = 'data/processed/ward_boundaries.geojson'
let wardGeoJSONCache = null

const loadCapitalData = async () => {
  return loadJsonData({
    url: getCapitalDataUrl(),
    localPath: LOCAL_DATA_PATH,
    revalidateSeconds: revalidate,
    cacheMode: 'no-store'
  })
}

const fetchWardGeoJSON = async () => {
  if (wardGeoJSONCache) {
    return wardGeoJSONCache
  }

  const geoJSON = await loadJsonData({
    url: getWardGeoJsonUrl(),
    localPath: LOCAL_GEOJSON_PATH,
    revalidateSeconds: revalidate,
    cacheMode: 'no-store'
  })
  wardGeoJSONCache = geoJSON
  return geoJSON
}

const aggregateByWard = (records) => {
  const wardTotals = new Map()

  for (const record of records) {
    const wardNum = record.ward_number
    if (wardNum === 0) continue // Skip city-wide

    const wardKey = wardNum
    const current = wardTotals.get(wardKey) ?? {
      ward_number: wardNum,
      ward_name: record.ward_name,
      totalAmount: 0,
      projectCount: 0
    }

    current.totalAmount += record.amount
    current.projectCount += 1

    wardTotals.set(wardKey, current)
  }

  return wardTotals
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedYear = Number.parseInt(searchParams.get('year'), 10)

    // Load capital data
    const allRecords = await loadCapitalData()
    const availableYears = [...new Set(allRecords.map(r => r.fiscal_year))].sort((a, b) => a - b)
    if (availableYears.length === 0) {
      return Response.json({ error: 'No capital budget data available' }, { status: 404 })
    }
    const year = Number.isFinite(requestedYear) && availableYears.includes(requestedYear)
      ? requestedYear
      : availableYears[availableYears.length - 1]

    const yearRecords = allRecords.filter(r => r.fiscal_year === year && r.ward_number !== 0)

    // Aggregate by ward
    const wardTotals = aggregateByWard(yearRecords)

    // Fetch ward boundaries GeoJSON
    const wardGeoJSON = await fetchWardGeoJSON()

    // Enrich GeoJSON features with capital investment data
    const enrichedFeatures = wardGeoJSON.features.map((feature) => {
      const wardShortCode = feature.properties.AREA_SHORT_CODE
      const wardNumber = wardShortCode ? Number.parseInt(wardShortCode, 10) : null

      const wardData = wardNumber ? wardTotals.get(wardNumber) : null

      return {
        ...feature,
        properties: {
          ...feature.properties,
          ward_number: wardNumber || 0,
          ward_name: feature.properties.AREA_NAME || 'Unknown',
          total_investment: wardData ? wardData.totalAmount : 0,
          project_count: wardData ? wardData.projectCount : 0
        }
      }
    })

    // Calculate max for color scaling
    const maxInvestment = Math.max(...enrichedFeatures.map(f => f.properties.total_investment || 0))

    return Response.json({
      type: 'FeatureCollection',
      features: enrichedFeatures,
      metadata: {
        year,
        maxInvestment,
        wardCount: enrichedFeatures.length
      }
    })
  } catch (error) {
    console.error('Ward map API error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
