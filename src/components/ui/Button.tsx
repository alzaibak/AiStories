import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'quiet';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'group/button inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent font-semibold transition-[background-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-brand-on shadow-soft hover:bg-brand-strong hover:shadow-glow focus-visible:shadow-glow',
  gold:
    'bg-gold text-[#2a1e07] shadow-soft hover:brightness-[1.04] hover:shadow-lift focus-visible:shadow-lift',
  secondary:
    'border-line-strong bg-surface text-ink hover:bg-surface-soft hover:border-brand/40',
  ghost: 'text-brand-ink hover:bg-brand-soft',
  quiet: 'text-ink-muted hover:bg-surface-soft hover:text-ink'
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-[0.8125rem]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-[3.25rem] px-7 text-base'
};

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block = false,
  className = ''
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}) {
  return [base, variants[variant], sizes[size], block ? 'w-full' : '', className]
    .filter(Boolean)
    .join(' ');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    block = false,
    loading = false,
    leadingIcon,
    trailingIcon,
    className = '',
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, className })}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
        />
      ) : (
        leadingIcon
      )}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});
