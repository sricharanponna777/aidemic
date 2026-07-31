import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  ClipboardList,
  Compass,
  Gauge,
  GraduationCap,
  Headphones,
  Layers,
  LayoutDashboard,
  ListChecks,
  PenLine,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

export type NavGroup = {
  label: string | null;
  items: NavItem[];
};

export const STUDENT_NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/dashboard/subjects", label: "Subjects", icon: GraduationCap },
    ],
  },
  {
    label: "Learn",
    items: [
      { href: "/dashboard/notes", label: "Notes", icon: BookOpen },
      { href: "/dashboard/podcasts", label: "Podcasts", icon: Headphones },
      { href: "/dashboard/flashcards", label: "Flashcards", icon: Layers },
    ],
  },
  {
    label: "Review",
    items: [
      { href: "/dashboard/daily-review", label: "Daily Review", icon: ListChecks },
      { href: "/dashboard/study-sessions", label: "Flashcard Revision", icon: Brain },
      { href: "/dashboard/confidence", label: "Topic Confidence", icon: Gauge },
      { href: "/dashboard/planner", label: "Planner", icon: CalendarDays },
    ],
  },
  {
    label: "Practice",
    items: [
      { href: "/dashboard/ai-questions", label: "Smart Practice", icon: Target },
      { href: "/dashboard/blurt", label: "Blurting", icon: PenLine },
    ],
  },
  {
    label: "Improve",
    items: [
      { href: "/dashboard/exam-coach", label: "Exam Coach", icon: Compass },
    ],
  },
  {
    label: null,
    items: [
      { href: "/dashboard/classes", label: "My Classes", icon: Users },
      { href: "/dashboard/family", label: "Link Parent", icon: UserPlus },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const GROUP_ICONS: Record<string, LucideIcon> = {
  Learn: BookOpen,
  Review: ListChecks,
  Practice: Target,
  Improve: Compass,
};

export const TEACHER_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard/teacher", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/teacher/classes", label: "Classes", icon: Users },
  { href: "/dashboard/teacher/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/dashboard/teacher/reports", label: "Reports", icon: BarChart3 },
  { href: "/dashboard/teacher/ai-insights", label: "AI Insights", icon: Sparkles },
  { href: "/dashboard/teacher/question-bank", label: "Question Bank", icon: Layers },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export const PARENT_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard/parent", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/parent/progress", label: "Progress", icon: TrendingUp },
  { href: "/dashboard/parent/subjects", label: "Subjects", icon: BookOpen },
  { href: "/dashboard/parent/activity", label: "Activity", icon: CalendarDays },
  { href: "/dashboard/parent/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

/** Routes only a student may open. Teachers and parents are redirected away
 *  from these in the proxy; every other `/dashboard/*` route is either shared
 *  or already gated by its own prefix check. */
export const STUDENT_ONLY_PREFIXES = [
  "/dashboard/subjects",
  "/dashboard/notes",
  "/dashboard/podcasts",
  "/dashboard/flashcards",
  "/dashboard/daily-review",
  "/dashboard/study-sessions",
  "/dashboard/confidence",
  "/dashboard/planner",
  "/dashboard/ai-questions",
  "/dashboard/blurt",
  "/dashboard/exam-coach",
  "/dashboard/classes",
  "/dashboard/family",
];

export function isActiveRoute(item: { href: string; exact?: boolean }, pathname: string) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Longest-href match for `pathname` across `groups`. Used by the section
 *  breadcrumb to highlight the active group and by the parent layout to title
 *  the page from its nav entry. */
export function findNavItem(
  pathname: string,
  groups: NavGroup[] = STUDENT_NAV_GROUPS,
): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      if (!isActiveRoute(item, pathname)) continue;
      if (!best || item.href.length > best.item.href.length) best = { group, item };
    }
  }
  return best;
}
