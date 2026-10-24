# Dashboard and search screenshots

Captured in Steel Browser using the actual app components and current production CSS, with synthetic saved-run fixtures in an isolated local harness. No hardware commands or database writes were sent.

- `dashboard-light.png`, `dashboard-dark.png`: current Saved runs dashboard, 1440 × 1000.
- `dashboard-mobile.png`: current dashboard, 390 × 844.
- `search-desktop.png`, `search-mobile.png`, `search-mobile-id.png`: updated search dialog.

Verified Ctrl+K/input autofocus, empty results with Arrow/Enter, Results lookup, keyboard selection/navigation, mobile drawer-to-search flow, viewport bounds, Escape dismissal and Indonesian lookup. Assertions are in `verification.json`.

Search uses the existing Radix dialog and shared shadcn Button. Descriptions, category headings, icon boxes, per-row keyboard pills and status footer were removed. Navigation names follow the sidebar; Experiments and Results are now included. Hardware actions remain available with connection guards.
