'use client';

import { useMemo, useRef, useState } from 'react';
import { Bold, Braces, Code, Italic, List, ListOrdered, Pilcrow, Underline } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  minHeightClassName?: string;
}

type FormatterAction = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  before: string;
  after?: string;
};

const ACTIONS: FormatterAction[] = [
  { icon: Bold, title: 'Bold', before: '<b>', after: '</b>' },
  { icon: Italic, title: 'Italic', before: '<i>', after: '</i>' },
  { icon: Underline, title: 'Underline', before: '<u>', after: '</u>' },
  { icon: Code, title: 'Code', before: '<code>', after: '</code>' },
  { icon: List, title: 'Bullet list', before: '\n<ul>\n  <li>', after: '</li>\n</ul>\n' },
  { icon: ListOrdered, title: 'Numbered list', before: '\n<ol>\n  <li>', after: '</li>\n</ol>\n' },
  { icon: Braces, title: 'Cloze', before: '{{c1::', after: '}}' },
  { icon: Pilcrow, title: 'Line break', before: '<br />' },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  label,
  minHeightClassName = 'min-h-[180px]',
}: RichTextEditorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const previewHtml = useMemo(() => {
    if (!value.trim()) {
      return '<p class="text-sm">Nothing to preview yet.</p>';
    }
    return value;
  }, [value]);

  const applyAction = (action: FormatterAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const replacement = `${action.before}${selected || ''}${action.after || ''}`;
    const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    onChange(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const caret = start + replacement.length;
      textarea.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_8px_24px_-16px_rgba(15,23,42,0.65)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_12px_28px_-16px_rgba(2,6,23,0.95)]">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-2">
          {label ? <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</p> : null}
          <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">
            Note
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowPreview((prev) => !prev)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {showPreview ? 'Edit' : 'Preview'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.title}
              type="button"
              title={action.title}
              onClick={() => applyAction(action)}
              className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {showPreview ? (
        <div
          className={`${minHeightClassName} prose prose-sm max-w-none px-3 py-3 text-slate-800 dark:text-slate-200`}
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder || 'Enter content...'}
          className={`${minHeightClassName} w-full resize-y border-0 bg-transparent px-3 py-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500`}
        />
      )}
    </div>
  );
}
