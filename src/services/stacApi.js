const STAC_API_URL = import.meta.env.VITE_STAC_API_URL

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
 * Check if a collection has COG (raster) items by examining a sample item.
 * Vector-only collections won't have a "data" asset with a COG.
 */
export async function checkCollectionHasCog(collectionId) {
  try {
    const response = await fetch(`${STAC_API_URL}/collections/${collectionId}/items?limit=1`)
    if (!response.ok) {
      return false
    }
    const data = await response.json()

    if (!data.features || data.features.length === 0) {
      return false
    }

    const item = data.features[0]
    // Check for "data" asset which is where COGs are stored
    return item.assets && 'data' in item.assets
  } catch {
    return false
  }
}

/**
 * Fetch collections with COG availability checked for each.
 * Returns collections with an added `hasCog` property.
 */
export async function fetchCollectionsWithCogStatus() {
  const collections = await fetchCollections()

  // Check COG availability for each collection in parallel
  const cogChecks = await Promise.all(
    collections.map(async (collection) => {
      const hasCog = await checkCollectionHasCog(collection.id)
      return {
        id: collection.id,
        title: collection.title || collection.id,
        description: collection.description || '',
        hasCog,
      }
    })
  )

  // Sort: COG collections first, then alphabetically by title
  return cogChecks.sort((a, b) => {
    if (a.hasCog !== b.hasCog) {
      return a.hasCog ? -1 : 1
    }
    return a.title.localeCompare(b.title)
  })
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
  return item?.assets?.data?.href || null
}
