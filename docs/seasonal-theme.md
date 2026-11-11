# Seasonal theme

The current season is autumn. Existing routes, page structure and server rules are retained.

## Central configuration

- `apps/web/src/seasons.css` owns all semantic color channels and shadow tokens, including light/dark variants. Tailwind reads these variables; pages do not own palettes.
- `apps/web/src/lib/seasons.ts` registers available seasons and the active season. Only autumn is implemented. Winter, spring and summer are type names reserved for later complete themes.
- `apps/web/src/lib/theme.tsx` preserves the user's light/dark/system preference and synchronizes the browser theme-color and Telegram header/background with the active background token.
- `apps/web/src/components/home/SeasonalLeaves.tsx` uses the active decoration configuration. Three small inline SVG leaves animate inside the homepage Premium banner only; the overlay ignores pointer input and is hidden from assistive technology. Reduced-motion hides it entirely.

To add another season, define its complete token selector and dark variant in seasons.css, register its decoration configuration, and change ACTIVE_SEASON. No individual page changes are needed. Keep forest/navy surface colors separate from primary text/action colors so dark-mode contrast remains readable.

## Autumn palette

The requested cream #F3EBDD, secondary #EAE1D3, ivory #FFFDF8, forest #263D35 / #385447, copper #A65E32, gold #D6A64B, burgundy #A34E3D, navy #343747, text #292D2A and border #E3D8C8 are defined centrally as HSL channels for opacity support. The supplied secondary text #77746D is retained as text-secondary; small muted copy uses darker #646159 for contrast on the secondary surface. Gold text uses a deeper gold token; dark mode uses lighter text tokens.

The previous large photographic backdrop remains as an unused source asset. The active backdrop is a lightweight warm CSS gradient, and its image preload has been removed.

## Verification

Use npm run typecheck, npm run build -w @zerolax/web and npm run test:mobile. The browser audit in .data/verify-autumn.mjs checks the compiled app against the local API with a signed Telegram session, page widths, seasonal tokens, light/dark mode, reduced motion, Telegram colors and admin routes. Diagnostics and screenshots are local ignored artifacts. See DEVELOPMENT_STATUS.md for results and limitations.
