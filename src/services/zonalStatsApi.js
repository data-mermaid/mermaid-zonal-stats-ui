const ZONAL_STATS_API_URL = import.meta.env.VITE_ZONAL_STATS_API_URL

/**
 * Get zonal statistics for a point with buffer from raster (COG)
 *
 * @param {object} params
 * @param {number} params.lon - Longitude
 * @param {number} params.lat - Latitude
 * @param {string} params.cogUrl - URL of the COG to extract stats from
 * @param {string[]} params.stats - Statistics to calculate (mean, median, std, min, max, majority)
 * @param {number} [params.buffer=1000] - Buffer radius in meters
 * @returns {object} - Statistics by band (e.g., { band_1: { mean: 7.8, std: 2.1 } })
 */
export async function getZonalStats({ lon, lat, cogUrl, stats, buffer = 1000 }) {
  const response = await fetch(`${ZONAL_STATS_API_URL}/zonal-stats/raster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aoi: {
        type: 'Point',
        coordinates: [lon, lat],
        radius: buffer,
      },
      stats,
      url: cogUrl,
      approx_stats: true,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Zonal stats failed (${response.status}): ${errorText}`)
  }

  return response.json()
}

/**
 * Get zonal statistics for a point with buffer from vector (GeoParquet)
 *
 * @param {object} params
 * @param {number} params.lon - Longitude
 * @param {number} params.lat - Latitude
 * @param {string} params.parquetUrl - URL of the GeoParquet file to extract stats from
 * @param {string[]} params.columns - Numeric columns to calculate statistics for
 * @param {string[]} params.stats - Statistics to calculate (mean, median, std, min, max)
 * @param {number} [params.buffer=1000] - Buffer radius in meters
 * @returns {object} - Statistics by column (e.g., { column_name: { mean: 7.8, std: 2.1 } })
 */
export async function getVectorZonalStats({ lon, lat, parquetUrl, columns, stats, buffer = 1000 }) {
  // Filter out raster-only stats for vector
  const vectorStats = stats.filter(s => !['majority', 'minority', 'nodata', 'freq_hist'].includes(s))

  const response = await fetch(`${ZONAL_STATS_API_URL}/zonal-stats/vector`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aoi: {
        type: 'Point',
        coordinates: [lon, lat],
        radius: buffer,
      },
      stats: vectorStats.length > 0 ? vectorStats : ['mean', 'min', 'max'],
      url: parquetUrl,
      columns,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Vector zonal stats failed (${response.status}): ${errorText}`)
  }

  return response.json()
}
