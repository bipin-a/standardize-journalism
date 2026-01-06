import { getProcurementMetrics } from '../_lib/metric-data'

export const revalidate = 3600

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedYear = Number.parseInt(searchParams.get('year'), 10)
    const year = Number.isFinite(requestedYear) ? requestedYear : 2024

    const data = await getProcurementMetrics({ year, revalidate })
    return Response.json(data)
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
