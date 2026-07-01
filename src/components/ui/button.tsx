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
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-[#0A0F1E] active:scale-[0.97]';

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'border border-transparent bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-purple-700 hover:shadow-lg hover:shadow-indigo-500/40 dark:hover:shadow-indigo-500/60',
  secondary:
    'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:border-white/15',
  subtle:
    'border border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/8 dark:text-slate-200 dark:hover:bg-white/12',
  ghost:
    'border border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-white',
  danger:
    'border border-red-600 bg-red-600 text-white shadow-sm hover:bg-red-700 hover:border-red-700',
  'danger-ghost':
    'border border-transparent bg-transparent text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300',
  plain: '',
  default:
    'border border-transparent bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-purple-700',
  outline:
    'border border-indigo-200 bg-white text-indigo-700 shadow-sm hover:bg-indigo-50 hover:border-indigo-300 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20 dark:hover:border-indigo-500/40',
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
