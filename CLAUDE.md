# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**mermaid-zonal-stats-ui** is an MVP React web application that allows authenticated MERMAID users to extract environmental covariates (zonal statistics) from raster datasets for their coral reef sample events.

**Primary Use Case:** A researcher wants to enrich their MERMAID sample event data with environmental variables (sea surface temperature, degree heating weeks, etc.) extracted from satellite imagery for the locations and dates of their surveys.

**Related Repositories:** Other MERMAID repositories are available in sister directories (`../mermaid-api/`, `../mermaid-webapp/`, `../mermaid-dash-v2/`, `../zonal-stats/`, etc.). See `../CLAUDE.md` for the full monorepo overview.

## MVP Requirements

### Authentication
- User must log in with their MERMAID account (Auth0) before seeing any data
- Unauthenticated users see only a login prompt
- Uses same Auth0 tenant as other MERMAID apps (`datamermaid.auth0.com`)

### Sample Event Filtering
Users can filter sample events they have access to (from their projects) by:
- **Project(s)** - multi-select from projects user belongs to
- **Date range** - start/end date picker
- **Country(ies)** - multi-select, derived from sample events in selected projects
- **Organization(s)** - multi-select, organizations associated with selected projects via tags

### STAC Collection Selection
- Browse available STAC collections from the catalog
- Filter/search collections by name or description
- Multi-select collections to include in zonal stats extraction
- Collections without raster COGs (vector-only) should be greyed out/disabled

### Statistics Configuration
User selects one or more statistics to calculate:
- mean
- median
- std (standard deviation)
- min (minimum)
- max (maximum)
- majority (most frequent value)

### Buffer Size
- Default: 1000 meters
- User-configurable: 1m to 100,000m
- MVP can start with fixed 1000m if simpler

### Map Display
- Simple map showing locations of selected sample events as markers
- Basic interactivity (zoom, pan)
- No raster visualization required for MVP

### Action: Extract Zonal Stats
A prominent button triggers the following workflow:
1. For each selected sample event (SE):
   - For each selected STAC collection:
     - Find the most recent COG item with datetime **on or before** the SE's sample_date
     - If no COG exists before the date, use the first available COG **after** the date
     - Call zonal stats API with SE lat/lon, buffer, selected statistics, and COG URL
2. Fetch full SE-level data for all selected sample events
3. Combine SE data with computed zonal stats into a results table
4. Display results and prompt for CSV download

### CSV Export
- All SE-level fields (site, date, protocols, observers, etc.)
- Plus computed zonal stats columns named like: `{collection_id}_{statistic}` (e.g., `noaa-monthly-max-dhw_mean`)
- One row per sample event

---

## Service Architecture

This UI integrates four backend services:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        mermaid-zonal-stats-ui                           │
│                     (React Web Application)                              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┬─────────────────┐
        ▼                       ▼                       ▼                 ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐  ┌─────────────┐
│  STAC Catalog │     │    TiTiler      │     │ Zonal Stats API │  │ MERMAID API │
│   (Prescient) │     │   (Prescient)   │     │   (MERMAID)     │  │  (MERMAID)  │
└───────────────┘     └─────────────────┘     └─────────────────┘  └─────────────┘
        │                       │                       │                 │
        ▼                       ▼                       ▼                 ▼
   Collection &           (Future:              Statistics          User projects,
   Item Discovery         Tile Preview)         Calculation         Sample Events
```

### 1. MERMAID API
**URL:** `https://api.datamermaid.org`

Provides user authentication context and sample event data.

**Key Endpoints:**
- `GET /me/` - Current user profile (requires auth)
- `GET /projects/` - List projects user belongs to (requires auth)
- `GET /projects/{id}/sampleevents/` - Sample events for a project (requires auth)
- `GET /choices/` - Reference data (countries, etc.)

**Authentication:**
- Bearer token in `Authorization` header
- Token obtained via Auth0 login flow

### 2. STAC Catalog
**URL:** `https://mermaid.prescient.earth/stac/`

SpatioTemporal Asset Catalog for raster dataset discovery.

**Key Endpoints:**
- `GET /collections` - List all available collections
- `GET /collections/{collection_id}` - Get collection metadata
- `GET /collections/{collection_id}/items` - List items in collection
- `POST /search` - Search items with filters (bbox, datetime, collections)

**Available Collections:**

| Collection ID | Title | Description |
|--------------|-------|-------------|
| `noaa-monthly-max-dhw` | NOAA DHW Monthly Aggregation | Degree Heating Weeks - coral bleaching heat stress (0-20 °C-weeks) |
| `50b810fb-5f17-4cdb-b34b-c377837e2a29` | Daily Sea Surface Temperature | Global SST in °C (1985-present) |
| `640da5d3-530f-4b92-bbb8-07e70e386f8b` | ACA Benthic Habitat | Allen Coral Atlas benthic habitat classification |
| `3e410700-2e6a-4b44-a2d3-1d829d19acb0` | MEOW Boundaries | Marine Ecoregions Of the World (vector - no zonal stats) |

### 3. Zonal Statistics API
**URL:** `https://api.zonalstats.datamermaid.org/api/v1`

Calculates statistics from raster data for point/polygon geometries.

**Endpoint:** `POST /zonal-stats`

**Request (Point with buffer):**
```json
{
  "aoi": {
    "type": "Point",
    "coordinates": [longitude, latitude],
    "buffer_size": 1000
  },
  "stats": ["mean", "std", "min", "max"],
  "image": {
    "url": "https://example.com/cog.tif",
    "bands": [1]
  }
}
```

**Response:**
```json
{
  "band_1": {
    "mean": 7.8,
    "std": 2.1,
    "min": 0.5,
    "max": 15.2
  }
}
```

**Available Statistics:** min, max, mean, count, sum, std, median, majority, minority, unique, range, nodata, area

### 4. TiTiler (Future Enhancement)
**URL:** `https://mermaid.prescient.earth/raster`

Dynamic raster tile server for map visualization. Not required for MVP but available for future enhancements.

---

## Implementation Approaches

Two approaches for building this MVP. Both use the same Auth0 client ID as Collect and Explore apps.

### Approach A: Standalone Minimal App

Build a new standalone React application in this directory (`mermaid-zonal-stats-ui/`) with minimal dependencies.

**Stack:**
- Vite + React 18
- Plain CSS Modules for styling
- Native HTML elements (`<select>`, `<input>`, `<table>`, `<button>`)
- Leaflet + react-leaflet for map
- Native `fetch` for API calls
- Auth0 (`@auth0/auth0-react`)

**Pros:**
- **Clean slate** - no legacy code to understand or work around
- **Fastest to build** - can move quickly without worrying about breaking existing functionality
- **Simple codebase** - easy to understand, debug, and maintain
- **Independent deployment** - can deploy/iterate without coordinating with Explore
- **Minimal bundle** - only includes what's needed
- **Low risk** - if something breaks, it only affects this app

**Cons:**
- **Duplicate infrastructure** - must set up Auth0, API clients, error handling from scratch
- **Separate app to maintain** - another codebase, another deployment pipeline
- **No visual consistency** - won't match Explore's look unless manually styled to match
- **User context switch** - users navigate to a different app for this feature
- **No code reuse** - can't leverage existing Explore components (filters, map, tables)

**Key Dependencies:**
```json
{
  "react": "^18",
  "react-dom": "^18",
  "@auth0/auth0-react": "^2",
  "leaflet": "^1.9",
  "react-leaflet": "^4"
}
```

**Effort Estimate:** Build from scratch, but simpler scope.

---

### Approach B: Add Feature to Explore App

Add a new route/feature to the existing `mermaid-dash-v2` (Explore) application.

**What Explore Already Has:**
- Auth0 authentication fully configured
- MERMAID API integration with authenticated fetch patterns
- MapLibre GL map with marker clustering
- Material-UI components + styled-components
- React Table v7 for data display
- Plotly for charts
- Filter pane with multi-select, date pickers
- CSV export functionality (react-csv)
- i18n internationalization
- Context-based state management (FilterProjectsContext)
- Generic reusable components (buttons, forms, modals, tooltips)

**Implementation Path:**
1. Add new route: `/zonal-stats` in `App.jsx`
2. Create `ZonalStatsFeature` component (or similar)
3. Either extend `FilterProjectsContext` or create new `ZonalStatsContext`
4. Reuse existing components: FilterPane patterns, MaplibreMap, TableView patterns
5. Add new API service for STAC catalog and zonal stats endpoints
6. Add translation keys to `translation.json`

**Pros:**
- **Infrastructure already exists** - Auth0, API patterns, error handling, loading states
- **Visual consistency** - matches Explore's existing look and feel
- **Code reuse** - leverage existing map, table, filter, and generic components
- **Single app for users** - natural discovery, no context switch
- **Shared maintenance** - improvements to Explore benefit zonal stats and vice versa
- **Established patterns** - follow existing conventions, less decision-making

**Cons:**
- **Larger codebase to learn** - ~750 lines in FilterProjectsContext alone, MUI + styled-components patterns
- **Risk of breaking Explore** - changes could affect existing functionality
- **Tighter coupling** - must work within Explore's architectural decisions
- **Coordination overhead** - may need to coordinate with other Explore development
- **Heavier stack** - MUI is more complex than needed for this feature
- **Slower iteration** - more careful testing needed before deploying

**Key Files to Modify:**
- `mermaid-dash-v2/src/App.jsx` - add route
- `mermaid-dash-v2/src/components/` - add new feature components
- `mermaid-dash-v2/src/context/` - add or extend context
- `mermaid-dash-v2/src/locales/en/translation.json` - add i18n keys

**Effort Estimate:** Less new code, but more integration complexity.

---

## Opinion: Which Approach?

**I recommend Approach A (Standalone) for this MVP.** Here's my reasoning:

### Why Standalone for MVP:

1. **Validation first**: The core workflow (STAC discovery → COG selection → zonal stats → CSV) is unproven in a UI context. A standalone app lets you validate this quickly without the overhead of learning Explore's architecture.

2. **Risk isolation**: If the zonal stats workflow has issues or needs significant iteration, a standalone app can be modified freely without risk to the production Explore app.

3. **Speed to working prototype**: You can have something functional faster. Auth0 setup is straightforward (<30 min), and the rest is focused on the actual feature logic.

4. **Simpler debugging**: When something goes wrong, you know it's in your code, not an interaction with existing Explore state management.

5. **Integration later is easy**: If the MVP proves valuable, it can be integrated into Explore later. The core logic (STAC helpers, zonal stats API calls, CSV generation) would transfer directly - only the UI components would need adaptation to MUI/styled-components.

### When Approach B would be better:

- If you're **certain** this feature will live in Explore long-term
- If **visual consistency** with Explore is a hard requirement from day one
- If someone on the team is **already very familiar** with the Explore codebase
- If there's **no urgency** and you can afford the longer ramp-up time

### Bottom Line:

For an MVP where the goal is "demonstrate all desired functionality, not have bugs" - standalone is lower risk and faster to iterate. The UI can be polished or integrated into Explore after the workflow is proven.

---

## Milestones

*These milestones are written for Approach A (Standalone). For Approach B (Explore integration), Milestone 1 would be replaced with "Add route and basic component structure to Explore" since auth already exists.*

### Milestone 1: Project Scaffolding & Authentication (Approach A only) ✅
**Goal:** User can log in and see their projects.

- [x] Initialize Vite + React project
- [x] Configure Auth0 provider with MERMAID tenant
- [x] Create login/logout flow
- [x] Fetch and display user's projects from MERMAID API
- [x] Protected route wrapper (redirect to login if unauthenticated)

**Deliverable:** App that shows "Welcome, {user}" and lists their project names after login.

#### Milestone 1 Implementation Notes

**1. Bootstrap the project:**
```bash
cd /home/kim/repos/mermaid/mermaid-zonal-stats-ui
yarn create vite . --template react
yarn add @auth0/auth0-react
```

**2. Auth0 Dashboard Setup:**
The Auth0 application (client ID `4AHcVFcwxHb7p1VFB9sFWG52WL7pdNm5`) needs these URLs in its settings:
- Allowed Callback URLs: `http://localhost:5173`
- Allowed Logout URLs: `http://localhost:5173`
- Allowed Web Origins: `http://localhost:5173`

*(These may already be configured since Collect/Explore use the same client ID - verify before adding.)*

**3. API Response Shapes:**

`GET /me/` returns:
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "full_name": "John Doe",
  "picture": "https://...",
  "projects": [
    {
      "id": "project-uuid",
      "name": "Project Name",
      "role": 90,
      "num_active_sample_units": 15
    }
  ]
}
```
*Note: `full_name` is computed - returns formatted name or email prefix if names are empty.*

`GET /projects/` returns array of:
```json
{
  "id": "uuid",
  "name": "Project Name",
  "notes": "Description",
  "status": 90,
  "countries": ["Australia", "Indonesia"],
  "num_sites": 12,
  "num_sample_units": 48,
  "tags": ["Organization Name"],
  "project_admins": [{"id": "uuid", "name": "Admin Name"}],
  "bbox": {"xmin": 144.1, "ymin": -16.4, "xmax": 145.7, "ymax": -15.2}
}
```
*Status codes: 90=Open, 80=Test, 10=Locked. Role codes: 90=Admin, 50=Collector, 10=Read-only.*

**4. For Milestone 1, display:**
- User's name from `/me/` response (`full_name` field)
- List of project names from `/me/` response (`projects` array) - this is simpler than calling `/projects/` separately

---

### Milestone 2: Sample Event Filtering ✅
**Goal:** User can filter and select sample events.

- [x] Fetch sample events for selected project(s)
- [x] Build filter UI: project multi-select, date range, country, organization
- [x] Extract countries and organizations from fetched data
- [x] Display filtered sample events in a simple list/table
- [x] Checkbox selection for sample events

**Deliverable:** User can filter sample events and select which ones to process.

#### Milestone 2 Implementation Notes

**1. Primary API Endpoint:**

Use `GET /projectsummarysampleevents/` - this is the same endpoint Explore uses. It returns projects with their sample event records in a single response, which is more efficient than fetching sample events per project.

**Endpoint:** `{VITE_MERMAID_API_URL}/projectsummarysampleevents/`

*Note: `VITE_MERMAID_API_URL` already includes `/v1` (e.g., `https://dev-api.datamermaid.org/v1`)*

**Pagination:** Yes, returns paginated results. Use `?limit=300&page=1` and follow `next` URL until exhausted. See Explore's `MermaidDash.jsx:123-159` for pagination pattern.

**Authentication:** Bearer token required. Authenticated users see their private projects; unauthenticated users see only public data.

**2. Response Shape:**

Each result item represents a project:
```json
{
  "project_id": "uuid",
  "project_name": "Project Name",
  "project_admins": [{"id": "uuid", "name": "Admin Name"}],
  "tags": [{"id": "uuid", "name": "Organization Name"}],
  "records": [
    {
      "sample_event_id": "uuid",
      "sample_date": "2024-01-15",
      "site_id": "uuid",
      "site_name": "Site Name",
      "country_id": "uuid",
      "country_name": "Australia",
      "latitude": -16.5,
      "longitude": 145.4,
      "management_id": "uuid",
      "management_name": "Management Area",
      "observers": [{"id": "uuid", "name": "Observer Name"}],
      "protocols": {
        "beltfish": {"sample_unit_count": 3, ...},
        "benthicpit": {"sample_unit_count": 2, ...}
      },
      "project_name": "Project Name",
      "reef_type": "fringing",
      "reef_zone": "back reef",
      "reef_exposure": "semi-exposed"
    }
  ],
  "data_policy_beltfish": "public",
  "data_policy_benthiclit": "private",
  ...
}
```

**3. Extracting Filter Options:**

- **Countries:** Extract unique `country_name` values from all `records` across all projects
- **Organizations:** Extract unique `name` values from all `tags` arrays across all projects
- **Date range:** Filter on `sample_date` field (format: "YYYY-MM-DD")

**4. Filtering Logic:**

Since we fetch all data upfront (like Explore does), filtering is done client-side:
- Filter by selected project(s): include records from those projects only
- Filter by date range: compare `record.sample_date` to selected range
- Filter by country: match `record.country_name`
- Filter by organization: match if project's `tags` include the selected org

**5. Location Coordinates:**

Coordinates are available as top-level fields on each record:
```javascript
const { latitude, longitude } = record
```

**6. For selection:**

Use `sample_event_id` as the unique identifier for each sample event.

### Milestone 3: Map Display ✅
**Goal:** Selected sample events appear on a map.

- [x] Add Leaflet map component
- [x] Plot selected sample events as markers (lat/lon)
- [x] Basic zoom/pan controls
- [x] Marker clustering if many points

**Deliverable:** Map showing selected sample event locations.

#### Milestone 3 Implementation Notes

**1. Dependencies added:**
```bash
yarn add leaflet react-leaflet react-leaflet-cluster
```

**2. Component:** `src/components/SampleEventMap.jsx`

**3. Key features:**
- Uses OpenStreetMap tiles via `TileLayer`
- `MarkerClusterGroup` from `react-leaflet-cluster` groups nearby markers
- Selected markers shown in blue (full opacity), unselected in gray (60% opacity)
- Clicking a marker shows popup with site name and sample date
- `FitBounds` component auto-zooms to show all markers (or just selected if any selected)
- Leaflet icon fix included (default icons don't work well with bundlers)

**4. Map behavior:**
- Map displays filtered sample events (controlled by filters in sidebar)
- Selection state (checkboxes in table) controls marker styling only - map doesn't modify selection
- Legend shows selected/unselected color coding

---

### Milestone 4: STAC Collection Selection ✅
**Goal:** User can browse and select STAC collections.

- [x] Fetch collections from STAC catalog
- [x] Display collections with title and description
- [x] Detect which collections have COG assets (grey out vector-only)
- [x] Multi-select UI for collections
- [x] Statistics type selection (checkboxes for mean, median, std, min, max, majority)

**Deliverable:** User can select which collections and statistics to extract.

#### Milestone 4 Implementation Notes

**1. Files created:**
- `src/services/stacApi.js` - STAC API client with functions for:
  - `fetchCollections()` - Fetch all collections from STAC catalog
  - `checkCollectionHasCog(collectionId)` - Check if collection has COG items
  - `fetchCollectionsWithCogStatus()` - Fetch collections with COG availability checked
  - `findItemForDate(collectionId, sampleDate)` - Find best COG for a sample date
  - `getCogUrl(item)` - Extract COG URL from STAC item
- `src/components/CollectionSelector.jsx` - Multi-select component for STAC collections
- `src/components/StatsSelector.jsx` - Checkbox grid for statistics selection

**2. COG Detection Pattern:**

Following the mermaidr-covariates pattern, COGs are identified by checking if a collection's items have a `data` asset:
```javascript
// Check first item in collection for "data" asset
const item = data.features[0]
return item.assets && 'data' in item.assets
```

**3. State Management:**

Added to App.jsx:
```javascript
const [selectedCollections, setSelectedCollections] = useState(new Set())
const [selectedStats, setSelectedStats] = useState(new Set(['mean']))
```

**4. UI Layout:**

Components are displayed in a "Select covariates" section in the sidebar, below the filter pane. Collections are sorted with COG-enabled collections first.

**5. Statistics Available:**
- mean, median, std (standard deviation), min, max, majority

#### Post-Milestone 4 Refinements

**UI Naming:**
- App title: "MERMAID Covariates" (not "Zonal Stats")
- Filter section: "Filter your MERMAID data"
- Covariate section: "Select covariates"
- Removed "STAC Collections" and "Statistics" sub-headings

**Data Filtering:**
- Only sample events from projects the user is a member of are shown
- Filters by comparing `projectSummaries` against `userData.projects` from `/me/` endpoint

**Table Improvements:**
- Fixed-width columns with text truncation (hover for full text)
- Sticky header with scrollable body (max-height: 400px)
- `table-layout: fixed` for consistent column sizing

**Filter UX:**
- Replaced native `<select multiple>` with collapsible checkbox lists
- Click header to expand/collapse options
- Badge shows count of selected items
- × button to clear selections per filter

**Collection Details:**
- Info button (ⓘ) toggles description visibility per collection
- Descriptions hidden by default to save space

---

### Milestone 5: Zonal Stats Extraction
**Goal:** Core extraction workflow works.

- [ ] For each selected SE + collection:
  - [ ] Search STAC for items by datetime (on or before sample_date)
  - [ ] Handle fallback (first item after date if none before)
  - [ ] Call zonal stats API with SE coordinates, buffer, stats, COG URL
- [ ] Aggregate results into a data structure
- [ ] Show progress indicator during extraction
- [ ] Handle errors gracefully (display which SEs/collections failed)

**Deliverable:** Clicking "Extract" fetches zonal stats for all selected SEs and collections.

### Milestone 6: Results Display & CSV Export
**Goal:** User can view and download results.

- [ ] Fetch full SE-level data for selected sample events
- [ ] Merge SE data with computed zonal stats
- [ ] Display combined results in a table
- [ ] Generate CSV with all columns
- [ ] Download button triggers CSV download

**Deliverable:** User can view results table and download CSV with SE data + zonal stats.

### Milestone 7: Polish & Edge Cases
**Goal:** Handle edge cases and improve UX.

- [ ] Loading states throughout
- [ ] Error handling and user feedback
- [ ] Empty state messaging
- [ ] Buffer size configuration (if not done in MVP)
- [ ] Performance optimization for large SE counts
- [ ] Basic responsive layout

**Deliverable:** Production-ready MVP.

---

## Project Structure (Approach A)

*For Approach B, new components would go in `mermaid-dash-v2/src/components/ZonalStats/` following Explore's existing patterns.*

```
src/
├── components/
│   ├── Auth/
│   │   └── LoginButton.jsx       # Auth0 login/logout
│   ├── Filters/
│   │   ├── ProjectSelect.jsx     # Project multi-select
│   │   ├── DateRangeFilter.jsx   # Date range picker
│   │   ├── CountrySelect.jsx     # Country multi-select
│   │   └── OrganizationSelect.jsx
│   ├── SampleEvents/
│   │   ├── SampleEventList.jsx   # Filterable list with checkboxes
│   │   └── SampleEventMap.jsx    # Leaflet map with markers
│   ├── Collections/
│   │   ├── CollectionList.jsx    # STAC collection browser
│   │   └── StatsSelector.jsx     # Statistics checkboxes
│   ├── Results/
│   │   ├── ResultsTable.jsx      # Combined SE + zonal stats
│   │   └── DownloadButton.jsx    # CSV export
│   └── Layout/
│       └── AppLayout.jsx         # Main layout wrapper
├── services/
│   ├── mermaidApi.js             # MERMAID API client (authenticated)
│   ├── stacApi.js                # STAC catalog client
│   └── zonalStatsApi.js          # Zonal stats API client
├── hooks/
│   ├── useAuth.js                # Auth0 wrapper hook
│   ├── useProjects.js            # Fetch user's projects
│   ├── useSampleEvents.js        # Fetch and filter sample events
│   ├── useCollections.js         # Fetch STAC collections
│   └── useZonalStats.js          # Extraction workflow
├── utils/
│   ├── csv.js                    # CSV generation
│   ├── dates.js                  # Date formatting/comparison
│   └── stacHelpers.js            # STAC item filtering logic
├── App.jsx
├── main.jsx
└── index.css
```

---

## Environment Variables

Uses the same Auth0 client ID as Collect and Explore apps.

```env
# Auth0 (same as Collect/Explore)
VITE_AUTH0_DOMAIN=datamermaid.auth0.com
VITE_AUTH0_CLIENT_ID=4AHcVFcwxHb7p1VFB9sFWG52WL7pdNm5
VITE_AUTH0_AUDIENCE=https://api.datamermaid.org

# APIs
VITE_MERMAID_API_URL=https://api.datamermaid.org
VITE_STAC_API_URL=https://mermaid.prescient.earth/stac
VITE_ZONAL_STATS_API_URL=https://api.zonalstats.datamermaid.org/api/v1
```

---

## Key Implementation Patterns

### Authentication Flow
```javascript
// App.jsx
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';

function App() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  if (isLoading) return <Loading />;
  if (!isAuthenticated) return <LoginPrompt onLogin={loginWithRedirect} />;

  return <AuthenticatedApp />;
}
```

### Authenticated API Calls
```javascript
// services/mermaidApi.js
export const createMermaidApi = (getAccessToken) => ({
  async getProjects() {
    const token = await getAccessToken();
    const response = await fetch(`${MERMAID_API_URL}/projects/`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.json();
  },

  async getSampleEvents(projectId) {
    const token = await getAccessToken();
    const response = await fetch(
      `${MERMAID_API_URL}/projects/${projectId}/sampleevents/`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.json();
  }
});
```

### Finding the Right COG for a Sample Date
```javascript
// utils/stacHelpers.js
export async function findCogForDate(collectionId, sampleDate, stacApiUrl) {
  // Search for items on or before sample date
  const beforeResponse = await fetch(`${stacApiUrl}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: [collectionId],
      datetime: `../${sampleDate}`,  // Items up to and including this date
      sortby: [{ field: 'datetime', direction: 'desc' }],
      limit: 1
    })
  });
  const beforeData = await beforeResponse.json();

  if (beforeData.features.length > 0) {
    return beforeData.features[0];
  }

  // Fallback: first item after sample date
  const afterResponse = await fetch(`${stacApiUrl}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: [collectionId],
      datetime: `${sampleDate}/..`,
      sortby: [{ field: 'datetime', direction: 'asc' }],
      limit: 1
    })
  });
  const afterData = await afterResponse.json();

  return afterData.features[0] || null;
}
```

### Zonal Stats Request
```javascript
// services/zonalStatsApi.js
export async function getZonalStats({ lon, lat, cogUrl, stats, buffer = 1000 }) {
  const response = await fetch(`${ZONAL_STATS_API_URL}/zonal-stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aoi: {
        type: 'Point',
        coordinates: [lon, lat],
        buffer_size: buffer
      },
      stats,
      image: { url: cogUrl, bands: [1] }
    })
  });

  if (!response.ok) {
    throw new Error(`Zonal stats failed: ${response.status}`);
  }

  return response.json();
}
```

### CSV Generation
```javascript
// utils/csv.js
export function generateCsv(sampleEvents, zonalStats, collections, stats) {
  // Build header row
  const seFields = ['sample_event_id', 'site_name', 'sample_date', 'latitude', 'longitude', ...];
  const statsFields = collections.flatMap(c =>
    stats.map(s => `${c.id}_${s}`)
  );
  const headers = [...seFields, ...statsFields];

  // Build data rows
  const rows = sampleEvents.map(se => {
    const seData = seFields.map(f => se[f]);
    const statsData = collections.flatMap(c =>
      stats.map(s => zonalStats[se.id]?.[c.id]?.[s] ?? '')
    );
    return [...seData, ...statsData];
  });

  // Convert to CSV string
  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(escapeCSV).join(','))
  ].join('\n');

  return csvContent;
}

function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
```

---

## Development Commands

```bash
# Install dependencies
yarn install

# Start development server
yarn dev

# Build for production
yarn build

# Run linter
yarn lint
```

---

## Testing

For MVP, focus on manual testing of the critical path:
1. Login flow works
2. Projects load for authenticated user
3. Sample events filter correctly
4. STAC collections load and can be selected
5. Extraction produces results
6. CSV downloads with correct data

Automated tests can be added post-MVP for:
- API client functions (mock responses)
- CSV generation logic
- Date comparison utilities

---

## Related Resources

- **STAC Specification:** https://stacspec.org/
- **Zonal Stats API Docs:** https://api.zonalstats.datamermaid.org/docs
- **MERMAID API Docs:** https://mermaid-api.readthedocs.io/
- **Auth0 React SDK:** https://auth0.github.io/auth0-react/
- **React Leaflet (Approach A):** https://react-leaflet.js.org/
- **Explore App (Approach B):** See `../mermaid-dash-v2/` for existing patterns
