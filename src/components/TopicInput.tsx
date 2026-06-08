'use client';

import { useId, useMemo, useState } from 'react';

type TopicInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  isValidSelection?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

export function TopicInput({
  label,
  value,
  onChange,
  suggestions,
  isValidSelection = true,
  placeholder,
  className = 'block text-sm font-medium text-slate-700 dark:text-slate-300',
  inputClassName = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100',
}: TopicInputProps) {
  const inputId = useId();
  const [isFocused, setIsFocused] = useState(false);
  const visibleSuggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    const uniqueSuggestions = Array.from(new Set(suggestions.filter(Boolean)));
    if (!query) return uniqueSuggestions.slice(0, 5);

    return uniqueSuggestions
      .filter((topic) => topic.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(query);
        const bStarts = b.toLowerCase().startsWith(query);
        if (aStarts === bStarts) return a.localeCompare(b);
        return aStarts ? -1 : 1;
      })
      .slice(0, 5);
  }, [suggestions, value]);

  return (
    <div className={className}>
      <label htmlFor={inputId}>{label}</label>
      <div className="relative">
        <input
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className={`${inputClassName} ${isFocused && visibleSuggestions.length > 0 ? 'rounded-b-none' : ''} ${
            value.trim() && !isValidSelection ? 'border-amber-400 focus:border-amber-500 dark:border-amber-500' : ''
          }`}
        />
        {isFocused && visibleSuggestions.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-30 overflow-hidden rounded-b-lg border border-t-0 border-slate-300 bg-white shadow-lg shadow-slate-900/10 dark:border-slate-600 dark:bg-[#0A0F1E] dark:shadow-black/30">
            {visibleSuggestions.map((topic) => (
              <button
                key={topic}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(topic);
                  setIsFocused(false);
                }}
                className="flex w-full items-center px-3 py-2 text-left text-sm font-normal text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/8"
              >
                {topic}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
