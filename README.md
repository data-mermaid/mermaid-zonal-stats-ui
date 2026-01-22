# MERMAID Zonal Stats

A web application for extracting environmental covariates (zonal statistics) from raster datasets for MERMAID coral reef sample events.

## Features

- Authenticate with your MERMAID account
- Filter sample events by project, date range, country, and organization
- Select STAC collections (satellite imagery datasets)
- Choose statistics to extract (mean, median, std, min, max, majority)
- Configure buffer size for point-based extraction
- Download results as CSV (summary) or XLSX (full protocol data with covariates)

## Development

```bash
# Install dependencies
yarn install

# Copy environment variables
cp .env.sample .env
# Edit .env with your Auth0 client ID

# Start development server
yarn dev

# Build for production
yarn build

# Run linter
yarn lint
```

## Environment Variables

See `.env.sample` for required variables:
- `VITE_AUTH0_DOMAIN` - Auth0 domain
- `VITE_AUTH0_CLIENT_ID` - Auth0 client ID
- `VITE_AUTH0_AUDIENCE` - Auth0 audience
- `VITE_MERMAID_API_URL` - MERMAID API base URL
- `VITE_STAC_API_URL` - STAC catalog URL
- `VITE_ZONAL_STATS_API_URL` - Zonal stats API URL

## Related Documentation

See `CLAUDE.md` for detailed implementation notes and architecture documentation.
