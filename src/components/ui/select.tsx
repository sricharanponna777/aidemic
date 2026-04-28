'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type SelectStyle = 'inline' | 'stacked';

type SelectContextValue<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  registerItem: (value: T, label: string) => void;
  items: Record<T, string>;
};

const SelectContext = createContext<SelectContextValue<string> | null>(null);

interface SelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  children: ReactNode;
  className?: string;
  styleType?: SelectStyle;
}

export function Select<T extends string>({
  value,
  onValueChange,
  children,
  className = '',
  styleType = 'inline',
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Record<T, string>>({} as Record<T, string>);

  const registerItem = useCallback((itemValue: T, label: string) => {
    setItems((current) => ({ ...current, [itemValue]: label }));
  }, []);

  const contextValue = useMemo(
    () => ({ value, onValueChange, open, setOpen, registerItem, items }) as unknown as SelectContextValue<string>,
    [value, onValueChange, open, registerItem, items]
  );

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <div className={`${styleType === 'inline' ? 'relative inline-block' : 'relative w-full'} ${className}`.trim()}>
      <SelectContext.Provider value={contextValue}>{children}</SelectContext.Provider>
    </div>
  );
}

interface SelectTriggerProps {
  children: ReactNode;
  className?: string;
}

export function SelectTrigger({ children, className = '' }: SelectTriggerProps) {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error('SelectTrigger must be used within a Select');
  }

  return (
    <button
      type="button"
      onClick={() => context.setOpen(!context.open)}
      className={`flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${className}`.trim()}
    >
      {children}
      <span className="ml-2 text-slate-400">▼</span>
    </button>
  );
}

interface SelectValueProps {
  placeholder?: string;
  className?: string;
}

export function SelectValue({ placeholder = 'Select', className = '' }: SelectValueProps) {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error('SelectValue must be used within a Select');
  }

  const label = context.items[context.value] || placeholder;

  return <span className={`text-left text-sm ${className}`.trim()}>{label}</span>;
}

interface SelectContentProps {
  children: ReactNode;
  className?: string;
}

export function SelectContent({ children, className = '' }: SelectContentProps) {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error('SelectContent must be used within a Select');
  }

  if (!context.open) {
    return null;
  }

  return (
    <div className={`absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-950 ${className}`.trim()}>
      <div className="py-1">{children}</div>
    </div>
  );
}

interface SelectItemProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function SelectItem({ value, children, className = '' }: SelectItemProps) {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error('SelectItem must be used within a Select');
  }

  const { registerItem } = context;

  useEffect(() => {
    const label = typeof children === 'string' ? children : '';
    if (label) {
      registerItem(value, label);
    }
  }, [registerItem, value, children]);

  return (
    <button
      type="button"
      onClick={() => {
        context.onValueChange(value);
        context.setOpen(false);
      }}
      className={`w-full px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800 ${className}`.trim()}
    >
      {children}
    </button>
  );
}
