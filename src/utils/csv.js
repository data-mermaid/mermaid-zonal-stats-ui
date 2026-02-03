/**
 * Escape a value for CSV format
 * @param {any} value - The value to escape
 * @returns {string} - Escaped CSV string
 */
function escapeCSV(value) {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Generate CSV content from sample events and extraction results
 * @param {Array} sampleEvents - Selected sample events with full data
 * @param {Object} extractionResults - Results keyed by sampleEventId -> collectionId -> band/column -> stats
 * @param {Array} collections - Collection metadata with id and title
 * @param {Array} stats - List of stat names (mean, std, etc.)
 * @param {Object} collectionBandInfo - Metadata about bands/columns per collection { [collectionId]: { type, keys: Set } }
 * @returns {string} - CSV content string
 */
export function generateCsvContent(sampleEvents, extractionResults, collections, stats, collectionBandInfo) {
  // Define the base sample event fields
  const seFields = [
    { key: 'sample_event_id', label: 'sample_event_id' },
    { key: 'project_id', label: 'project_id' },
    { key: 'project_name', label: 'project_name' },
    { key: 'site_id', label: 'site_id' },
    { key: 'site_name', label: 'site_name' },
    { key: 'latitude', label: 'latitude' },
    { key: 'longitude', label: 'longitude' },
    { key: 'country_id', label: 'country_id' },
    { key: 'country_name', label: 'country_name' },
    { key: 'reef_type', label: 'reef_type' },
    { key: 'reef_zone', label: 'reef_zone' },
    { key: 'reef_exposure', label: 'reef_exposure' },
    { key: 'management_id', label: 'management_id' },
    { key: 'management_name', label: 'management_name' },
    { key: 'sample_date', label: 'sample_date' },
  ]

  // Computed fields that need flattening
  const computedFields = [
    { key: 'protocols_list', label: 'protocols' },
    { key: 'observers_list', label: 'observers' },
    { key: 'tags_list', label: 'organizations' },
  ]

  // Build covariate column headers: {collection_title}_{band/column}_{stat}
  // Clean collection title for column name (replace spaces with underscores)
  const covariateHeaders = collections.flatMap((col) => {
    const cleanTitle = (col.title || col.id).replace(/\s+/g, '_')
    const bandInfoForCol = collectionBandInfo?.[col.id]
    const keys = bandInfoForCol ? [...bandInfoForCol.keys].sort() : ['band_1']

    return keys.flatMap((key) => {
      const cleanKey = key.replace(/\s+/g, '_')
      return stats.map((stat) => `${cleanTitle}_${cleanKey}_${stat}`)
    })
  })

  // Build header row
  const headers = [
    ...seFields.map((f) => f.label),
    ...computedFields.map((f) => f.label),
    ...covariateHeaders,
  ]

  // Build data rows
  const rows = sampleEvents.map((se) => {
    // Base fields
    const baseData = seFields.map((f) => se[f.key])

    // Computed/flattened fields
    const protocolsList = getProtocolsList(se.protocols)
    const observersList = getObserversList(se.observers)
    const tagsList = getTagsList(se.project_tags)

    const computedData = [protocolsList, observersList, tagsList]

    // Covariate data - only include valid numbers, blank otherwise
    // Structure: extractionResults[sampleEventId][collectionId][band/column][stat]
    const covariateData = collections.flatMap((col) => {
      const seResults = extractionResults?.[se.sample_event_id]?.[col.id] || {}
      const bandInfoForCol = collectionBandInfo?.[col.id]
      const keys = bandInfoForCol ? [...bandInfoForCol.keys].sort() : ['band_1']

      return keys.flatMap((key) => {
        const keyStats = seResults[key] || {}
        return stats.map((stat) => {
          const value = keyStats[stat]
          return typeof value === 'number' && !Number.isNaN(value) ? value : ''
        })
      })
    })

    return [...baseData, ...computedData, ...covariateData]
  })

  // Convert to CSV string
  const csvContent = [headers.join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n')

  return csvContent
}

/**
 * Get comma-separated list of protocol names from protocols object
 */
function getProtocolsList(protocols) {
  if (!protocols) return ''
  return Object.keys(protocols)
    .filter((key) => protocols[key]?.sample_unit_count > 0)
    .join(', ')
}

/**
 * Get comma-separated list of observer names
 */
function getObserversList(observers) {
  if (!observers || !Array.isArray(observers)) return ''
  return observers.map((o) => o.name || '').join(', ')
}

/**
 * Get comma-separated list of tag/organization names
 */
function getTagsList(tags) {
  if (!tags || !Array.isArray(tags)) return ''
  return tags.map((t) => t.name || '').join(', ')
}

/**
 * Trigger browser download of CSV content
 * @param {string} csvContent - The CSV string
 * @param {string} filename - The filename to use
 */
export function downloadCsv(csvContent, filename = 'mermaid_covariates.csv') {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
