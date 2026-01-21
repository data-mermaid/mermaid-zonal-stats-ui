import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icons (Leaflet's default icons don't work well with bundlers)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Component to fit map bounds to markers
function FitBounds({ sampleEvents }) {
  const map = useMap()
  const prevBoundsRef = useRef(null)

  useEffect(() => {
    if (sampleEvents.length === 0) {
      // Reset to world view if no markers
      map.setView([0, 0], 2)
      prevBoundsRef.current = null
      return
    }

    const validEvents = sampleEvents.filter(
      (se) => se.latitude != null && se.longitude != null
    )

    if (validEvents.length === 0) {
      return
    }

    const bounds = L.latLngBounds(
      validEvents.map((se) => [se.latitude, se.longitude])
    )

    // Check if bounds have actually changed to avoid unnecessary re-fitting
    const boundsKey = bounds.toBBoxString()
    if (prevBoundsRef.current !== boundsKey) {
      prevBoundsRef.current = boundsKey
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 })
    }
  }, [sampleEvents, map])

  return null
}

function SampleEventMap({ sampleEvents, selectedIds }) {
  // Filter to only events with valid coordinates
  const mappableEvents = useMemo(() => {
    return sampleEvents.filter((se) => se.latitude != null && se.longitude != null)
  }, [sampleEvents])

  // Separate selected and unselected for different styling
  const selectedEvents = useMemo(() => {
    return mappableEvents.filter((se) => selectedIds.has(se.sample_event_id))
  }, [mappableEvents, selectedIds])

  const unselectedEvents = useMemo(() => {
    return mappableEvents.filter((se) => !selectedIds.has(se.sample_event_id))
  }, [mappableEvents, selectedIds])

  // Use selected events for bounds if any are selected, otherwise use all
  const eventsForBounds = selectedIds.size > 0 ? selectedEvents : mappableEvents

  return (
    <div className="map-container">
      <MapContainer
        center={[0, 0]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds sampleEvents={eventsForBounds} />

        {/* Unselected markers - clustered */}
        {unselectedEvents.length > 0 && (
          <MarkerClusterGroup
            chunkedLoading
            iconCreateFunction={(cluster) => {
              const count = cluster.getChildCount()
              return L.divIcon({
                html: `<div class="cluster-icon cluster-unselected">${count}</div>`,
                className: 'custom-cluster',
                iconSize: L.point(40, 40, true),
              })
            }}
          >
            {unselectedEvents.map((se) => (
              <Marker
                key={se.sample_event_id}
                position={[se.latitude, se.longitude]}
                opacity={0.6}
              >
                <Popup>
                  <div className="marker-popup">
                    <strong>{se.site_name}</strong>
                    <br />
                    {se.sample_date}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        )}

        {/* Selected markers - clustered separately with different styling */}
        {selectedEvents.length > 0 && (
          <MarkerClusterGroup
            chunkedLoading
            iconCreateFunction={(cluster) => {
              const count = cluster.getChildCount()
              return L.divIcon({
                html: `<div class="cluster-icon cluster-selected">${count}</div>`,
                className: 'custom-cluster',
                iconSize: L.point(40, 40, true),
              })
            }}
          >
            {selectedEvents.map((se) => (
              <Marker
                key={se.sample_event_id}
                position={[se.latitude, se.longitude]}
              >
                <Popup>
                  <div className="marker-popup">
                    <strong>{se.site_name}</strong>
                    <br />
                    {se.sample_date}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        )}
      </MapContainer>

      {mappableEvents.length === 0 && sampleEvents.length > 0 && (
        <div className="map-no-coords">
          No sample events with coordinates to display
        </div>
      )}
    </div>
  )
}

export default SampleEventMap
