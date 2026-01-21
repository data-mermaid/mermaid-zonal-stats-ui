import * as XLSX from 'xlsx'
import { PROTOCOL_ENDPOINTS } from '../services/mermaidApi'

/**
 * Parse CSV text into an array of row arrays
 * Handles quoted fields with commas and escaped quotes
 * @param {string} csvText - Raw CSV text
 * @returns {Array<Array<string>>} - Array of rows, each row is array of cell values
 */
export function parseCsv(csvText) {
  const rows = []
  let currentRow = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i]
    const nextChar = csvText[i + 1]

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"'
          i++ // Skip next quote
        } else {
          // End of quoted field
          inQuotes = false
        }
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        currentRow.push(currentField)
        currentField = ''
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField)
        if (currentRow.length > 0 && currentRow.some((c) => c !== '')) {
          rows.push(currentRow)
        }
        currentRow = []
        currentField = ''
        if (char === '\r') i++ // Skip \n in \r\n
      } else if (char === '\r') {
        currentRow.push(currentField)
        if (currentRow.length > 0 && currentRow.some((c) => c !== '')) {
          rows.push(currentRow)
        }
        currentRow = []
        currentField = ''
      } else {
        currentField += char
      }
    }
  }

  // Handle last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField)
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow)
    }
  }

  return rows
}

/**
 * Convert CSV rows to array of objects using first row as headers
 * @param {Array<Array<string>>} rows - Parsed CSV rows
 * @returns {Object} - { headers: string[], data: Object[] }
 */
export function csvRowsToObjects(rows) {
  if (rows.length === 0) return { headers: [], data: [] }

  const headers = rows[0]
  const data = rows.slice(1).map((row) => {
    const obj = {}
    headers.forEach((header, i) => {
      obj[header] = row[i] ?? ''
    })
    return obj
  })

  return { headers, data }
}

/**
 * Generate covariate column headers and a lookup function
 * @param {Array} collections - Collection metadata with id and title
 * @param {Array} stats - List of stat names (mean, std, etc.)
 * @returns {Object} - { headers: string[], getValues: (sampleEventId, results) => string[] }
 */
export function createCovariateColumns(collections, stats) {
  const headers = collections.flatMap((col) => {
    const cleanTitle = (col.title || col.id).replace(/\s+/g, '_')
    return stats.map((stat) => `${cleanTitle}_${stat}`)
  })

  const getValues = (sampleEventId, extractionResults) => {
    return collections.flatMap((col) => {
      const seResults = extractionResults?.[sampleEventId]?.[col.id] || {}
      return stats.map((stat) => {
        const value = seResults[stat]
        // Only include valid numbers, blank otherwise
        return typeof value === 'number' && !Number.isNaN(value) ? value : ''
      })
    })
  }

  return { headers, getValues }
}

/**
 * Build XLSX workbook from protocol data with covariates joined
 * @param {Object} protocolData - Map of protocol -> { headers, data }
 * @param {Object} extractionResults - Results keyed by sampleEventId -> collectionId -> stats
 * @param {Array} collections - Collection metadata with id and title
 * @param {Array} stats - List of stat names
 * @param {Set} selectedSampleEventIds - Set of selected sample event IDs to filter by
 * @returns {XLSX.WorkBook}
 */
export function buildWorkbook(
  protocolData,
  extractionResults,
  collections,
  stats,
  selectedSampleEventIds
) {
  const workbook = XLSX.utils.book_new()
  const covariateInfo = createCovariateColumns(collections, stats)

  // Sort protocols alphabetically for consistent tab order
  const sortedProtocols = Object.keys(protocolData).sort()

  for (const protocol of sortedProtocols) {
    const { headers, data } = protocolData[protocol]
    // Filter data to only include selected sample events
    const filteredData = data.filter((row) => selectedSampleEventIds.has(row.sample_event_id))

    if (filteredData.length === 0) continue

    // Build rows with covariates appended
    const fullHeaders = [...headers, ...covariateInfo.headers]
    const fullRows = filteredData.map((row) => {
      const baseValues = headers.map((h) => row[h] ?? '')
      const covariateValues = covariateInfo.getValues(row.sample_event_id, extractionResults)
      return [...baseValues, ...covariateValues]
    })

    // Create worksheet
    const wsData = [fullHeaders, ...fullRows]
    const worksheet = XLSX.utils.aoa_to_sheet(wsData)

    // Add worksheet to workbook with protocol name
    const sheetName = protocol.replace(/[\\/*?[\]:]/g, '_').slice(0, 31) // Excel sheet name limits
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  }

  return workbook
}

/**
 * Download workbook as XLSX file
 * @param {XLSX.WorkBook} workbook
 * @param {string} filename
 */
export function downloadWorkbook(workbook, filename = 'mermaid_covariates.xlsx') {
  XLSX.writeFile(workbook, filename)
}

/**
 * Determine which project/protocol combinations need to be fetched
 * @param {Array} sampleEvents - Selected sample events with full data
 * @returns {Array<{projectId: string, protocol: string}>}
 */
export function getRequiredFetches(sampleEvents) {
  const projectProtocols = new Map() // projectId -> Set of protocols
  const knownProtocols = new Set(Object.keys(PROTOCOL_ENDPOINTS))

  for (const se of sampleEvents) {
    const projectId = se.project_id
    if (!projectProtocols.has(projectId)) {
      projectProtocols.set(projectId, new Set())
    }

    // Check which protocols have data for this sample event
    // Only include protocols we have endpoint mappings for
    if (se.protocols) {
      for (const [protocol, info] of Object.entries(se.protocols)) {
        if (info?.sample_unit_count > 0 && knownProtocols.has(protocol)) {
          projectProtocols.get(projectId).add(protocol)
        }
      }
    }
  }

  // Convert to array of { projectId, protocol } pairs
  const fetches = []
  for (const [projectId, protocols] of projectProtocols) {
    for (const protocol of protocols) {
      fetches.push({ projectId, protocol })
    }
  }

  return fetches
}
