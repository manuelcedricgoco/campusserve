import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, FileCheck2, FileQuestion, SendHorizontal, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/components/ui/states';

interface Citation { index: number; title: string; source: string; isOfficial: boolean }
interface Msg { role: 'user' | 'assistant'; content: string; citations?: Citation[]; id?: string; failed?: boolean }
interface Reply { answer: string; citations: Citation[]; isMock: boolean; conversationId?: string; messageId?: string; sessionToken?: string }

const SESSION_KEY = 'campusserve.publicAssistant';

/** Chat with the CampusServe assistant. It answers from campus documents and cannot change any record. */
export function Assistant({ publicMode, initialConversation }: { publicMode?: boolean; initialConversation?: { id: string; messages: Msg[] } }) {
  const [messages, setMessages] = useState<Msg[]>(initialConversation?.messages ?? []);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversation?.id);
  const [text, setText] = useState('');
  const [isMock, setIsMock] = useState(false);
  const [rated, setRated] = useState<Record<string, number>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const send = useMutation({
    mutationFn: async (message: string) => {
      if (publicMode) {
        let token: string | undefined;
        try { token = sessionStorage.getItem(SESSION_KEY) ?? undefined; } catch { /* ignore */ }
        const r = await api.post<Reply>('/public/ai/chat', { message, sessionToken: token });
        try { if (r.sessionToken) sessionStorage.setItem(SESSION_KEY, r.sessionToken); } catch { /* ignore */ }
        return r;
      }
      return api.post<Reply>('/ai/chat', { message, conversationId });
    },
    onSuccess: (r) => {
      setIsMock(r.isMock);
      if (r.conversationId) { setConversationId(r.conversationId); void qc.invalidateQueries({ queryKey: ['ai-conversations'] }); }
      setMessages((m) => [...m, { role: 'assistant', content: r.answer, citations: r.citations, id: r.messageId }]);
    },
    onError: (e) => setMessages((m) => [...m, { role: 'assistant', content: errorMessage(e), failed: true }]),
  });

  const submit = () => {
    const m = text.trim();
    if (!m || send.isPending) return;
    setMessages((xs) => [...xs, { role: 'user', content: m }]);
    setText('');
    send.mutate(m);
  };

  const rate = async (id: string, rating: 1 | -1) => {
    try { await api.post(`/ai/messages/${id}/feedback`, { rating }); setRated((r) => ({ ...r, [id]: rating })); } catch { /* feedback is optional */ }
  };

  return (
    <div className="flex min-h-[60vh] flex-col rounded-2xl bg-white ring-1 ring-mist">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
        {messages.length === 0 && (
          <div className="max-w-[60ch] text-ink-soft">
            <Bot className="mb-3 h-7 w-7 text-lagoon" aria-hidden />
            <p className="font-semibold text-ink">Ask about campus services, requirements and procedures.</p>
            <p className="mt-1">Answers come from documents the university has added, with the source named. The assistant cannot approve, verify or change anything; the responsible office decides.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] rounded-2xl px-4 py-3', m.role === 'user' ? 'bg-lagoon text-white' : m.failed ? 'bg-danger-soft text-danger' : 'bg-paper ring-1 ring-mist')}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.citations && m.citations.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-mist pt-2 text-sm">
                  {m.citations.map((c) => (
                    <li key={c.index} className="flex items-center gap-1.5">
                      {c.isOfficial ? <FileCheck2 className="h-4 w-4 text-leaf" aria-hidden /> : <FileQuestion className="h-4 w-4 text-ink-faint" aria-hidden />}
                      <span>[{c.index}] {c.title}, {c.source}</span>
                      <span className="text-ink-faint">{c.isOfficial ? '(official document)' : '(not an official document)'}</span>
                    </li>
                  ))}
                </ul>
              )}
              {m.id && !publicMode && (
                <div className="mt-2 flex gap-1">
                  <Button variant="ghost" size="sm" aria-label="Helpful" aria-pressed={rated[m.id] === 1} onClick={() => rate(m.id!, 1)}><ThumbsUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" aria-label="Not helpful" aria-pressed={rated[m.id] === -1} onClick={() => rate(m.id!, -1)}><ThumbsDown className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          </div>
        ))}
        {send.isPending && <p className="text-sm text-ink-faint" role="status">Looking through campus documents…</p>}
        <div ref={endRef} />
      </div>
      {isMock && <p className="border-t border-mist bg-mango-soft px-4 py-2 text-sm text-mango-ink">Development assistant: answers quote the matching documents directly; no AI model is connected.</p>}
      <form className="flex items-end gap-2 border-t border-mist p-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label htmlFor="assistant-input" className="sr-only">Your question</label>
        <Textarea id="assistant-input" rows={1} className="min-h-[44px] resize-none" placeholder="Type a question" value={text} maxLength={publicMode ? 1000 : 2000}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
        <Button type="submit" size="icon" aria-label="Send" disabled={!text.trim()} loading={send.isPending}><SendHorizontal className="h-5 w-5" /></Button>
      </form>
    </div>
  );
}
