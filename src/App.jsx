import { useAuth0 } from '@auth0/auth0-react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  createMermaidApi,
  extractProjects,
  extractCountries,
  extractOrganizations,
  flattenRecords,
  PROTOCOL_ENDPOINTS,
} from './services/mermaidApi'
import { findItemForDate, getCogUrl } from './services/stacApi'
import { getZonalStats } from './services/zonalStatsApi'
import { generateCsvContent, downloadCsv } from './utils/csv'
import {
  parseCsv,
  csvRowsToObjects,
  getRequiredFetches,
  buildWorkbook,
  downloadWorkbook,
} from './utils/xlsx'
import SampleEventMap from './components/SampleEventMap'
import CollectionSelector from './components/CollectionSelector'
import StatsSelector from './components/StatsSelector'
import mermaidLogo from './assets/mermaid-logo.svg'
import './App.css'

function Header({ user, isAuthenticated, onLogin, onLogout }) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <header className="header">
      <div className="header-left">
        <img src={mermaidLogo} alt="" className="header-logo-img" />
        <span className="header-title">MERMAID Covariates</span>
      </div>
      <nav className="header-nav">
        {isAuthenticated ? (
          <div className="avatar-container">
            <button
              className="avatar-button"
              onClick={() => setShowMenu(!showMenu)}
              aria-label="User menu"
            >
              {user?.picture ? (
                <img src={user.picture} alt="" className="avatar-img" />
              ) : (
                <span className="avatar-initials">
                  {(user?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                </span>
              )}
            </button>
            {showMenu && (
              <div className="user-menu">
                <p className="user-menu-name">{user?.full_name || user?.email}</p>
                <button onClick={onLogout} className="user-menu-button">
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={onLogin} className="header-login">
            Log in
          </button>
        )}
      </nav>
    </header>
  )
}

function Loading({ message }) {
  return (
    <div className="loading">
      <p>{message || 'Loading...'}</p>
    </div>
  )
}

function MultiSelect({ label, options, selected, onChange }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const selectedSet = new Set(selected)

  const handleToggle = (value) => {
    const newSelected = new Set(selectedSet)
    if (newSelected.has(value)) {
      newSelected.delete(value)
    } else {
      newSelected.add(value)
    }
    onChange([...newSelected])
  }

  const handleClear = (e) => {
    e.stopPropagation()
    onChange([])
  }

  return (
    <div className="filter-group">
      <div className="filter-header-row">
        <button
          type="button"
          className="filter-header-btn"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className="filter-label">{label}</span>
          <span className="filter-meta">
            {selected.length > 0 && <span className="filter-count">{selected.length}</span>}
            <span className="filter-chevron">{isExpanded ? '▾' : '▸'}</span>
          </span>
        </button>
        {selected.length > 0 && (
          <button type="button" className="filter-clear-btn" onClick={handleClear} title="Clear">
            ×
          </button>
        )}
      </div>
      {isExpanded && (
        <div className="filter-options">
          {options.map((opt) => (
            <label key={opt.value} className="filter-option">
              <input
                type="checkbox"
                checked={selectedSet.has(opt.value)}
                onChange={() => handleToggle(opt.value)}
              />
              <span className="filter-option-label">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function DateRangeFilter({ startDate, endDate, onStartChange, onEndChange }) {
  return (
    <div className="filter-group">
      <label className="filter-label">Date Range</label>
      <div className="date-range-inputs">
        <input
          type="date"
          className="filter-date"
          value={startDate}
          onChange={(e) => onStartChange(e.target.value)}
          placeholder="Start date"
        />
        <span className="date-range-separator">to</span>
        <input
          type="date"
          className="filter-date"
          value={endDate}
          onChange={(e) => onEndChange(e.target.value)}
          placeholder="End date"
        />
      </div>
    </div>
  )
}

function FilterPane({
  projects,
  countries,
  organizations,
  selectedProjects,
  selectedCountries,
  selectedOrganizations,
  startDate,
  endDate,
  onProjectsChange,
  onCountriesChange,
  onOrganizationsChange,
  onStartDateChange,
  onEndDateChange,
  onClearFilters,
}) {
  const hasFilters =
    selectedProjects.length > 0 ||
    selectedCountries.length > 0 ||
    selectedOrganizations.length > 0 ||
    startDate ||
    endDate

  return (
    <div className="filter-pane">
      <div className="filter-header">
        <h3>Filter your MERMAID data</h3>
        {hasFilters && (
          <button className="clear-filters-btn" onClick={onClearFilters}>
            Clear all
          </button>
        )}
      </div>
      <MultiSelect
        label="Projects"
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        selected={selectedProjects}
        onChange={onProjectsChange}
      />
      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartChange={onStartDateChange}
        onEndChange={onEndDateChange}
      />
      <MultiSelect
        label="Countries"
        options={countries.map((c) => ({ value: c, label: c }))}
        selected={selectedCountries}
        onChange={onCountriesChange}
      />
      <MultiSelect
        label="Organizations"
        options={organizations.map((o) => ({ value: o, label: o }))}
        selected={selectedOrganizations}
        onChange={onOrganizationsChange}
      />
    </div>
  )
}

function SampleEventTable({ sampleEvents, selectedIds, onSelectionChange }) {
  const allSelected =
    sampleEvents.length > 0 && selectedIds.size === sampleEvents.length

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      onSelectionChange(new Set(sampleEvents.map((se) => se.sample_event_id)))
    } else {
      onSelectionChange(new Set())
    }
  }

  const handleSelectOne = (id, checked) => {
    const newSet = new Set(selectedIds)
    if (checked) {
      newSet.add(id)
    } else {
      newSet.delete(id)
    }
    onSelectionChange(newSet)
  }

  if (sampleEvents.length === 0) {
    return <p className="empty-state">No sample events match the current filters.</p>
  }

  return (
    <div className="table-container">
      <table className="sample-event-table">
        <thead>
          <tr>
            <th className="col-checkbox">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                aria-label="Select all"
              />
            </th>
            <th className="col-project">Project</th>
            <th className="col-site">Site</th>
            <th className="col-date">Date</th>
            <th className="col-country">Country</th>
            <th className="col-coord">Latitude</th>
            <th className="col-coord">Longitude</th>
          </tr>
        </thead>
        <tbody>
          {sampleEvents.map((se) => (
            <tr key={se.sample_event_id}>
              <td className="col-checkbox">
                <input
                  type="checkbox"
                  checked={selectedIds.has(se.sample_event_id)}
                  onChange={(e) => handleSelectOne(se.sample_event_id, e.target.checked)}
                  aria-label={`Select ${se.site_name}`}
                />
              </td>
              <td className="col-project" title={se.project_name}>{se.project_name}</td>
              <td className="col-site" title={se.site_name}>{se.site_name}</td>
              <td className="col-date">{se.sample_date}</td>
              <td className="col-country" title={se.country_name}>{se.country_name}</td>
              <td className="col-coord">{se.latitude != null ? se.latitude.toFixed(4) : '-'}</td>
              <td className="col-coord">{se.longitude != null ? se.longitude.toFixed(4) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function App() {
  const { isAuthenticated, isLoading, loginWithRedirect, logout, getAccessTokenSilently } =
    useAuth0()
  const [userData, setUserData] = useState(null)
  const [projectSummaries, setProjectSummaries] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError] = useState(null)

  // Filter state
  const [selectedProjects, setSelectedProjects] = useState([])
  const [selectedCountries, setSelectedCountries] = useState([])
  const [selectedOrganizations, setSelectedOrganizations] = useState([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Selection state
  const [selectedSampleEventIds, setSelectedSampleEventIds] = useState(new Set())

  // Zonal stats configuration state
  const [collections, setCollections] = useState([])
  const [selectedCollections, setSelectedCollections] = useState(new Set())
  const [selectedStats, setSelectedStats] = useState(new Set(['mean', 'min', 'max']))

  // Extraction state
  const [extracting, setExtracting] = useState(false)
  const [extractionProgress, setExtractionProgress] = useState({ current: 0, total: 0, currentSE: 0, totalSE: 0 })
  const [extractionResults, setExtractionResults] = useState(null)
  const [extractionErrors, setExtractionErrors] = useState([])

  // XLSX download state
  const [xlsxDownloading, setXlsxDownloading] = useState(false)
  const [xlsxProgress, setXlsxProgress] = useState({ current: 0, total: 0, message: '' })

  const getAccessToken = useCallback(
    () =>
      getAccessTokenSilently({
        authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE },
      }),
    [getAccessTokenSilently]
  )

  useEffect(() => {
    if (!isAuthenticated) return

    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        const api = createMermaidApi(getAccessToken)

        // Fetch user profile for header
        setLoadingMessage('Loading user profile...')
        const user = await api.getMe()
        setUserData(user)

        // Fetch all project summary sample events (with pagination)
        setLoadingMessage('Loading sample events...')
        const summaries = await api.getProjectSummarySampleEvents((progress) => {
          setLoadingMessage(`Loading sample events... ${progress.loaded} of ${progress.total}`)
        })

        setProjectSummaries(summaries)
      } catch (err) {
        console.error('Error fetching data:', err)
        setError(err.message)
      } finally {
        setLoading(false)
        setLoadingMessage('')
      }
    }

    fetchData()
  }, [isAuthenticated, getAccessToken])

  // Derived data - filter to only projects user is a member of
  const memberProjectSummaries = useMemo(() => {
    if (!userData?.projects) return projectSummaries
    const memberProjectIds = new Set(userData.projects.map((p) => p.id))
    return projectSummaries.filter((ps) => memberProjectIds.has(ps.project_id))
  }, [projectSummaries, userData])

  const projects = useMemo(() => extractProjects(memberProjectSummaries), [memberProjectSummaries])
  const allCountries = useMemo(() => extractCountries(memberProjectSummaries), [memberProjectSummaries])
  const allOrganizations = useMemo(
    () => extractOrganizations(memberProjectSummaries),
    [memberProjectSummaries]
  )
  const allRecords = useMemo(() => flattenRecords(memberProjectSummaries), [memberProjectSummaries])

  // Filtered and sorted records
  const filteredRecords = useMemo(() => {
    return allRecords
      .filter((record) => {
        // Filter by project
        if (selectedProjects.length > 0 && !selectedProjects.includes(record.project_id)) {
          return false
        }

        // Filter by date range
        if (startDate && record.sample_date < startDate) {
          return false
        }
        if (endDate && record.sample_date > endDate) {
          return false
        }

        // Filter by country
        if (selectedCountries.length > 0 && !selectedCountries.includes(record.country_name)) {
          return false
        }

        // Filter by organization (check if any of project's tags match)
        if (selectedOrganizations.length > 0) {
          const projectTagNames = record.project_tags?.map((t) => t.name) || []
          if (!selectedOrganizations.some((org) => projectTagNames.includes(org))) {
            return false
          }
        }

        return true
      })
      .sort((a, b) => {
        // Sort by project name, then site name, then date
        const projectCompare = a.project_name.localeCompare(b.project_name)
        if (projectCompare !== 0) return projectCompare

        const siteCompare = a.site_name.localeCompare(b.site_name)
        if (siteCompare !== 0) return siteCompare

        return a.sample_date.localeCompare(b.sample_date)
      })
  }, [allRecords, selectedProjects, startDate, endDate, selectedCountries, selectedOrganizations])

  const handleClearFilters = () => {
    setSelectedProjects([])
    setSelectedCountries([])
    setSelectedOrganizations([])
    setStartDate('')
    setEndDate('')
  }

  // Get selected sample events with full data
  const selectedSampleEvents = useMemo(() => {
    return filteredRecords.filter((r) => selectedSampleEventIds.has(r.sample_event_id))
  }, [filteredRecords, selectedSampleEventIds])

  const handleExtract = async () => {
    if (selectedSampleEvents.length === 0) return
    if (selectedCollections.size === 0) return
    if (selectedStats.size === 0) return

    setExtracting(true)
    setExtractionResults(null)
    setExtractionErrors([])

    const collectionIds = [...selectedCollections]
    const stats = [...selectedStats]

    // Build list of all tasks (SE × collection pairs)
    const tasks = []
    for (const se of selectedSampleEvents) {
      for (const collectionId of collectionIds) {
        const collection = collections.find((c) => c.id === collectionId)
        tasks.push({
          se,
          collectionId,
          collectionName: collection?.title || collectionId,
        })
      }
    }

    const totalOperations = tasks.length
    const totalSE = selectedSampleEvents.length
    const numCollections = collectionIds.length
    let completedOperations = 0

    // Results structure: { [sampleEventId]: { [collectionId]: { mean: x, std: y, ... } } }
    const results = {}
    const errors = []

    // Cache STAC item lookups by collectionId:sampleDate
    const stacCache = new Map()

    const processTask = async (task) => {
      const { se, collectionId, collectionName } = task
      const cacheKey = `${collectionId}:${se.sample_date}`

      try {
        // Check cache for STAC item
        let item
        if (stacCache.has(cacheKey)) {
          item = stacCache.get(cacheKey)
        } else {
          item = await findItemForDate(collectionId, se.sample_date)
          stacCache.set(cacheKey, item)
        }

        if (!item) {
          return {
            error: {
              sampleEventId: se.sample_event_id,
              siteName: se.site_name,
              collectionId,
              collectionName,
              error: 'No imagery found for this date',
            },
          }
        }

        const cogUrl = getCogUrl(item)

        if (!cogUrl) {
          return {
            error: {
              sampleEventId: se.sample_event_id,
              siteName: se.site_name,
              collectionId,
              collectionName,
              error: 'No COG URL in item',
            },
          }
        }

        // Call zonal stats API
        const zonalResult = await getZonalStats({
          lon: se.longitude,
          lat: se.latitude,
          cogUrl,
          stats,
          buffer: 1000,
        })

        return {
          result: {
            sampleEventId: se.sample_event_id,
            collectionId,
            stats: zonalResult.band_1 || {},
          },
        }
      } catch (err) {
        return {
          error: {
            sampleEventId: se.sample_event_id,
            siteName: se.site_name,
            collectionId,
            collectionName,
            error: err.message,
          },
        }
      }
    }

    // Process tasks in parallel with concurrency limit
    const CONCURRENCY = 10
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const batch = tasks.slice(i, i + CONCURRENCY)

      setExtractionProgress({
        current: completedOperations,
        total: totalOperations,
        currentSE: Math.floor(completedOperations / numCollections),
        totalSE,
      })

      const batchResults = await Promise.all(batch.map(processTask))

      for (const outcome of batchResults) {
        if (outcome.result) {
          const { sampleEventId, collectionId, stats: resultStats } = outcome.result
          if (!results[sampleEventId]) results[sampleEventId] = {}
          results[sampleEventId][collectionId] = resultStats
        } else if (outcome.error) {
          errors.push(outcome.error)
        }
        completedOperations++
      }
    }

    setExtractionProgress({ current: totalOperations, total: totalOperations, currentSE: totalSE, totalSE })
    setExtractionResults(results)
    setExtractionErrors(errors)
    setExtracting(false)
  }

  const handleCollectionsLoaded = useCallback((loadedCollections) => {
    setCollections(loadedCollections)
  }, [])

  const handleDownloadCsv = () => {
    if (!extractionResults || selectedSampleEvents.length === 0) return

    const selectedCollectionObjects = collections.filter((c) => selectedCollections.has(c.id))
    const csvContent = generateCsvContent(
      selectedSampleEvents,
      extractionResults,
      selectedCollectionObjects,
      [...selectedStats]
    )

    const timestamp = new Date().toISOString().slice(0, 10)
    downloadCsv(csvContent, `mermaid_covariates_${timestamp}.csv`)
  }

  const handleDownloadXlsx = async () => {
    if (!extractionResults || selectedSampleEvents.length === 0) return

    setXlsxDownloading(true)
    setXlsxProgress({ current: 0, total: 0, message: 'Preparing...' })

    try {
      const api = createMermaidApi(getAccessToken)

      // Determine which project/protocol combinations to fetch
      const requiredFetches = getRequiredFetches(selectedSampleEvents)

      if (requiredFetches.length === 0) {
        throw new Error('No protocol data available for selected sample events')
      }

      setXlsxProgress({ current: 0, total: requiredFetches.length, message: 'Fetching protocol data...' })

      // Fetch protocol CSVs with concurrency limit
      const CONCURRENCY = 5
      const protocolData = {} // protocol -> { headers, data }

      for (let i = 0; i < requiredFetches.length; i += CONCURRENCY) {
        const batch = requiredFetches.slice(i, i + CONCURRENCY)

        const batchResults = await Promise.all(
          batch.map(async ({ projectId, protocol }) => {
            try {
              const csvText = await api.getProtocolCsv(projectId, protocol)
              const rows = parseCsv(csvText)
              const { headers, data } = csvRowsToObjects(rows)
              return { protocol, headers, data, error: null }
            } catch (err) {
              console.error(`Failed to fetch ${protocol} for project ${projectId}:`, err)
              return { protocol, headers: [], data: [], error: err.message }
            }
          })
        )

        // Merge results by protocol
        for (const result of batchResults) {
          if (result.error) continue
          if (!protocolData[result.protocol]) {
            protocolData[result.protocol] = { headers: result.headers, data: [] }
          }
          protocolData[result.protocol].data.push(...result.data)
        }

        setXlsxProgress({
          current: Math.min(i + CONCURRENCY, requiredFetches.length),
          total: requiredFetches.length,
          message: `Fetching protocol data... ${Math.min(i + CONCURRENCY, requiredFetches.length)}/${requiredFetches.length}`,
        })
      }

      if (Object.keys(protocolData).length === 0) {
        throw new Error('No protocol data could be fetched')
      }

      setXlsxProgress({ current: requiredFetches.length, total: requiredFetches.length, message: 'Building XLSX...' })

      // Build workbook with covariates
      const selectedCollectionObjects = collections.filter((c) => selectedCollections.has(c.id))
      const workbook = buildWorkbook(
        protocolData,
        extractionResults,
        selectedCollectionObjects,
        [...selectedStats],
        selectedSampleEventIds
      )

      // Download
      const timestamp = new Date().toISOString().slice(0, 10)
      downloadWorkbook(workbook, `mermaid_covariates_${timestamp}.xlsx`)

      setXlsxProgress({ current: requiredFetches.length, total: requiredFetches.length, message: 'Done!' })
    } catch (err) {
      console.error('XLSX download error:', err)
      alert(`Failed to download XLSX: ${err.message}`)
    } finally {
      setXlsxDownloading(false)
    }
  }

  const handleLogout = () => logout({ logoutParams: { returnTo: window.location.origin } })

  if (isLoading) {
    return <Loading />
  }

  return (
    <div className="app">
      <Header
        user={userData}
        isAuthenticated={isAuthenticated}
        onLogin={loginWithRedirect}
        onLogout={handleLogout}
      />
      <main className="main">
        {!isAuthenticated ? (
          <div className="welcome">
            <h1>Welcome to MERMAID Covariates</h1>
            <p>
              Extract environmental covariates from raster datasets for your coral reef sample
              events.
            </p>
            <button onClick={loginWithRedirect} className="login-button">
              Log in with MERMAID
            </button>
          </div>
        ) : loading ? (
          <Loading message={loadingMessage} />
        ) : error ? (
          <div className="error">
            <h2>Error</h2>
            <p>{error}</p>
          </div>
        ) : (
          <div className="dashboard">
            <div className="sidebar">
              <FilterPane
                projects={projects}
                countries={allCountries}
                organizations={allOrganizations}
                selectedProjects={selectedProjects}
                selectedCountries={selectedCountries}
                selectedOrganizations={selectedOrganizations}
                startDate={startDate}
                endDate={endDate}
                onProjectsChange={setSelectedProjects}
                onCountriesChange={setSelectedCountries}
                onOrganizationsChange={setSelectedOrganizations}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
                onClearFilters={handleClearFilters}
              />
              <div className="zonal-config">
                <h3>Select covariates</h3>
                <CollectionSelector
                  selectedCollections={selectedCollections}
                  onSelectionChange={setSelectedCollections}
                  onCollectionsLoaded={handleCollectionsLoaded}
                />
                <StatsSelector
                  selectedStats={selectedStats}
                  onSelectionChange={setSelectedStats}
                />
                <button
                  className="extract-button"
                  onClick={handleExtract}
                  disabled={
                    extracting ||
                    selectedSampleEventIds.size === 0 ||
                    selectedCollections.size === 0 ||
                    selectedStats.size === 0
                  }
                >
                  {extracting ? 'Extracting...' : 'Extract Covariates'}
                </button>
                {extracting && (
                  <div className="extraction-progress">
                    <progress
                      value={extractionProgress.current}
                      max={extractionProgress.total}
                    />
                    <p className="progress-count">
                      {extractionProgress.currentSE} / {extractionProgress.totalSE} sample events
                    </p>
                  </div>
                )}
                {extractionErrors.length > 0 && (
                  <div className="extraction-errors">
                    <p className="errors-header">{extractionErrors.length} error(s):</p>
                    <ul className="errors-list">
                      {extractionErrors.slice(0, 5).map((err, i) => (
                        <li key={i}>
                          {err.siteName} - {err.collectionName}: {err.error}
                        </li>
                      ))}
                      {extractionErrors.length > 5 && (
                        <li>...and {extractionErrors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
                {extractionResults && !extracting && (
                  <div className="extraction-success">
                    <p>Extraction complete!</p>
                    <div className="download-buttons">
                      <button className="download-button" onClick={handleDownloadCsv}>
                        Download CSV (Summary)
                      </button>
                      <button
                        className="download-button download-secondary"
                        onClick={handleDownloadXlsx}
                        disabled={xlsxDownloading}
                      >
                        {xlsxDownloading ? 'Downloading...' : 'Download XLSX (Full Data)'}
                      </button>
                    </div>
                    {xlsxDownloading && (
                      <div className="xlsx-progress">
                        <progress value={xlsxProgress.current} max={xlsxProgress.total || 1} />
                        <p className="xlsx-progress-text">{xlsxProgress.message}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="main-content">
              <div className="content-header">
                <h2>
                  Sample Events ({filteredRecords.length})
                  {selectedSampleEventIds.size > 0 && (
                    <span className="selection-count">
                      {' '}
                      - {selectedSampleEventIds.size} selected
                    </span>
                  )}
                </h2>
              </div>
              <div className="map-info">
                <div className="map-legend">
                  <span className="legend-item">
                    <span className="legend-dot selected"></span>
                    Selected
                  </span>
                  <span className="legend-item">
                    <span className="legend-dot unselected"></span>
                    Unselected
                  </span>
                </div>
              </div>
              <SampleEventMap
                sampleEvents={filteredRecords}
                selectedIds={selectedSampleEventIds}
              />
              <SampleEventTable
                sampleEvents={filteredRecords}
                selectedIds={selectedSampleEventIds}
                onSelectionChange={setSelectedSampleEventIds}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
