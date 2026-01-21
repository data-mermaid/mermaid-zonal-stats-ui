import { useState, useEffect } from 'react'
import { fetchCollectionsWithCogStatus } from '../services/stacApi'

function CollectionSelector({ selectedCollections, onSelectionChange, onCollectionsLoaded }) {
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedIds, setExpandedIds] = useState(new Set())

  useEffect(() => {
    const loadCollections = async () => {
      try {
        setLoading(true)
        const data = await fetchCollectionsWithCogStatus()
        setCollections(data)
        onCollectionsLoaded?.(data)
      } catch (err) {
        console.error('Error loading collections:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadCollections()
  }, [onCollectionsLoaded])

  const handleToggle = (collectionId) => {
    const newSelection = new Set(selectedCollections)
    if (newSelection.has(collectionId)) {
      newSelection.delete(collectionId)
    } else {
      newSelection.add(collectionId)
    }
    onSelectionChange(newSelection)
  }

  const toggleExpanded = (e, collectionId) => {
    e.preventDefault()
    e.stopPropagation()
    const newExpanded = new Set(expandedIds)
    if (newExpanded.has(collectionId)) {
      newExpanded.delete(collectionId)
    } else {
      newExpanded.add(collectionId)
    }
    setExpandedIds(newExpanded)
  }

  if (loading) {
    return (
      <div className="collection-selector">
        <p className="collection-loading">Loading collections...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="collection-selector">
        <p className="collection-error">Error loading collections: {error}</p>
      </div>
    )
  }

  return (
    <div className="collection-selector">
      <div className="collection-list">
        {collections.map((collection) => {
          const isExpanded = expandedIds.has(collection.id)
          return (
            <div
              key={collection.id}
              className={`collection-item ${!collection.hasCog ? 'collection-disabled' : ''} ${selectedCollections.has(collection.id) ? 'collection-selected' : ''}`}
            >
              <label className="collection-label">
                <input
                  type="checkbox"
                  checked={selectedCollections.has(collection.id)}
                  onChange={() => handleToggle(collection.id)}
                  disabled={!collection.hasCog}
                />
                <span className="collection-title">{collection.title}</span>
                {!collection.hasCog && <span className="collection-badge">Vector only</span>}
              </label>
              {collection.description && (
                <button
                  type="button"
                  className="collection-info-btn"
                  onClick={(e) => toggleExpanded(e, collection.id)}
                  aria-label={isExpanded ? 'Hide details' : 'Show details'}
                  title={isExpanded ? 'Hide details' : 'Show details'}
                >
                  {isExpanded ? '−' : 'i'}
                </button>
              )}
              {isExpanded && collection.description && (
                <p className="collection-description">{collection.description}</p>
              )}
            </div>
          )
        })}
      </div>
      {selectedCollections.size > 0 && (
        <p className="collection-summary">{selectedCollections.size} collection(s) selected</p>
      )}
    </div>
  )
}

export default CollectionSelector
