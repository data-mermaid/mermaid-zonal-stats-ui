const ZONAL_STATS_API_URL = import.meta.env.VITE_ZONAL_STATS_API_URL

/**
 * Get zonal statistics for a point with buffer
 *
 * @param {object} params
 * @param {number} params.lon - Longitude
 * @param {number} params.lat - Latitude
 * @param {string} params.cogUrl - URL of the COG to extract stats from
 * @param {string[]} params.stats - Statistics to calculate (mean, median, std, min, max, majority)
 * @param {number} [params.buffer=1000] - Buffer size in meters
 * @returns {object} - Statistics by band (e.g., { band_1: { mean: 7.8, std: 2.1 } })
 */
export async function getZonalStats({ lon, lat, cogUrl, stats, buffer = 1000 }) {
  const response = await fetch(`${ZONAL_STATS_API_URL}/zonal-stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aoi: {
        type: 'Point',
        coordinates: [lon, lat],
        buffer_size: buffer,
      },
      stats,
      image: { url: cogUrl, bands: [1] },
      approx_stats: true,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Zonal stats failed (${response.status}): ${errorText}`)
  }

  return response.json()
}
