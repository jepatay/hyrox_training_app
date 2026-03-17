import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ensureConfigExists } from '../utils/firestoreUtils';
import NavBar from '../components/NavBar';

const TABS = ['Categories', 'Station Templates', 'Checklist'];

// ─── Categories Tab ────────────────────────────────────────────────────────
function CategoriesTab({ categories, onChange }) {
  function updateCat(idx, field, value) {
    const updated = categories.map((c, i) =>
      i === idx ? { ...c, [field]: value } : c
    );
    onChange(updated);
  }

  return (
    <div className="settings-section">
      <p className="settings-hint">
        Edit category labels and descriptions. Built-in categories cannot be deleted.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Label</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat, idx) => (
            <tr key={cat.id}>
              <td className="mono" style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{cat.id}</td>
              <td>
                <input
                  value={cat.label}
                  onChange={(e) => updateCat(idx, 'label', e.target.value)}
                  style={{ minWidth: '140px' }}
                />
              </td>
              <td>
                <span className="badge badge-outline">{cat.type}</span>
              </td>
              <td>
                <input
                  value={cat.description || ''}
                  onChange={(e) => updateCat(idx, 'description', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Station Templates Tab ──────────────────────────────────────────────────
function StationTemplatesTab({ templates, onChange }) {
  const [activeTemplate, setActiveTemplate] = useState(0);

  function addTemplate() {
    const newT = {
      id: `template_${Date.now()}`,
      label: 'New Template',
      stations: [],
    };
    onChange([...templates, newT]);
    setActiveTemplate(templates.length);
  }

  function deleteTemplate(idx) {
    if (!window.confirm('Delete this template?')) return;
    const updated = templates.filter((_, i) => i !== idx);
    onChange(updated);
    setActiveTemplate(Math.min(activeTemplate, updated.length - 1));
  }

  function updateTemplateLabel(idx, label) {
    onChange(templates.map((t, i) => (i === idx ? { ...t, label } : t)));
  }

  function addStation(tIdx) {
    const template = templates[tIdx];
    const maxOrder = template.stations.reduce((m, s) => Math.max(m, s.order), 0);
    const updated = templates.map((t, i) =>
      i === tIdx
        ? {
            ...t,
            stations: [
              ...t.stations,
              { order: maxOrder + 1, type: 'station', label: 'New Station', reps_or_distance: '' },
            ],
          }
        : t
    );
    onChange(updated);
  }

  function updateStation(tIdx, sIdx, field, value) {
    const updated = templates.map((t, i) => {
      if (i !== tIdx) return t;
      return {
        ...t,
        stations: t.stations.map((s, si) =>
          si === sIdx ? { ...s, [field]: value } : s
        ),
      };
    });
    onChange(updated);
  }

  function deleteStation(tIdx, sIdx) {
    const updated = templates.map((t, i) => {
      if (i !== tIdx) return t;
      return { ...t, stations: t.stations.filter((_, si) => si !== sIdx) };
    });
    onChange(updated);
  }

  function moveStation(tIdx, sIdx, dir) {
    const template = templates[tIdx];
    const stations = [...template.stations];
    const target = sIdx + dir;
    if (target < 0 || target >= stations.length) return;
    [stations[sIdx], stations[target]] = [stations[target], stations[sIdx]];
    const reordered = stations.map((s, i) => ({ ...s, order: i + 1 }));
    const updated = templates.map((t, i) =>
      i === tIdx ? { ...t, stations: reordered } : t
    );
    onChange(updated);
  }

  const current = templates[activeTemplate];

  return (
    <div className="settings-section">
      <div className="template-list">
        {templates.map((t, idx) => (
          <div key={t.id} className="flex items-center gap-8 mb-8">
            <button
              className={`template-tab-btn ${activeTemplate === idx ? 'active' : ''}`}
              onClick={() => setActiveTemplate(idx)}
            >
              {t.label}
            </button>
            <button
              className="btn-ghost"
              style={{ color: 'var(--danger)', fontSize: '0.75rem' }}
              onClick={() => deleteTemplate(idx)}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={addTemplate}>
          + Add Template
        </button>
      </div>

      {current && (
        <div className="template-editor">
          <div className="form-group" style={{ maxWidth: 300 }}>
            <label>Template Name</label>
            <input
              value={current.label}
              onChange={(e) => updateTemplateLabel(activeTemplate, e.target.value)}
            />
          </div>

          <table className="data-table" style={{ marginTop: '16px' }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Label</th>
                <th>Distance / Reps</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {current.stations.map((station, sIdx) => (
                <tr key={sIdx}>
                  <td className="mono" style={{ color: 'var(--text-dim)', fontSize: '0.8rem', width: 32 }}>
                    {station.order}
                  </td>
                  <td style={{ width: 110 }}>
                    <select
                      value={station.type}
                      onChange={(e) => updateStation(activeTemplate, sIdx, 'type', e.target.value)}
                    >
                      <option value="run">Run</option>
                      <option value="station">Station</option>
                    </select>
                  </td>
                  <td>
                    <input
                      value={station.label}
                      onChange={(e) => updateStation(activeTemplate, sIdx, 'label', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={station.reps_or_distance || ''}
                      onChange={(e) => updateStation(activeTemplate, sIdx, 'reps_or_distance', e.target.value)}
                      placeholder="e.g. 1000m"
                    />
                  </td>
                  <td>
                    <div className="flex gap-4">
                      <button className="btn-ghost" onClick={() => moveStation(activeTemplate, sIdx, -1)} disabled={sIdx === 0}>↑</button>
                      <button className="btn-ghost" onClick={() => moveStation(activeTemplate, sIdx, 1)} disabled={sIdx === current.stations.length - 1}>↓</button>
                      <button className="btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => deleteStation(activeTemplate, sIdx)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="btn-secondary"
            style={{ marginTop: '12px', padding: '5px 14px', fontSize: '0.82rem' }}
            onClick={() => addStation(activeTemplate)}
          >
            + Add Station
          </button>
        </div>
      )}

      <style>{`
        .template-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 20px;
          align-items: center;
        }
        .template-tab-btn {
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 5px 14px;
          font-size: 0.85rem;
          border-radius: var(--radius);
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .template-tab-btn.active {
          background: var(--yellow);
          color: #000;
          border-color: var(--yellow);
        }
      `}</style>
    </div>
  );
}

// ─── Checklist Tab ──────────────────────────────────────────────────────────
function ChecklistSettingsTab({ items, onChange }) {
  function addItem() {
    const maxOrder = items.reduce((m, i) => Math.max(m, i.order), 0);
    onChange([
      ...items,
      { id: `cl_${Date.now()}`, category: 'General', order: maxOrder + 1, text: 'New checklist item' },
    ]);
  }

  function updateItem(idx, field, value) {
    onChange(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  function deleteItem(idx) {
    const item = items[idx];
    if (!window.confirm(
      `Delete "${item.text}"?\n\nThis will remove it from all future events. Already saved event checklists are not affected.`
    )) return;
    onChange(items.filter((_, i) => i !== idx));
  }

  function moveItem(idx, dir) {
    const list = [...items];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    const reordered = list.map((item, i) => ({ ...item, order: i + 1 }));
    onChange(reordered);
  }

  return (
    <div className="settings-section">
      <p className="settings-hint">
        Manage the global checklist template. Changes apply to new events only.
        Deleting an item will not affect already-saved event checklists.
      </p>

      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th style={{ width: 140 }}>Category</th>
            <th>Item Text</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id}>
              <td className="mono" style={{ color: 'var(--text-dim)', fontSize: '0.8rem', width: 32 }}>
                {item.order}
              </td>
              <td>
                <input
                  value={item.category || ''}
                  onChange={(e) => updateItem(idx, 'category', e.target.value)}
                  placeholder="Category"
                />
              </td>
              <td>
                <input
                  value={item.text || ''}
                  onChange={(e) => updateItem(idx, 'text', e.target.value)}
                />
              </td>
              <td>
                <div className="flex gap-4">
                  <button className="btn-ghost" onClick={() => moveItem(idx, -1)} disabled={idx === 0}>↑</button>
                  <button className="btn-ghost" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1}>↓</button>
                  <button className="btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => deleteItem(idx)}>✕</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        className="btn-secondary"
        style={{ marginTop: '12px', padding: '5px 14px', fontSize: '0.82rem' }}
        onClick={addItem}
      >
        + Add Item
      </button>
    </div>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────────────
export default function Settings() {
  const [tab, setTab] = useState(0);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const cfg = await ensureConfigExists();
    setConfig(cfg);
    setLoading(false);
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'main'), config);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page-layout" style={{ flexDirection: 'column' }}>
        <NavBar />
        <div className="loading-screen" style={{ height: 'auto', flex: 1 }}>Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="page-layout" style={{ flexDirection: 'column' }}>
      <NavBar />
      <div className="page-content">
        <div className="page-header">
          <h1 className="page-title">Settings</h1>
          <div className="flex items-center gap-12">
            {savedMsg && (
              <span style={{ color: 'var(--success)', fontSize: '0.85rem', fontFamily: 'DM Mono, monospace' }}>
                Saved!
              </span>
            )}
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        <div className="tabs">
          {TABS.map((t, i) => (
            <button key={t} className={`tab-btn ${tab === i ? 'active' : ''}`} onClick={() => setTab(i)}>
              {t}
            </button>
          ))}
        </div>

        {tab === 0 && (
          <CategoriesTab
            categories={config.categories || []}
            onChange={(cats) => setConfig((prev) => ({ ...prev, categories: cats }))}
          />
        )}
        {tab === 1 && (
          <StationTemplatesTab
            templates={config.stationTemplates || []}
            onChange={(templates) => setConfig((prev) => ({ ...prev, stationTemplates: templates }))}
          />
        )}
        {tab === 2 && (
          <ChecklistSettingsTab
            items={config.checklistItems || []}
            onChange={(items) => setConfig((prev) => ({ ...prev, checklistItems: items }))}
          />
        )}
      </div>

      <style>{`
        .settings-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .settings-hint {
          font-size: 0.85rem;
          color: var(--text-muted);
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 14px;
        }
        .template-editor {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 16px;
        }
      `}</style>
    </div>
  );
}
