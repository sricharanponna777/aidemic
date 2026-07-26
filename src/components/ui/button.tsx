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
  'inline-flex items-center justify-center gap-2 rounded-control text-body font-semibold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.97]';

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'border border-transparent bg-accent text-accent-fg shadow-card hover:bg-accent-hover hover:shadow-raised',
  secondary:
    'border border-subtle bg-surface text-content-muted shadow-card hover:bg-surface-sunken hover:border-strong hover:text-content',
  subtle:
    'border border-transparent bg-surface-sunken text-content-muted hover:bg-accent-muted hover:text-content',
  ghost:
    'border border-transparent bg-transparent text-content-muted hover:bg-surface-sunken hover:text-content',
  danger:
    'border border-transparent bg-danger text-white shadow-card hover:brightness-110 hover:shadow-raised',
  'danger-ghost':
    'border border-transparent bg-transparent text-danger hover:bg-danger-muted',
  plain: '',
  default:
    'border border-transparent bg-accent text-accent-fg shadow-card hover:bg-accent-hover hover:shadow-raised',
  outline:
    'border border-strong bg-accent-muted text-accent shadow-card hover:bg-accent hover:text-accent-fg hover:border-transparent',
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
