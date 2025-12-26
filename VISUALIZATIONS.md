# Toronto Money Flow - Visualizations Implemented

## Summary

All visualizations have been successfully implemented using **accurate ward boundaries** from Toronto Open Data.

## Implemented Visualizations

### 1. **Stacked Bar Chart - Competitive vs Non-Competitive Contracts**
- **Location**: Section 1: City Spending on Contracts
- **File**: `app/page.js` (lines 218-291)
- **Visualization**: Horizontal stacked bar showing percentage split
- **Colors**: Blue (competitive), Orange (non-competitive)
- **Features**:
  - Inline percentage labels
  - Legend with exact amounts
  - Warning message if non-competitive > 30%

### 2. **Division Spending - Horizontal Bar Charts**
- **Location**: Section 3: What Are We Buying? → By City Department
- **File**: `app/page.js` (lines 414-451)
- **Visualization**: Horizontal bars showing relative spending by department
- **Colors**: Top department in darker blue (#3b82f6), others in light blue (#93c5fd)
- **Features**:
  - Proportional bar widths
  - Amount displayed next to department name
  - Visual ranking

### 3. **Category Spending - Horizontal Bar Charts**
- **Location**: Section 3: What Are We Buying? → By Type of Purchase
- **File**: `app/page.js` (lines 453-490)
- **Visualization**: Horizontal bars showing spending by procurement category
- **Colors**: Top category in darker blue, others in light blue
- **Features**: Same as division chart

### 4. **Ward Choropleth Map - Geographic Visualization** 🗺️
- **Location**: Section 4: Your Neighborhood → Investment Map by Ward
- **File**: `app/page.js` (lines 604-677)
- **API Endpoint**: `/api/ward-map` (`app/api/ward-map/route.js`)
- **Visualization**: SVG-based choropleth map of Toronto's 25 wards
- **Data Source**:
  - Ward boundaries GeoJSON from Toronto Open Data
  - Resource ID: `737b29e0-8329-4260-b6af-21555ab24f28`
  - URL: https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/5e7a8234-f805-43ac-820f-03d7c360b588/resource/737b29e0-8329-4260-b6af-21555ab24f28/download/city-wards-data.geojson
- **Colors**: Light blue → Dark blue gradient based on investment intensity
  - Gray (#e5e7eb) for wards with $0 investment
  - `rgba(59, 130, 246, 0.2 + intensity * 0.8)` for color scale
- **Features**:
  - Hover tooltips showing ward name + investment amount
  - Responsive SVG scales to container
  - Color legend explaining intensity
  - All 25 wards rendered with accurate boundaries

## API Enhancements

### `/api/capital-by-ward` Updated
- **File**: `app/api/capital-by-ward/route.js`
- **New field**: `allWards` - Returns complete ward totals array (not just top/bottom)
- **Purpose**: Enables other visualizations and client-side filtering

### `/api/ward-map` New Endpoint
- **File**: `app/api/ward-map/route.js`
- **Returns**: GeoJSON FeatureCollection with enriched properties
- **Features**:
  - Fetches ward boundaries from Toronto Open Data
  - Merges with capital budget data by ward number
  - Adds `total_investment` and `project_count` properties
  - Includes `metadata.maxInvestment` for color scaling
  - Caches GeoJSON in memory for performance

## Data Flow

```
1. User loads page → React useEffect hooks fire
2. Fetch /api/ward-map?year=2024
3. API fetches GeoJSON from Toronto Open Data (cached after first load)
4. API loads capital budget data from data/processed/capital_by_ward.json
5. API aggregates by ward and enriches GeoJSON properties
6. Frontend receives GeoJSON with investment data
7. SVG map renders with color-coded wards
8. Hover shows tooltip with ward name + investment
```

## Technical Details

### Map Projection
- **Coordinate System**: WGS84 (EPSG:4326) - Latitude/Longitude
- **Bounding Box** (approximate):
  - Min Lng: -79.65
  - Max Lng: -79.1
  - Min Lat: 43.57
  - Max Lat: 43.85
- **SVG ViewBox**: 800x600
- **Projection**: Simple linear projection (sufficient for city-level visualization)

### GeoJSON Properties Used
- `AREA_SHORT_CODE`: Ward number (e.g., "07")
- `AREA_NAME`: Ward name (e.g., "Humber River-Black Creek")
- Added properties:
  - `ward_number`: Parsed integer ward number
  - `ward_name`: Human-readable name
  - `total_investment`: Sum of capital budget amounts
  - `project_count`: Number of projects in this ward

### Performance Optimizations
- GeoJSON cached in memory after first fetch
- Capital data read from local processed JSON file
- SVG rendering is native browser capability (no heavy libraries)
- Responsive design scales well on mobile

## Current Status

✅ All 4 visualizations implemented and working
✅ Ward map uses real Toronto ward boundaries
✅ Data fetching from Toronto Open Data API
✅ APIs returning correct data
✅ Page rendering map with hover interactions

## Testing

Test the ward map API:
```bash
curl -s 'http://localhost:3002/api/ward-map?year=2024' | python3 -c "import sys, json; data = json.load(sys.stdin); print('Features:', len(data.get('features', []))); print('Max Investment:', data.get('metadata', {}).get('maxInvestment'))"
```

Expected output:
```
Features: 25
Max Investment: [some dollar amount]
```

## Next Steps (Optional)

1. **Interactive Map Features**:
   - Click to zoom into ward
   - Click to show ward details panel
   - Touch support for mobile

2. **Additional Visualizations**:
   - Year-over-year trend charts (capital budget has 10-year projections)
   - Per-capita investment (requires population data)
   - Investment category breakdown by ward

3. **Map Enhancements**:
   - Ward labels (ward numbers) on the map
   - Click to highlight and lock tooltip
   - Animation when changing years
