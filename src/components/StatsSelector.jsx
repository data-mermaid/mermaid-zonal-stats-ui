const AVAILABLE_STATS = [
  { id: 'mean', label: 'Mean', description: 'Average value' },
  { id: 'median', label: 'Median', description: 'Middle value' },
  { id: 'std', label: 'Std Dev', description: 'Standard deviation' },
  { id: 'min', label: 'Min', description: 'Minimum value' },
  { id: 'max', label: 'Max', description: 'Maximum value' },
  { id: 'majority', label: 'Majority', description: 'Most frequent value' },
]

function StatsSelector({ selectedStats, onSelectionChange }) {
  const handleToggle = (statId) => {
    const newSelection = new Set(selectedStats)
    if (newSelection.has(statId)) {
      newSelection.delete(statId)
    } else {
      newSelection.add(statId)
    }
    onSelectionChange(newSelection)
  }

  return (
    <div className="stats-selector">
      <div className="stats-list">
        {AVAILABLE_STATS.map((stat) => (
          <label
            key={stat.id}
            className={`stats-item ${selectedStats.has(stat.id) ? 'stats-selected' : ''}`}
            title={stat.description}
          >
            <input
              type="checkbox"
              checked={selectedStats.has(stat.id)}
              onChange={() => handleToggle(stat.id)}
            />
            <span className="stats-label">{stat.label}</span>
          </label>
        ))}
      </div>
      {selectedStats.size === 0 && <p className="stats-warning">Select at least one statistic</p>}
    </div>
  )
}

export default StatsSelector
