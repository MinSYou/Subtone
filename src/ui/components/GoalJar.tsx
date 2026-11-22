import { Icon } from './Icon';

export const GOAL_ICONS = [
  { icon: 'plane', label: 'Travel', color: '#3346D3' },
  { icon: 'shield', label: 'Emergency fund', color: '#0F6E66' },
  { icon: 'home', label: 'Home', color: '#1F2A7A' },
  { icon: 'laptop', label: 'Tech', color: '#B4480F' },
  { icon: 'gift', label: 'Gifts', color: '#A63D6B' },
  { icon: 'car', label: 'Car', color: '#7C8BEA' },
  { icon: 'sprout', label: 'Investing', color: '#4FA79C' },
  { icon: 'book', label: 'Study', color: '#6A4FB3' },
];

/**
 * Animated goal bucket: the fill rises to the saved percentage with a gentle wave, and the icon
 * bobs (pops once when complete). All motion is disabled under prefers-reduced-motion.
 */
export function GoalJar({ icon, color, pct, complete, celebrate, size = 52 }: { icon: string; color: string; pct: number; complete?: boolean; celebrate?: boolean; size?: number }) {
  const level = Math.max(6, Math.min(100, pct));
  return (
    <span className={`goal-jar${complete ? ' complete' : ''}${celebrate ? ' celebrate' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="level" style={{ height: `${level}%`, background: `${color}55` }} />
      <span className="ico" style={{ color }}>
        <Icon name={icon} size={Math.round(size * 0.46)} />
      </span>
    </span>
  );
}
