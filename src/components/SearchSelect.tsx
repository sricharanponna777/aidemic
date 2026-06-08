'use client';

import { useId, useMemo, useState } from 'react';

type SearchSelectOption = {
  value: string;
  label: string;
};

type SearchSelectProps = {
  label: string;
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

export function SearchSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Search...',
  className = 'block text-sm font-medium text-slate-700 dark:text-slate-300',
  inputClassName = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100',
}: SearchSelectProps) {
  const inputId = useId();
  const [isFocused, setIsFocused] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? '';
  const [query, setQuery] = useState('');
  const inputValue = isFocused ? query : selectedLabel;

  const visibleOptions = useMemo(() => {
    const cleanQuery = inputValue.trim().toLowerCase();
    if (!cleanQuery) return options.slice(0, 5);
    return options
      .filter((option) => option.label.toLowerCase().includes(cleanQuery))
      .sort((a, b) => {
        const aStarts = a.label.toLowerCase().startsWith(cleanQuery);
        const bStarts = b.label.toLowerCase().startsWith(cleanQuery);
        if (aStarts === bStarts) return a.label.localeCompare(b.label);
        return aStarts ? -1 : 1;
      })
      .slice(0, 5);
  }, [inputValue, options]);

  return (
    <div className={className}>
      <label htmlFor={inputId}>{label}</label>
      <div className="relative">
        <input
          id={inputId}
          value={inputValue}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            setIsFocused(true);
            setQuery('');
          }}
          onBlur={() => {
            setIsFocused(false);
            setQuery(selectedLabel);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={`${inputClassName} ${isFocused && visibleOptions.length > 0 ? 'rounded-b-none' : ''}`}
        />
        {isFocused && visibleOptions.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-40 overflow-hidden rounded-b-lg border border-t-0 border-slate-300 bg-white shadow-lg shadow-slate-900/10 dark:border-slate-600 dark:bg-[#0A0F1E] dark:shadow-black/30">
            {visibleOptions.map((option) => (
              <button
                key={`${option.value}-${option.label}`}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option.value);
                  setQuery(option.label);
                  setIsFocused(false);
                }}
                className="flex w-full items-center px-3 py-2 text-left text-sm font-normal text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/8"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
