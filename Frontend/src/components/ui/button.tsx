import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const button = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        primary: 'bg-lagoon text-white hover:bg-lagoon-700 active:bg-lagoon-800',
        secondary: 'bg-white text-ink ring-1 ring-inset ring-mist-strong hover:bg-lagoon-50',
        ghost: 'text-ink hover:bg-lagoon-50',
        attention: 'bg-mango text-ink hover:brightness-95',
        danger: 'bg-danger text-white hover:brightness-110',
        link: 'text-lagoon underline-offset-4 hover:underline px-0 h-auto',
      },
      size: { sm: 'h-8 rounded-md px-3 text-sm', md: 'h-10 rounded-lg px-4 text-[0.95rem]', lg: 'h-12 rounded-lg px-6 text-base', icon: 'h-10 w-10 rounded-lg' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp ref={ref} className={cn(button({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? children : <>{loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}</>}
    </Comp>
  );
});
Button.displayName = 'Button';
