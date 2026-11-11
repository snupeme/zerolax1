import { activeSeason } from '../../lib/seasons';
export function SeasonalLeaves() {
  const { leaves, count } = activeSeason.decorations;
  if (!leaves) return null;
  return <span className="seasonal-leaves" aria-hidden="true">{Array.from({ length: count }, (_, i) => (
    <svg key={i} className="seasonal-leaf" viewBox="0 0 24 36" fill="none">
      <path d="M12 2C5 7 1 15 4 22c2 5 6 7 9 6C25 23 22 11 12 2Z" fill="currentColor" />
      <path d="m11 33 2-24m-1 14-5-6m6 1 5-5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ))}</span>;
}
