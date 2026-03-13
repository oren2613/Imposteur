import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  fullWidth?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-violet-600 hover:bg-violet-700 text-white shadow-md hover:shadow-lg dark:bg-violet-500 dark:hover:bg-violet-600',
  secondary:
    'bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100',
  danger:
    'bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-500 dark:hover:bg-rose-600',
  ghost:
    'bg-transparent hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200',
};

const sizes = {
  sm: 'py-2 px-4 text-sm rounded-xl',
  md: 'py-3 px-6 text-base rounded-2xl',
  lg: 'py-4 px-8 text-lg rounded-2xl font-medium',
};

export function Button({
  variant = 'primary',
  size = 'lg',
  fullWidth,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`
        inline-flex items-center justify-center gap-2
        transition-all duration-200 active:scale-[0.98]
        disabled:opacity-50 disabled:pointer-events-none
        ${variants[variant]} ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={disabled}
      {...props}
    />
  );
}
