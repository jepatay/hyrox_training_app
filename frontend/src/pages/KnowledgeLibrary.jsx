import { useState, useEffect, useRef } from 'react';
import { knowledgeApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronRight, Pencil, Save, X, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

const TREE = [
  {
    id: 'running',
    label: 'Running',
    icon: '🏃',
    children: [
      { id: 'running__race_prep', label: 'Race Prep (5K, 10K, Half)' },
      { id: 'running__pace_zones', label: 'Pace Zones' },
      { id: 'running__key_sessions', label: 'Key Sessions' },
    ],
  },
  {
    id: 'hyrox_stations',
    label: 'HYROX Stations',
    icon: '🔥',
    children: [
      { id: 'hyrox__skierg', label: 'SkiErg' },
      { id: 'hyrox__sled_push', label: 'Sled Push' },
      { id: 'hyrox__sled_pull', label: 'Sled Pull' },
      { id: 'hyrox__burpee_broad_jump', label: 'Burpee Broad Jump' },
      { id: 'hyrox__rowing', label: 'Rowing' },
      { id: 'hyrox__farmers_carry', label: 'Farmers Carry' },
      { id: 'hyrox__sandbag_lunges', label: 'Sandbag Lunges' },
      { id: 'hyrox__wall_balls', label: 'Wall Balls' },
      { id: 'hyrox__running', label: 'Running (between stations)' },
    ],
  },
  {
    id: 'strength_conditioning',
    label: 'Strength & Conditioning',
    icon: '💪',
    children: [],
  },
  {
    id: 'recovery_mobility',
    label: 'Recovery & Mobility',
    icon: '🧘',
    children: [],
  },
  {
    id: 'race_strategy',
    label: 'Race Strategy & Notes',
    icon: '🏅',
    children: [],
  },
];

function renderMarkdown(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const html = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-muted px-1 rounded text-sm">$1</code>');

    if (/^### (.+)/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<h3 class="text-base font-semibold mt-4 mb-1">${line.replace(/^### /, '')}</h3>`);
    } else if (/^## (.+)/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<h2 class="text-lg font-bold mt-5 mb-2">${line.replace(/^## /, '')}</h2>`);
    } else if (/^# (.+)/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<h1 class="text-xl font-bold mt-5 mb-2">${line.replace(/^# /, '')}</h1>`);
    } else if (/^- (.+)/.test(line)) {
      if (!inList) { html.push('<ul class="list-disc pl-5 my-2 space-y-0.5">'); inList = true; }
      html.push(`<li>${line.replace(/^- /, '')}</li>`);
    } else if (/^\d+\. (.+)/.test(line)) {
      if (!inList) { html.push('<ol class="list-decimal pl-5 my-2 space-y-0.5">'); inList = true; }
      html.push(`<li>${line.replace(/^\d+\. /, '')}</li>`);
    } else {
      if (inList) { html.push('</ul>'); inList = false; }
      if (line.trim() === '') {
        html.push('<div class="h-2"></div>');
      } else {
        html.push(`<p class="leading-relaxed">${line}</p>`);
      }
    }
  }
  if (inList) html.push('</ul>');
  return html.join('\n');
}

export default function KnowledgeLibrary() {
  const [openCategories, setOpenCategories] = useState({ hyrox_stations: true });
  const [selected, setSelected] = useState(null); // { id, label }
  const [content, setContent] = useState('');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const textareaRef = useRef(null);

  function toggleCategory(id) {
    setOpenCategories(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function selectSection(node) {
    if (selected?.id === node.id) return;
    setSelected(node);
    setEditing(false);
    setLoading(true);
    try {
      const data = await knowledgeApi.get(node.id);
      setContent(data.content || '');
    } catch {
      toast({ title: 'Error', description: 'Failed to load section', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function startEdit() {
    setDraft(content);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft('');
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await knowledgeApi.save(selected.id, draft);
      setContent(draft);
      setEditing(false);
      toast({ title: 'Saved' });
    } catch {
      toast({ title: 'Error', description: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full gap-0 max-w-6xl -m-6 min-h-[calc(100vh-0px)]">
      {/* Sidebar tree */}
      <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col overflow-y-auto">
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Knowledge Library</span>
          </div>
        </div>
        <nav className="flex-1 py-2">
          {TREE.map(cat => (
            <div key={cat.id}>
              {/* Category row */}
              {cat.children.length > 0 ? (
                <button
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-secondary/50 transition-colors text-left"
                  onClick={() => toggleCategory(cat.id)}
                >
                  {openCategories[cat.id]
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  }
                  <span>{cat.icon}</span>
                  <span className="truncate">{cat.label}</span>
                </button>
              ) : (
                <button
                  className={cn(
                    'w-full flex items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-secondary/50 transition-colors text-left',
                    selected?.id === cat.id && 'bg-primary/10 text-primary border-r-2 border-primary'
                  )}
                  onClick={() => selectSection(cat)}
                >
                  <span className="w-3.5 shrink-0" />
                  <span>{cat.icon}</span>
                  <span className="truncate">{cat.label}</span>
                </button>
              )}

              {/* Children */}
              {cat.children.length > 0 && openCategories[cat.id] && (
                <div className="ml-4 border-l border-border/60">
                  {cat.children.map(child => (
                    <button
                      key={child.id}
                      className={cn(
                        'w-full flex items-center gap-2 pl-4 pr-3 py-1.5 text-sm hover:bg-secondary/50 transition-colors text-left',
                        selected?.id === child.id
                          ? 'bg-primary/10 text-primary border-r-2 border-primary font-medium'
                          : 'text-muted-foreground'
                      )}
                      onClick={() => selectSection(child)}
                    >
                      <span className="truncate">{child.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* Content pane */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <BookOpen className="h-12 w-12 opacity-30" />
            <p className="text-sm">Select a section from the left to start</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
              <h2 className="font-semibold">{selected.label}</h2>
              <div className="flex gap-2">
                {editing ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={cancelEdit} className="gap-1.5">
                      <X className="h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button size="sm" onClick={saveEdit} disabled={saving} className="gap-1.5">
                      <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save'}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : editing ? (
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder={`Write your notes for "${selected.label}"...\n\nSupports markdown:\n# Heading 1\n## Heading 2\n**bold**  *italic*\n- bullet list\n1. numbered list`}
                  className="w-full h-full min-h-[60vh] bg-transparent border border-border rounded-lg p-4 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
              ) : content ? (
                <div
                  className="prose prose-sm max-w-none text-foreground text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                  <p className="text-sm">No notes yet for <strong>{selected.label}</strong></p>
                  <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Start writing
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
