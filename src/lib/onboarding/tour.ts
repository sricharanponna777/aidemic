import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Camera,
  ClipboardList,
  Compass,
  Gauge,
  Headphones,
  Layers,
  ListChecks,
  PenLine,
  Printer,
  ScanLine,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type OnboardingRole = 'student' | 'teacher' | 'parent';

export type TourFeature = {
  icon: LucideIcon;
  title: string;
  body: string;
  /** Where the feature lives, so a slide can link straight at it. */
  href?: string;
};

export type TourSlide = {
  id: string;
  eyebrow: string;
  title: string;
  lede: string;
  features: TourFeature[];
};

/** The copy deliberately describes what each page does today rather than what
 *  the roadmap says — an onboarding tour that oversells is worse than none,
 *  because the first click disproves it. */
const STUDENT_TOUR: TourSlide[] = [
  {
    id: 'learn',
    eyebrow: 'Step 1',
    title: 'Learn it',
    lede: 'Everything is generated against your exam board and specification — not generic revision content.',
    features: [
      {
        icon: BookOpen,
        title: 'Notes',
        body: 'Focused study notes for any topic in your spec, with checkpoint questions and a tutor chat alongside them.',
        href: '/dashboard/notes',
      },
      {
        icon: Headphones,
        title: 'Podcasts',
        body: 'A short AI-narrated audio episode for a topic, for the walk to school or the bus home.',
        href: '/dashboard/podcasts',
      },
      {
        icon: Layers,
        title: 'Flashcards',
        body: 'Turn what you just learned into a deck without writing every card out yourself.',
        href: '/dashboard/flashcards',
      },
    ],
  },
  {
    id: 'practise',
    eyebrow: 'Step 2',
    title: 'Practise it',
    lede: 'Answer real exam-style questions and get marked the way an examiner would mark you.',
    features: [
      {
        icon: Target,
        title: 'Smart Practice',
        body: 'Generate exam-board questions, answer them, then get marks against the mark scheme, a predicted grade, and targeted upgrade advice.',
        href: '/dashboard/ai-questions',
      },
      {
        icon: PenLine,
        title: 'Blurting',
        body: 'Brain-dump everything you know about a topic from memory, then get a breakdown of what you nailed and what you missed.',
        href: '/dashboard/blurt',
      },
      {
        icon: Compass,
        title: 'Exam Coach',
        body: 'The patterns in why you keep losing marks, drawn from every attempt you have marked so far.',
        href: '/dashboard/exam-coach',
      },
    ],
  },
  {
    id: 'paper',
    eyebrow: 'Step 3',
    title: 'Sit it on paper',
    lede: 'You will sit the real exam with a pen. This is the part most study apps skip.',
    features: [
      {
        icon: Printer,
        title: 'Print a paper',
        body: 'Generate a practice set and print it as a clean question paper, mark allocations and all.',
        href: '/dashboard/ai-questions',
      },
      {
        icon: Camera,
        title: 'Write it, then photograph it',
        body: 'Work through it by hand under timed conditions, then upload photos of your pages straight from your phone.',
      },
      {
        icon: ScanLine,
        title: 'Check the transcription, then get marked',
        body: 'AIDemic reads your handwriting and shows you what it read before anything is graded, so you can fix a misread word rather than lose the mark for it.',
      },
    ],
  },
  {
    id: 'review',
    eyebrow: 'Step 4',
    title: 'Come back to it',
    lede: 'Whatever you got wrong is scheduled to return before you forget it, so you never have to decide what to revise.',
    features: [
      {
        icon: ListChecks,
        title: 'Daily Review',
        body: 'One mixed queue: your due flashcards interleaved with quick questions targeting your recurring weak spots.',
        href: '/dashboard/daily-review',
      },
      {
        icon: Gauge,
        title: 'Topic Confidence',
        body: 'Rate each part of your specification red, amber or green. Your reds go to the front of the queue.',
        href: '/dashboard/confidence',
      },
      {
        icon: CalendarDays,
        title: 'Planner',
        body: 'A revision timetable weighted toward your weakest topics and your nearest exams.',
        href: '/dashboard/planner',
      },
    ],
  },
  {
    id: 'track',
    eyebrow: 'Step 5',
    title: 'Watch it move',
    lede: 'Every marked attempt feeds one picture of where you actually stand.',
    features: [
      {
        icon: Trophy,
        title: 'Predicted grades',
        body: 'A grade per subject on your qualification’s own scale, plus how much of the specification that grade actually rests on.',
        href: '/dashboard',
      },
      {
        icon: Users,
        title: 'My Classes',
        body: 'Join your teacher’s class with an invite code to receive and hand in assignments.',
        href: '/dashboard/classes',
      },
      {
        icon: UserPlus,
        title: 'Link a parent',
        body: 'Optional, and always your call: approve a request and they get a read-only view of your progress.',
        href: '/dashboard/family',
      },
    ],
  },
];

const TEACHER_TOUR: TourSlide[] = [
  {
    id: 'classes',
    eyebrow: 'Step 1',
    title: 'Set up your classes',
    lede: 'Classes are the unit everything else hangs off — assignments, reports and insights are all per class.',
    features: [
      {
        icon: Users,
        title: 'Classes',
        body: 'Create a class for each group you teach and share its invite code; students join themselves, so there is no roster to type up.',
        href: '/dashboard/teacher/classes',
      },
      {
        icon: BarChart3,
        title: 'One view per class',
        body: 'Completion rate, average score and roster size for every active class, on one page.',
        href: '/dashboard/teacher',
      },
    ],
  },
  {
    id: 'assignments',
    eyebrow: 'Step 2',
    title: 'Set work that marks itself',
    lede: 'Written answers, multiple choice, plots and labelled diagrams — all marked without you collecting a single book.',
    features: [
      {
        icon: ClipboardList,
        title: 'Assignments',
        body: 'Generate questions against the class specification or pull them from your question bank, then set a due date.',
        href: '/dashboard/teacher/assignments',
      },
      {
        icon: Layers,
        title: 'Question Bank',
        body: 'Keep the questions that worked and reuse them across classes and years.',
        href: '/dashboard/teacher/question-bank',
      },
    ],
  },
  {
    id: 'insight',
    eyebrow: 'Step 3',
    title: 'See who needs you',
    lede: 'The point of the marking is the diagnosis it produces, not the score.',
    features: [
      {
        icon: BarChart3,
        title: 'Reports',
        body: 'Per-class and per-student breakdowns, with the students falling behind surfaced rather than buried.',
        href: '/dashboard/teacher/reports',
      },
      {
        icon: Sparkles,
        title: 'AI Insights',
        body: 'The misconceptions your class shares, so the next lesson can target them instead of guessing.',
        href: '/dashboard/teacher/ai-insights',
      },
    ],
  },
];

const PARENT_TOUR: TourSlide[] = [
  {
    id: 'link',
    eyebrow: 'Step 1',
    title: 'Link your child’s account',
    lede: 'You send a request with their email or username; nothing is shared until they approve it from their own dashboard.',
    features: [
      {
        icon: UserPlus,
        title: 'Send a request',
        body: 'Enter your child’s email or username. They are notified straight away and choose whether to accept.',
        href: '/dashboard/parent',
      },
      {
        icon: Users,
        title: 'More than one child',
        body: 'Link as many as you need and switch between them from the dashboard.',
        href: '/dashboard/parent',
      },
    ],
  },
  {
    id: 'see',
    eyebrow: 'Step 2',
    title: 'What you will see',
    lede: 'A read-only view. You can follow the work; you can never change it, and nothing you do shows up in their account.',
    features: [
      {
        icon: TrendingUp,
        title: 'Progress',
        body: 'Predicted grades per subject, study streak, retention rate and the weak areas that keep recurring.',
        href: '/dashboard/parent/progress',
      },
      {
        icon: BookOpen,
        title: 'Subjects and activity',
        body: 'The qualifications they are studying and what they have actually worked on, day by day.',
        href: '/dashboard/parent/subjects',
      },
      {
        icon: ClipboardList,
        title: 'Assignments',
        body: 'What their teacher has set, what has been handed in and how it was marked.',
        href: '/dashboard/parent/assignments',
      },
    ],
  },
  {
    id: 'digest',
    eyebrow: 'Step 3',
    title: 'A summary every Monday',
    lede: 'You do not have to log in to keep up.',
    features: [
      {
        icon: CalendarDays,
        title: 'Weekly email digest',
        body: 'Each child’s streak, assignments completed, weakest topics and latest predicted grades, sent to you every Monday morning.',
      },
    ],
  },
];

export const TOURS: Record<OnboardingRole, TourSlide[]> = {
  student: STUDENT_TOUR,
  teacher: TEACHER_TOUR,
  parent: PARENT_TOUR,
};

/** Where "Get started" lands. Mirrors the `homeHref` the dashboard shell picks
 *  for the same role — a teacher dropped on `/dashboard` is bounced anyway. */
export function homeHrefForRole(role: OnboardingRole) {
  if (role === 'teacher') return '/dashboard/teacher';
  if (role === 'parent') return '/dashboard/parent';
  return '/dashboard';
}
