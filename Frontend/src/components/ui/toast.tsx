import * as T from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tone = 'success' | 'error' | 'info';
interface Item { id: number; title: string; body?: string; tone: Tone }
const Ctx = createContext<(t: Omit<Item, 'id'>) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const push = useCallback((t: Omit<Item, 'id'>) => setItems((xs) => [...xs.slice(-2), { ...t, id: Date.now() + Math.random() }]), []);
  return (
    <Ctx.Provider value={push}>
      <T.Provider swipeDirection="down" duration={5000}>
        {children}
        {items.map((t) => (
          <T.Root key={t.id} onOpenChange={(o) => !o && setItems((xs) => xs.filter((x) => x.id !== t.id))}
            className={cn('flex items-start gap-3 rounded-xl bg-ink p-4 text-white shadow-lift', t.tone === 'error' && 'bg-danger')}>
            {t.tone === 'error' ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-mango" aria-hidden />}
            <div className="flex-1">
              <T.Title className="font-semibold">{t.title}</T.Title>
              {t.body && <T.Description className="mt-0.5 text-sm text-white/85">{t.body}</T.Description>}
            </div>
            <T.Close aria-label="Dismiss"><X className="h-4 w-4" /></T.Close>
          </T.Root>
        ))}
        <T.Viewport className="fixed bottom-20 left-1/2 z-[60] flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0" />
      </T.Provider>
    </Ctx.Provider>
  );
}

export function useToast() {
  const push = useContext(Ctx);
  return {
    success: (title: string, body?: string) => push({ title, body, tone: 'success' }),
    error: (title: string, body?: string) => push({ title, body, tone: 'error' }),
    info: (title: string, body?: string) => push({ title, body, tone: 'info' }),
  };
}
