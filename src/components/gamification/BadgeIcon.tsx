import {
  Activity,
  Award,
  Brain,
  CircleCheck,
  ClipboardCheck,
  Crown,
  Flame,
  Gauge,
  Layers,
  Moon,
  Orbit,
  Radio,
  Rocket,
  ScanLine,
  Sparkles,
  Target,
  Telescope,
  Timer,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

/** `badges.icon` holds a Lucide name. Mapped explicitly rather than through
 *  lucide's `icons` export, which would pull every icon into the bundle. */
const BADGE_ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  award: Award,
  brain: Brain,
  'circle-check': CircleCheck,
  'clipboard-check': ClipboardCheck,
  crown: Crown,
  flame: Flame,
  gauge: Gauge,
  layers: Layers,
  moon: Moon,
  orbit: Orbit,
  radio: Radio,
  rocket: Rocket,
  'scan-line': ScanLine,
  sparkles: Sparkles,
  target: Target,
  telescope: Telescope,
  timer: Timer,
  'trending-up': TrendingUp,
  trophy: Trophy,
};

export function BadgeIcon({ name, className }: { name: string; className?: string }) {
  const Icon = BADGE_ICONS[name] ?? Award;
  return <Icon className={className} aria-hidden="true" />;
}
