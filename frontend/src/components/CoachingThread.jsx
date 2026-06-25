import { useState } from 'react';
import { coachingApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { parseMarkdown } from '@/lib/utils';

function AiBubble({ children }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] bg-orange-500/10 border border-orange-500/30 rounded-2xl rounded-tl-sm px-4 py-3">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{children}</p>
      </div>
    </div>
  );
}

function UserBubble({ children }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[90%] bg-zinc-800 border border-zinc-700 rounded-2xl rounded-tr-sm px-4 py-3">
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-100">{children}</p>
      </div>
    </div>
  );
}

export default function CoachingThread({ session, onUpdate }) {
  const thread = session.coachingThread;
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(thread?.status === 'complete');

  if (!thread?.initialMessage) return null;

  async function handleSubmitReply() {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      const { coachingThread } = await coachingApi.reply(session.id, replyText.trim());
      onUpdate(session.id, coachingThread);
      setCollapsed(true);
    } catch {
      // leave reply box as-is so user can retry
    } finally {
      setSubmitting(false);
    }
  }

  const isComplete = thread.status === 'complete';

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">Coaching Feedback</span>
          {isComplete && (
            <Badge variant="outline" className="text-[10px] gap-1 border-green-500/40 text-green-400">
              <CheckCircle2 className="h-3 w-3" /> Complete
            </Badge>
          )}
        </div>
        {isComplete && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? <>Show thread <ChevronDown className="h-3 w-3" /></> : <>Hide thread <ChevronUp className="h-3 w-3" /></>}
          </Button>
        )}
      </div>

      {isComplete && collapsed ? (
        <div className="border-2 border-primary/40 rounded-lg p-3 bg-background/40">
          <Badge className="text-[10px] mb-2">Final Coaching Note</Badge>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{thread.finalNote}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AiBubble>{thread.initialMessage}</AiBubble>

          {thread.userReply && <UserBubble>{thread.userReply}</UserBubble>}

          {thread.finalNote && (
            <div className="flex justify-start">
              <div className="max-w-[90%] border-2 border-primary/40 rounded-lg p-3 bg-background/40">
                <Badge className="text-[10px] mb-2">Final Coaching Note</Badge>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{thread.finalNote}</p>
              </div>
            </div>
          )}

          {!isComplete && (
            <div className="flex gap-2 items-end pt-1">
              <Textarea
                placeholder="Reply with more context (e.g. how it felt, load used, fatigue)..."
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                rows={2}
                className="flex-1"
              />
              <Button size="sm" onClick={handleSubmitReply} disabled={submitting || !replyText.trim()}>
                {submitting ? 'Sending...' : 'Send'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
