import { ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'subtle'
  | 'ghost'
  | 'danger'
  | 'danger-ghost'
  | 'plain'
  | 'default'
  | 'outline';

type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'chip' | 'none';

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

const baseStyles =
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-950';

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'border border-blue-600 bg-blue-600 text-white shadow-sm hover:border-blue-700 hover:bg-blue-700',
  secondary:
    'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  subtle:
    'border border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  ghost:
    'border border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
  danger: 'border border-red-600 bg-red-600 text-white shadow-sm hover:border-red-700 hover:bg-red-700',
  'danger-ghost':
    'border border-transparent bg-transparent text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/50 dark:hover:text-red-200',
  plain: '',
  default: 'border border-blue-600 bg-blue-600 text-white shadow-sm hover:border-blue-700 hover:bg-blue-700',
  outline:
    'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-1.5',
  md: 'min-h-10 px-4 py-2',
  lg: 'min-h-11 px-5 py-2.5',
  icon: 'h-9 w-9 p-0',
  chip: 'min-h-7 rounded-full px-3 py-1 text-xs',
  none: '',
};

export function buttonStyles({ variant = 'primary', size = 'md', className = '' }: ButtonStyleOptions = {}) {
  return [baseStyles, variantStyles[variant], sizeStyles[size], className].filter(Boolean).join(' ');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={buttonStyles({ variant, size, className })}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
