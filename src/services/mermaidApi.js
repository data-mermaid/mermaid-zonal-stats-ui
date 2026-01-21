const MERMAID_API_URL = import.meta.env.VITE_MERMAID_API_URL

export const createMermaidApi = (getAccessToken) => ({
  async getMe() {
    const token = await getAccessToken()
    const response = await fetch(`${MERMAID_API_URL}/me/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch user: ${response.status}`)
    }
    return response.json()
  },

  async getProjectSummarySampleEvents(onProgress) {
    const token = await getAccessToken()
    const results = []
    let nextUrl = `${MERMAID_API_URL}/projectsummarysampleevents/?limit=300&page=1`

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status}`)
      }
      const data = await response.json()
      results.push(...data.results)

      if (onProgress) {
        onProgress({ loaded: results.length, total: data.count })
      }

      nextUrl = data.next
    }

    return results
  },
})

// Extract unique projects from projectsummarysampleevents response
// Only includes projects with at least one sample event, sorted alphabetically
export function extractProjects(projectSummaries) {
  return projectSummaries
    .filter((p) => p.records?.length > 0)
    .map((p) => ({
      id: p.project_id,
      name: p.project_name,
      tags: p.tags || [],
      recordCount: p.records.length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Extract unique countries from all records (only from projects with SEs)
export function extractCountries(projectSummaries) {
  const countries = new Set()
  projectSummaries
    .filter((p) => p.records?.length > 0)
    .forEach((project) => {
      project.records.forEach((record) => {
        if (record.country_name) {
          countries.add(record.country_name)
        }
      })
    })
  return [...countries].sort()
}

// Extract unique organizations from project tags (only from projects with SEs)
export function extractOrganizations(projectSummaries) {
  const orgs = new Set()
  projectSummaries
    .filter((p) => p.records?.length > 0)
    .forEach((project) => {
      project.tags?.forEach((tag) => {
        if (tag.name) {
          orgs.add(tag.name)
        }
      })
    })
  return [...orgs].sort()
}

// Flatten all records with project context for easier filtering
export function flattenRecords(projectSummaries) {
  const records = []
  projectSummaries.forEach((project) => {
    project.records?.forEach((record) => {
      records.push({
        ...record,
        project_id: project.project_id,
        project_tags: project.tags || [],
      })
    })
  })
  return records
}
