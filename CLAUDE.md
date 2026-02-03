# CLAUDE.md

## Overview

**mermaid-zonal-stats-ui** is a React web application that allows authenticated MERMAID users to extract environmental covariates (zonal statistics) from raster and vector datasets for their coral reef sample events.

**Primary Use Case:** Researchers enrich their MERMAID sample event data with environmental variables (SST, DHW, etc.) extracted from satellite imagery (raster) or GeoParquet vector data for survey locations and dates.

**Related:** See `../CLAUDE.md` for the full MERMAID monorepo overview.

## File Structure

```
src/
├── main.jsx                 # App entry, Auth0Provider setup
├── App.jsx                  # Main app component (~900 lines)
├── App.css                  # All styles (~1050 lines)
├── index.css                # Global styles
├── assets/
│   └── mermaid-logo.svg
├── components/
│   ├── SampleEventMap.jsx   # Leaflet map with clustering
│   ├── CollectionSelector.jsx # STAC collection picker
│   └── StatsSelector.jsx    # Statistics checkboxes
├── services/
│   ├── mermaidApi.js        # MERMAID API client
│   ├── stacApi.js           # STAC catalog client
│   └── zonalStatsApi.js     # Zonal stats API client
└── utils/
    ├── csv.js               # CSV generation and download
    └── xlsx.js              # XLSX workbook building
```

## Tech Stack

- Vite + React 18
- Auth0 (`@auth0/auth0-react`) - same client ID as Collect/Explore
- Leaflet + react-leaflet + react-leaflet-cluster
- SheetJS (xlsx) for XLSX export
- Plain CSS (no framework)

## Development Commands

```bash
yarn install    # Install dependencies
yarn dev        # Start dev server (localhost:5173)
yarn build      # Production build
yarn lint       # Run linter
```

## Environment Variables

See `.env.sample`. Uses same Auth0 tenant as other MERMAID apps.

```env
VITE_AUTH0_DOMAIN=datamermaid.auth0.com
VITE_AUTH0_CLIENT_ID=4AHcVFcwxHb7p1VFB9sFWG52WL7pdNm5
VITE_AUTH0_AUDIENCE=https://api.datamermaid.org
VITE_MERMAID_API_URL=https://api.datamermaid.org/v1
VITE_STAC_API_URL=https://mermaid.prescient.earth/stac
VITE_ZONAL_STATS_API_URL=https://api.zonalstats.datamermaid.org/api/v1
```

## API Reference

### MERMAID API

**User profile:** `GET /me/` → `{ id, email, full_name, projects: [{ id, name, role }] }`

**Sample events:** `GET /projectsummarysampleevents/` (paginated, limit=300)
Returns projects with `records` array containing sample events:
```json
{
  "project_id": "uuid",
  "project_name": "...",
  "tags": [{"id": "uuid", "name": "Organization"}],
  "records": [{
    "sample_event_id": "uuid",
    "sample_date": "2024-01-15",
    "site_name": "...",
    "latitude": -16.5,
    "longitude": 145.4,
    "country_name": "Australia",
    "protocols": { "beltfish": {...}, "benthicpit": {...} },
    "observers": [{"name": "..."}]
  }]
}
```

**Protocol CSVs:** `GET /projects/{project_id}/{protocol}/sampleevents/csv`
Protocols: `beltfishes`, `benthiclits`, `benthicpits`, `benthicpqts`, `bleachingqcs`, `habitatcomplexities`

### STAC Catalog

**Collections:** `GET /collections` → array of collection metadata

**Search items:** `POST /search`
```json
{
  "collections": ["collection-id"],
  "datetime": "../2024-01-15",
  "sortby": [{"field": "datetime", "direction": "desc"}],
  "limit": 1
}
```

COGs identified by `data` asset in items. Vector-only collections (no `data` asset) are disabled in UI.

### Zonal Stats API (v0.2.0)

**Raster Endpoint:** `POST /zonal-stats/raster`
```json
{
  "aoi": { "type": "Point", "coordinates": [lon, lat], "radius": 1000 },
  "stats": ["mean", "std", "min", "max", "median", "majority"],
  "url": "https://...cog.tif",
  "bands": [1],
  "approx_stats": true
}
```
**Response:** `{ "band_1": { "mean": 7.8, "std": 2.1, ... } }`

**Vector Endpoint:** `POST /zonal-stats/vector`
```json
{
  "aoi": { "type": "Point", "coordinates": [lon, lat], "radius": 1000 },
  "stats": ["mean", "std", "min", "max", "median"],
  "url": "https://...data.parquet",
  "columns": ["value", "population"]
}
```
**Response:** `{ "value": { "mean": 7.8, "std": 2.1, ... }, "population": { ... } }`

## Key Configuration

- **Concurrency:** 10 parallel for extraction, 5 for XLSX fetches
- **Buffer default:** 1000 meters (configurable 0-100,000m)
- **Raster stats available:** mean, median, std, min, max, majority
- **Vector stats available:** mean, median, std, min, max (majority not supported for vectors)
- **Asset types:** Raster (COG), Vector (GeoParquet), or both

## Known Limitations

- Large extractions (1000+ SE × collection combinations) may be slow
- XLSX download fetches protocol CSVs which can take time for many projects
- No raster preview on map (TiTiler integration deferred)
- Vector collections require column metadata in STAC item or fall back to 'value' column

## Current Features (v0.2.0)

- Auth0 authentication
- Filter sample events by project/date/country/organization
- Sortable, selectable sample event table
- Leaflet map with marker clustering
- STAC collection selection (auto-detects raster COG and vector GeoParquet assets)
- Support for both raster (COG) and vector (GeoParquet) zonal statistics
- Configurable buffer size and statistics
- Parallel covariate extraction with progress
- CSV export (summary) - instant download
- XLSX export (full protocol data) - fetches then builds workbook
- Responsive layout for mobile
