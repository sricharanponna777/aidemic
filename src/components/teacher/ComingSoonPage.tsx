type ComingSoonSection = { title: string; description?: string };

export function ComingSoonPage({
  title,
  description,
  sections,
}: {
  title: string;
  description: string;
  sections: ComingSoonSection[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <div
            key={section.title}
            className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/3"
          >
            <h3 className="font-semibold text-slate-700 dark:text-slate-300">{section.title}</h3>
            {section.description && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{section.description}</p>
            )}
            <span className="mt-3 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">
              Coming soon
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
