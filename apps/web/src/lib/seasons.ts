export type Season = 'autumn' | 'winter' | 'spring' | 'summer';
interface SeasonalTheme { decorations: { leaves: boolean; count: number }; }
// Other seasons remain unavailable until their complete palettes are supplied.
export const seasonalThemes: Partial<Record<Season, SeasonalTheme>> = {
  autumn: { decorations: { leaves: true, count: 3 } },
};
export const ACTIVE_SEASON: Season = 'autumn';
export const activeSeason = seasonalThemes[ACTIVE_SEASON]!;
