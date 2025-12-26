import { loadJsonData } from '../_lib/load-json'

export const revalidate = 3600

const LOCAL_DATA_PATH = 'data/processed/capital_by_ward.json'
const WARD_GEOJSON_CACHE_KEY = 'ward_boundaries_geojson'
let wardGeoJSONCache = null

const loadCapitalData = async () => {
  return loadJsonData({
    envKey: 'CAPITAL_DATA_URL',
    localPath: LOCAL_DATA_PATH,
    revalidateSeconds: revalidate
  })
}

const fetchWardGeoJSON = async () => {
  if (wardGeoJSONCache) {
    return wardGeoJSONCache
  }

  // Fetch 25-ward GeoJSON from Toronto Open Data CKAN API
  // Use the cached GeoJSON resource (WGS84 lat/lng - EPSG:4326)
  const geojsonResourceId = '737b29e0-8329-4260-b6af-21555ab24f28'
  const downloadUrl = `https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/5e7a8234-f805-43ac-820f-03d7c360b588/resource/${geojsonResourceId}/download/city-wards-data.geojson`

  const response = await fetch(downloadUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch ward GeoJSON: ${response.statusText}`)
  }

  const geoJSON = await response.json()
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
    const year = Number.isFinite(requestedYear) ? requestedYear : 2024

    // Load capital data
    const allRecords = await loadCapitalData()
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
