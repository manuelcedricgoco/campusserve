import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const base = 'w-full rounded-lg border border-mist-strong bg-white px-3 text-[0.95rem] text-ink placeholder:text-ink-faint focus:border-lagoon focus:outline-none focus:ring-2 focus:ring-lagoon/25 disabled:bg-paper disabled:text-ink-faint aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(base, 'h-10', className)} {...p} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-[96px] py-2', className)} {...p} />
));
Textarea.displayName = 'Textarea';

/** Native select: accessible and reliable on low-end phones. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(base, 'h-10 pr-8', className)} {...p}>{children}</select>
));
Select.displayName = 'Select';
