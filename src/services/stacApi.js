const STAC_API_URL = import.meta.env.VITE_STAC_API_URL

/**
 * Process tasks with a sliding window of concurrent operations.
 * @param {Array} tasks - Array of items to process
 * @param {Function} processor - Async function to process each task
 * @param {number} concurrency - Max concurrent operations
 * @returns {Promise<Array>} - Results in same order as tasks
 */
async function processWithConcurrency(tasks, processor, concurrency) {
  const results = new Array(tasks.length)
  let nextIndex = 0

  async function runNext() {
    const index = nextIndex++
    if (index >= tasks.length) return

    results[index] = await processor(tasks[index], index)
    await runNext()
  }

  const workers = Array(Math.min(concurrency, tasks.length))
    .fill(null)
    .map(() => runNext())

  await Promise.all(workers)
  return results
}

/**
 * Fetch all available STAC collections
 */
export async function fetchCollections() {
  const response = await fetch(`${STAC_API_URL}/collections`)
  if (!response.ok) {
    throw new Error(`Failed to fetch collections: ${response.status}`)
  }
  const data = await response.json()
  return data.collections || []
}

/**
 * Check if an asset looks like a COG (Cloud Optimized GeoTIFF)
 */
function isCogAsset(asset) {
  if (!asset) return false

  // Check MIME type
  if (asset.type?.includes('profile=cloud-optimized') ||
      asset.type?.includes('image/tiff') ||
      asset.type?.includes('application/geotiff') ||
      asset.type === 'image/tiff; application=geotiff') {
    return true
  }

  // Check file extension
  const href = asset.href?.toLowerCase() || ''
  if (href.endsWith('.tif') || href.endsWith('.tiff')) {
    return true
  }

  return false
}

/**
 * Find the COG asset from a STAC item.
 * Checks common asset keys and MIME types.
 */
function findCogAsset(item) {
  if (!item?.assets) return null

  // Check common COG asset keys first, but verify they're actually COGs
  const commonKeys = ['data', 'Cloud Optimized GeoTIFF', 'cog', 'image']
  for (const key of commonKeys) {
    const asset = item.assets[key]
    if (asset && isCogAsset(asset)) {
      return { key, asset }
    }
  }

  // Fallback: check all assets for COG indicators
  for (const [key, asset] of Object.entries(item.assets)) {
    if (isCogAsset(asset)) {
      return { key, asset }
    }
  }

  return null
}

/**
 * Find the GeoParquet asset from a STAC item.
 * Checks common asset keys and MIME types.
 */
function findParquetAsset(item) {
  if (!item?.assets) return null

  // Check common parquet asset keys first
  const commonKeys = ['data', 'parquet', 'geoparquet', 'vector']
  for (const key of commonKeys) {
    const asset = item.assets[key]
    if (asset && (
      asset.href?.endsWith('.parquet') ||
      asset.type?.includes('parquet') ||
      asset.type?.includes('application/x-parquet') ||
      asset.type?.includes('application/vnd.apache.parquet')
    )) {
      return { key, asset }
    }
  }

  // Fallback: check for parquet MIME type or extension in any asset
  for (const [key, asset] of Object.entries(item.assets)) {
    if (
      asset.href?.endsWith('.parquet') ||
      asset.type?.includes('parquet') ||
      asset.type?.includes('application/x-parquet') ||
      asset.type?.includes('application/vnd.apache.parquet')
    ) {
      return { key, asset }
    }
  }

  return null
}

/**
 * Check what asset types a collection has by examining a sample item.
 * Returns { hasCog, hasParquet, sampleItem, parquetColumns }
 */
export async function checkCollectionAssetTypes(collectionId) {
  try {
    const response = await fetch(`${STAC_API_URL}/collections/${collectionId}/items?limit=1`)
    if (!response.ok) {
      return { hasCog: false, hasParquet: false, sampleItem: null, parquetColumns: [] }
    }
    const data = await response.json()

    if (!data.features || data.features.length === 0) {
      return { hasCog: false, hasParquet: false, sampleItem: null, parquetColumns: [] }
    }

    const sampleItem = data.features[0]
    const hasCog = findCogAsset(sampleItem) !== null
    const parquetAsset = findParquetAsset(sampleItem)
    const hasParquet = parquetAsset !== null

    // Try to extract column info from parquet asset metadata
    let parquetColumns = []
    if (parquetAsset?.asset) {
      // Check for columns in asset metadata (common patterns)
      const asset = parquetAsset.asset
      if (asset['table:columns']) {
        // STAC table extension
        parquetColumns = asset['table:columns']
          .filter(col => col.type && ['int', 'float', 'double', 'number', 'int64', 'float64', 'int32', 'float32'].some(t => col.type.toLowerCase().includes(t)))
          .map(col => col.name)
      } else if (asset.columns) {
        parquetColumns = Array.isArray(asset.columns) ? asset.columns : []
      }
    }

    return { hasCog, hasParquet, sampleItem, parquetColumns }
  } catch {
    return { hasCog: false, hasParquet: false, sampleItem: null, parquetColumns: [] }
  }
}

/**
 * Fetch collections with asset type availability checked for each.
 * Returns collections with `hasCog`, `hasParquet`, and `parquetColumns` properties.
 */
export async function fetchCollectionsWithAssetStatus() {
  const collections = await fetchCollections()

  // Check asset availability with sliding window concurrency to avoid overwhelming the API
  const CONCURRENCY = 15
  const assetChecks = await processWithConcurrency(
    collections,
    async (collection) => {
      const { hasCog, hasParquet, parquetColumns } = await checkCollectionAssetTypes(collection.id)
      return {
        id: collection.id,
        title: collection.title || collection.id,
        description: collection.description || '',
        hasCog,
        hasParquet,
        parquetColumns,
        // Determine the primary type for display
        assetType: hasCog ? 'raster' : hasParquet ? 'vector' : null,
      }
    },
    CONCURRENCY
  )

  // Sort: collections with assets first (raster, then vector), then alphabetically
  return assetChecks.sort((a, b) => {
    const aHasAsset = a.hasCog || a.hasParquet
    const bHasAsset = b.hasCog || b.hasParquet
    if (aHasAsset !== bHasAsset) {
      return aHasAsset ? -1 : 1
    }
    // Within collections with assets, sort raster before vector
    if (aHasAsset && bHasAsset) {
      if (a.hasCog !== b.hasCog) {
        return a.hasCog ? -1 : 1
      }
    }
    return a.title.localeCompare(b.title)
  })
}

/**
 * @deprecated Use fetchCollectionsWithAssetStatus instead
 */
export async function fetchCollectionsWithCogStatus() {
  return fetchCollectionsWithAssetStatus()
}

/**
 * Find the most appropriate STAC item for a given sample date.
 * Priority: most recent item ON or BEFORE sample date.
 * Fallback: first item AFTER sample date if none before.
 *
 * @param {string} collectionId - The STAC collection ID
 * @param {string} sampleDate - Sample date in YYYY-MM-DD format
 * @returns {object|null} - STAC item or null if none found
 */
export async function findItemForDate(collectionId, sampleDate) {
  // Search for items on or before sample date
  const beforeResponse = await fetch(`${STAC_API_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: [collectionId],
      datetime: `../${sampleDate}T23:59:59Z`,
      sortby: [{ field: 'datetime', direction: 'desc' }],
      limit: 1,
    }),
  })

  if (beforeResponse.ok) {
    const beforeData = await beforeResponse.json()
    if (beforeData.features && beforeData.features.length > 0) {
      return beforeData.features[0]
    }
  }

  // Fallback: search for first item after sample date
  const afterResponse = await fetch(`${STAC_API_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: [collectionId],
      datetime: `${sampleDate}T00:00:00Z/..`,
      sortby: [{ field: 'datetime', direction: 'asc' }],
      limit: 1,
    }),
  })

  if (afterResponse.ok) {
    const afterData = await afterResponse.json()
    if (afterData.features && afterData.features.length > 0) {
      return afterData.features[0]
    }
  }

  return null
}

/**
 * Extract COG URL from a STAC item
 */
export function getCogUrl(item) {
  const cogAsset = findCogAsset(item)
  return cogAsset?.asset?.href || null
}

/**
 * Extract GeoParquet URL from a STAC item
 */
export function getParquetUrl(item) {
  const parquetAsset = findParquetAsset(item)
  return parquetAsset?.asset?.href || null
}
