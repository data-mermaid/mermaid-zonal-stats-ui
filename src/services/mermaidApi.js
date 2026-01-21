const MERMAID_API_URL = import.meta.env.VITE_MERMAID_API_URL

// Protocol endpoint names mapped to display names
export const PROTOCOL_ENDPOINTS = {
  beltfish: { endpoint: 'beltfishes', displayName: 'Belt Fish' },
  benthiclit: { endpoint: 'benthiclits', displayName: 'Benthic LIT' },
  benthicpit: { endpoint: 'benthicpits', displayName: 'Benthic PIT' },
  benthicpqt: { endpoint: 'benthicpqts', displayName: 'Benthic PQT' },
  bleachingqc: { endpoint: 'bleachingqcs', displayName: 'Bleaching' },
  habitatcomplexity: { endpoint: 'habitatcomplexities', displayName: 'Habitat Complexity' },
}

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

  /**
   * Fetch protocol-specific CSV data for a project
   * @param {string} projectId - The project UUID
   * @param {string} protocol - Protocol key (e.g., 'beltfish', 'benthicpit')
   * @returns {Promise<string>} - Raw CSV text
   */
  async getProtocolCsv(projectId, protocol) {
    const token = await getAccessToken()
    const protocolInfo = PROTOCOL_ENDPOINTS[protocol]
    if (!protocolInfo) {
      throw new Error(`Unknown protocol: ${protocol}`)
    }

    const url = `${MERMAID_API_URL}/projects/${projectId}/${protocolInfo.endpoint}/sampleevents/csv/`
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch ${protocol} data: ${response.status}`)
    }

    return response.text()
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
