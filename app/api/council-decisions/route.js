import { readFile } from 'fs/promises'
import { join } from 'path'
import { loadJsonData } from '../_lib/load-json'
import { getCouncilSummaryUrl, getVotingDataUrl, getLobbyistDataUrl, getGcsBaseUrl } from '../_lib/gcs-urls'

export const revalidate = 3600

const VOTING_DATA_PATH = 'data/processed/council_voting.json'
const LOBBYIST_DATA_PATH = 'data/processed/lobbyist_activity.json'
const COUNCIL_SUMMARY_GOLD_PATH = 'data/gold/council-decisions/summary.json'

const loadLocalJson = async (localPath) => {
  const fileContent = await readFile(join(process.cwd(), localPath), 'utf-8')
  return JSON.parse(fileContent)
}

const fetchJson = async (url) => {
  const response = await fetch(url, { next: { revalidate } })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  }
  return response.json()
}

const loadCouncilSummary = async () => {
  const summaryUrl = getCouncilSummaryUrl()
  if (summaryUrl) {
    try {
      return await fetchJson(summaryUrl)
    } catch (error) {
      console.warn('Gold council summary fetch failed, trying local file:', error.message)
    }
  }
  return loadLocalJson(COUNCIL_SUMMARY_GOLD_PATH)
}

const loadCouncilYearSummary = async (year) => {
  if (!Number.isFinite(year)) return null

  const baseUrl = getGcsBaseUrl()
  const yearUrl = `${baseUrl}/gold/council-decisions/${year}.json`

  try {
    return await fetchJson(yearUrl)
  } catch (error) {
    console.warn(`Council year summary fetch failed for ${year}, trying local file:`, error.message)
  }

  try {
    return await loadLocalJson(`data/gold/council-decisions/${year}.json`)
  } catch (error) {
    console.warn(`Local council year summary missing for ${year}:`, error.message)
  }

  return null
}

const filterRecordsByYear = (records, dateFields, year) => {
  const yearRecords = []
  for (const record of records) {
    let recordYear = null
    for (const field of dateFields) {
      if (!record[field]) continue
      const parsed = new Date(record[field])
      if (!Number.isNaN(parsed.valueOf())) {
        recordYear = parsed.getFullYear()
        break
      }
    }
    if (recordYear === year) {
      yearRecords.push(record)
    }
  }
  return yearRecords
}

const loadVotingData = async () => {
  return loadJsonData({
    url: getVotingDataUrl(),
    localPath: VOTING_DATA_PATH,
    revalidateSeconds: revalidate,
    cacheMode: 'no-store'
  })
}

const loadLobbyistData = async () => {
  return loadJsonData({
    url: getLobbyistDataUrl(),
    localPath: LOBBYIST_DATA_PATH,
    revalidateSeconds: revalidate,
    cacheMode: 'no-store'
  })
}

const countUniqueMeetings = (motions) => {
  const dates = new Set()
  for (const motion of motions) {
    if (!motion.meeting_date) continue
    const dateText = String(motion.meeting_date).slice(0, 10)
    if (dateText.length === 10) {
      dates.add(dateText)
    }
  }
  return dates.size
}

const getCategoryLabel = (category) => {
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

const aggregateDecisionCategories = (motions) => {
  const categories = {}

  for (const motion of motions) {
    const cat = motion.motion_category
    if (!categories[cat]) {
      categories[cat] = {
        category: cat,
        label: getCategoryLabel(cat),
        total_motions: 0,
        passed: 0,
        failed: 0
      }
    }

    categories[cat].total_motions += 1
    if (motion.vote_outcome === 'passed') {
      categories[cat].passed += 1
    } else if (motion.vote_outcome === 'failed') {
      categories[cat].failed += 1
    }
  }

  // Calculate pass rates
  const categoryArray = Object.values(categories).map(cat => ({
    ...cat,
    pass_rate: cat.total_motions > 0 ? (cat.passed / cat.total_motions) * 100 : 0
  }))

  // Sort by total motions
  categoryArray.sort((a, b) => b.total_motions - a.total_motions)

  return categoryArray
}

const aggregateCouncillorVoting = (motions) => {
  const councillors = {}

  for (const motion of motions) {
    if (!motion.votes || !Array.isArray(motion.votes)) continue

    for (const vote of motion.votes) {
      const name = vote.councillor_name
      if (!name) continue

      if (!councillors[name]) {
        councillors[name] = {
          councillor_name: name,
          votes_cast: 0,
          yes_votes: 0,
          no_votes: 0,
          absent: 0,
          // New fields for amendment/defer/refer tracking
          tried_to_amend_count: 0,
          tried_to_defer_count: 0,
          tried_to_refer_count: 0
        }
      }

      councillors[name].votes_cast += 1
      
      const voteValue = vote.final_vote
      if (voteValue === 'Yes') {
        councillors[name].yes_votes += 1
      } else if (voteValue === 'No') {
        councillors[name].no_votes += 1
      } else {
        councillors[name].absent += 1
      }
      
      // Track amendment/defer/refer attempts (new schema)
      if (vote.tried_to_amend) {
        councillors[name].tried_to_amend_count += 1
      }
      if (vote.tried_to_defer) {
        councillors[name].tried_to_defer_count += 1
      }
      if (vote.tried_to_refer) {
        councillors[name].tried_to_refer_count += 1
      }
    }
  }

  // Calculate participation rates
  const totalMotions = motions.length
  const councillorArray = Object.values(councillors).map(c => ({
    ...c,
    participation_rate: totalMotions > 0 ? (c.votes_cast / totalMotions) * 100 : 0
  }))

  // Sort by participation rate
  councillorArray.sort((a, b) => b.participation_rate - a.participation_rate)

  return councillorArray
}

const aggregateLobbyingSummary = (lobbyingRecords) => {
  const subjects = {}
  let activeRegistrations = 0
  let recentCommunications = 0

  for (const record of lobbyingRecords) {
    // Count active registrations (unique lobbyist names)
    activeRegistrations += 1

    // Count communications
    if (record.communication_date) {
      recentCommunications += 1
    }

    // Track subjects
    const cat = record.subject_category
    subjects[cat] = (subjects[cat] || 0) + 1
  }

  // Get top 5 subjects
  const topSubjects = Object.entries(subjects)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat]) => cat)

  return {
    active_registrations: activeRegistrations,
    recent_communications: recentCommunications,
    top_subjects: topSubjects
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedYear = Number.parseInt(searchParams.get('year'), 10)
    const year = Number.isFinite(requestedYear) ? requestedYear : 2024

    if (Number.isFinite(requestedYear)) {
      const yearSummary = await loadCouncilYearSummary(year)
      if (yearSummary && yearSummary.recent_decisions) {
        return Response.json(yearSummary)
      }
    }

    try {
      const summary = await loadCouncilSummary()
      if (summary && summary.recent_decisions) {
        return Response.json(summary)
      }
    } catch (summaryError) {
      console.warn('Council summary unavailable, falling back to raw data:', summaryError.message)
    }

    const recentDays = Number.parseInt(searchParams.get('recent'), 10)
    const recent = Number.isFinite(recentDays) ? recentDays : 365

    // Load data
    const votingData = await loadVotingData()
    const lobbyingData = await loadLobbyistData()

    let filteredVoting = votingData
    let filteredLobbying = lobbyingData

    if (Number.isFinite(requestedYear)) {
      filteredVoting = filterRecordsByYear(votingData, ['meeting_date'], year)
      filteredLobbying = filterRecordsByYear(lobbyingData, ['communication_date', 'registration_date'], year)
    } else {
      // Filter voting data to recent days
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - recent)

      filteredVoting = votingData.filter(motion => {
        if (!motion.meeting_date) return false
        const motionDate = new Date(motion.meeting_date)
        return motionDate >= cutoffDate
      })
    }

    // Prepare recent decisions (simplified for display)
    const recentDecisions = filteredVoting.slice(0, 20).map(motion => ({
      meeting_date: motion.meeting_date,
      motion_id: motion.motion_id,
      motion_title: motion.motion_title,
      motion_category: motion.motion_category,
      vote_outcome: motion.vote_outcome,
      yes_votes: motion.yes_votes,
      no_votes: motion.no_votes,
      absent_votes: motion.absent_votes,
      vote_margin_percent: motion.yes_votes + motion.no_votes > 0
        ? ((motion.yes_votes / (motion.yes_votes + motion.no_votes)) * 100).toFixed(1)
        : 0
    }))

    // Aggregate decision categories
    const decisionCategories = aggregateDecisionCategories(filteredVoting)

    // Aggregate councillor voting patterns
    const councillorVoting = aggregateCouncillorVoting(filteredVoting)

    // Aggregate lobbying summary
    const lobbying = aggregateLobbyingSummary(filteredLobbying)
    const meetingCount = countUniqueMeetings(filteredVoting)

    return Response.json({
      recent_decisions: recentDecisions,
      decision_categories: decisionCategories,
      councillor_voting_patterns: councillorVoting.slice(0, 25), // Top 25 councillors
      lobbying_summary: lobbying,
      metadata: {
        year,
        recent_days: recent,
        total_motions: filteredVoting.length,
        motions_passed: filteredVoting.filter(m => m.vote_outcome === 'passed').length,
        motions_failed: filteredVoting.filter(m => m.vote_outcome === 'failed').length,
        pass_rate: filteredVoting.length > 0
          ? ((filteredVoting.filter(m => m.vote_outcome === 'passed').length / filteredVoting.length) * 100).toFixed(1)
          : 0,
        meeting_count: meetingCount
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Council decisions API error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
