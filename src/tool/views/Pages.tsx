import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Download,
  GripVertical,
  LayoutTemplate,
  MoreHorizontal,
  MoveDiagonal2,
  Plus,
  Shrink,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { SIG, SIGNALS, GROUPS } from '../data/signals';
import { sim } from '../sim/engine';
import { usePrefs, useSim } from '../sim/hooks';
import { useActions } from '../actions';
import { Dialog } from '../ui/common';
import { CATALOG, DECODABLE, WidgetBody, widgetTitle, type CheckItem, type WType, type Widget } from './widgets';
import { hexId } from '../ui/common';

interface Page {
  id: string;
  name: string;
  widgets: Widget[];
}
interface State {
  pages: Page[];
  active: string;
}

type Spec = Omit<Widget, 'id'>;
const W = (type: WType, w: Widget['w'], h: Widget['h'], extra: Partial<Spec> = {}): Spec => ({ type, w, h, ...extra });

const PDI: CheckItem[] = [
  { t: 'Tire pressures set to 32 psi cold (door placard)', done: false },
  { t: 'Wheel nuts torqued to 76 ft·lbf', done: false },
  { t: 'Oil level checked; maintenance reminder reset', done: false },
  { t: 'Start engine: every warning lamp goes out', done: false },
  { t: 'Final health check: no codes stored', done: false },
  { t: 'Driver floor mat secured', done: false },
  { t: 'Seat and wheel covers removed', done: false },
];
const BATT: CheckItem[] = [
  { t: 'Battery voltage, ignition off (11–14 V)', done: false },
  { t: 'Battery tester result recorded', done: false },
  { t: 'Crank capture minimum above 9.5 V', done: false },
  { t: 'Charging voltage with the engine running', done: false },
  { t: 'ABS and slip lamps go out', done: false },
];
const AC: CheckItem[] = [
  { t: 'Engine idling, A/C on max, recirculation', done: false },
  { t: 'Doors open, blower on high', done: false },
  { t: 'Probe in the center vent', done: false },
  { t: 'Record high-side pressure and vent temperature', done: false },
];

export const TEMPLATES: { id: string; name: string; desc: string; widgets: Spec[] }[] = [
  {
    id: 'quick',
    name: 'Quick health',
    desc: 'Lamps, codes, module status and the basics — a first look at any car.',
    widgets: [
      W('lamps', 2, 1),
      W('dtcs', 2, 1),
      W('ecus', 2, 2),
      W('value', 1, 1, { sig: 'vbat' }),
      W('value', 1, 1, { sig: 'ect' }),
      W('bus', 2, 1),
    ],
  },
  {
    id: 'engine',
    name: 'Engine performance',
    desc: 'Speed, load, airflow, fuel trims and misfire margin.',
    widgets: [
      W('gauge', 1, 1, { sig: 'rpm' }),
      W('gauge', 1, 1, { sig: 'load' }),
      W('gauge', 1, 1, { sig: 'ect' }),
      W('value', 1, 1, { sig: 'maf' }),
      W('trend', 4, 1, { sigs: ['rpm', 'load'] }),
      W('value', 1, 1, { sig: 'mfm' }),
      W('value', 1, 1, { sig: 'stft' }),
      W('value', 1, 1, { sig: 'ltft' }),
      W('value', 1, 1, { sig: 'timing' }),
    ],
  },
  {
    id: 'brakes',
    name: 'Brakes & ABS',
    desc: 'Wheel speeds, the brake switch and the skid control ECU’s frames.',
    widgets: [
      W('wheels', 2, 1),
      W('lamps', 2, 1),
      W('value', 1, 1, { sig: 'vss' }),
      W('value', 1, 1, { sig: 'brake' }),
      W('frame', 2, 1, { frame: 0x0aa }),
      W('trend', 4, 1, { sigs: ['wsFL', 'wsFR', 'vss'] }),
    ],
  },
  {
    id: 'ac',
    name: 'A/C performance',
    desc: 'High-side pressure, evaporator and vent temperatures, with a test checklist.',
    widgets: [
      W('value', 1, 1, { sig: 'acp' }),
      W('value', 1, 1, { sig: 'vent' }),
      W('value', 1, 1, { sig: 'evap' }),
      W('value', 1, 1, { sig: 'comp' }),
      W('trend', 4, 1, { sigs: ['vent', 'evap', 'amb'] }),
      W('checklist', 2, 1, { items: AC }),
      W('notes', 2, 1),
    ],
  },
  {
    id: 'can',
    name: 'CAN health',
    desc: 'Adapter link, bus load, module answers and live frames.',
    widgets: [W('bus', 2, 1), W('ecus', 2, 2), W('dtcs', 2, 1), W('frame', 2, 1, { frame: 0x1c4 }), W('frame', 2, 1, { frame: 0x0b4 })],
  },
  {
    id: 'battery',
    name: 'No-crank / battery',
    desc: 'Battery voltage, the crank capture and the battery test steps.',
    widgets: [
      W('crank', 3, 2),
      W('value', 1, 1, { sig: 'vbat' }),
      W('value', 1, 1, { sig: 'modv' }),
      W('checklist', 2, 1, { items: BATT }),
      W('notes', 2, 1),
    ],
  },
  {
    id: 'pdi',
    name: 'Pre-delivery inspection',
    desc: 'Final checklist, tire pressures and lamps before the customer picks up.',
    widgets: [W('checklist', 2, 2, { items: PDI }), W('tires', 2, 1), W('lamps', 2, 1), W('notes', 4, 1)],
  },
  {
    id: 'shop',
    name: 'Shop overview',
    desc: 'Every connected car with its status and Wi-Fi link.',
    widgets: [W('fleet', 4, 2), W('bus', 2, 1), W('dtcs', 2, 1)],
  },
];

let seq = 0;
const nextId = (p: string) => `${p}${(++seq).toString(36)}`;
const fromTemplate = (t: (typeof TEMPLATES)[number], name?: string): Page => {
  const id = nextId('pg');
  return {
    id,
    name: name ?? t.name,
    widgets: t.widgets.map((s) => ({ ...s, items: s.items?.map((i) => ({ ...i })), id: nextId(`${id}-w`) })),
  };
};

// Session-only memory: pages survive switching views but never touch browser storage.
let SAVED: State | null = null;
function initialState(): State {
  if (SAVED) return SAVED;
  const pages = [fromTemplate(TEMPLATES[0]), fromTemplate(TEMPLATES[1]), fromTemplate(TEMPLATES[7])];
  return { pages, active: pages[0].id };
}

export function Pages({ vid }: { vid: string }) {
  useSim(4);
  const { reduced } = usePrefs();
  const { toast, confirm } = useActions();
  const [state, setState] = useState<State>(initialState);
  useEffect(() => {
    SAVED = state;
  }, [state]);
  const page = state.pages.find((p) => p.id === state.active) ?? state.pages[0];
  const [menu, setMenu] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [templates, setTemplates] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rt = sim.byId[vid];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const updatePage = (fn: (p: Page) => Page) => setState((s) => ({ ...s, pages: s.pages.map((p) => (p.id === page.id ? fn(p) : p)) }));
  const updateWidget = (id: string, patch: Partial<Widget>) =>
    updatePage((p) => ({ ...p, widgets: p.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
  const move = (id: string, d: -1 | 1) =>
    updatePage((p) => {
      const i = p.widgets.findIndex((w) => w.id === id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= p.widgets.length) return p;
      return { ...p, widgets: arrayMove(p.widgets, i, j) };
    });
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    updatePage((p) => {
      const a = p.widgets.findIndex((w) => w.id === active.id);
      const b = p.widgets.findIndex((w) => w.id === over.id);
      return a < 0 || b < 0 ? p : { ...p, widgets: arrayMove(p.widgets, a, b) };
    });
  };

  const addPage = (t?: (typeof TEMPLATES)[number]) => {
    const p = t ? fromTemplate(t) : { id: nextId('pg'), name: `Page ${state.pages.length + 1}`, widgets: [] };
    setState((s) => ({ pages: [...s.pages, p], active: p.id }));
    setTemplates(false);
    toast(t ? `Added “${t.name}”` : 'Added a blank page');
  };
  const removePage = (id: string) => {
    const p = state.pages.find((x) => x.id === id);
    if (!p) return;
    confirm({
      title: `Remove “${p.name}”?`,
      body: <p>The page and its widgets are removed for this session. Export first if you want to keep a copy.</p>,
      confirm: 'Remove page',
      tone: 'danger',
      onConfirm: () =>
        setState((s) => {
          const pages = s.pages.filter((x) => x.id !== id);
          return { pages, active: s.active === id ? (pages[0]?.id ?? '') : s.active };
        }),
    });
  };

  const exportPages = () => {
    const data = {
      format: 'corolla-service-console/pages',
      version: 1,
      exported: new Date().toISOString(),
      pages: state.pages.map((p) => ({ name: p.name, widgets: p.widgets.map(({ id: _id, ...rest }) => rest) })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'service-pages.json';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Exported ${state.pages.length} page${state.pages.length === 1 ? '' : 's'} as JSON`);
  };

  const importPages = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const pages = parsePages(json);
      if (!pages.length) throw new Error('no pages');
      setState((s) => ({ pages: [...s.pages, ...pages], active: pages[0].id }));
      toast(`Imported ${pages.length} page${pages.length === 1 ? '' : 's'}`);
    } catch {
      toast('That file is not a service-page export');
    }
  };

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && (e.target as HTMLElement).closest('.st-wmenu')) return;
      setMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  return (
    <div className="st-pages">
      <header className="st-viewhead">
        <div>
          <h2>Service pages</h2>
          <p className="st-lede">
            Build the screen you want for {rt.v.slot}. Drag widgets by their handle, resize them from the menu, or start from a template.
            Pages last for this session; export them to share with another technician.
          </p>
        </div>
        <div className="st-viewhead__actions">
          <button className="st-btn" onClick={() => setTemplates(true)} data-testid="pages-templates">
            <LayoutTemplate size={16} aria-hidden="true" /> Templates
          </button>
          <button className="st-btn" onClick={exportPages} data-testid="pages-export">
            <Download size={16} aria-hidden="true" /> Export
          </button>
          <button className="st-btn" onClick={() => fileRef.current?.click()} data-testid="pages-import">
            <Upload size={16} aria-hidden="true" /> Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="st-sr"
            onChange={importPages}
            tabIndex={-1}
            aria-hidden="true"
            data-testid="pages-import-input"
          />
        </div>
      </header>

      <div className="st-pagebar">
        <div className="st-tabs" role="tablist" aria-label="Service pages">
          {state.pages.map((p) => (
            <div key={p.id} className={`st-tab${p.id === page?.id ? ' is-on' : ''}`}>
              <button
                role="tab"
                aria-selected={p.id === page?.id}
                onClick={() => setState((s) => ({ ...s, active: p.id }))}
                data-testid={`page-tab-${p.id}`}
              >
                {p.name}
              </button>
              {state.pages.length > 1 && (
                <button
                  className="st-tab__x"
                  aria-label={`Remove page ${p.name}`}
                  onClick={() => removePage(p.id)}
                  data-testid={`page-remove-${p.id}`}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <button className="st-tab-add" onClick={() => addPage()} aria-label="Add a blank page" data-testid="page-add">
            <Plus size={16} />
          </button>
        </div>
      </div>

      {page ? (
        <>
          <div className="st-pagetools">
            <label className="st-pagename">
              <span className="st-sr">Page name</span>
              <input
                value={page.name}
                onChange={(e) => updatePage((p) => ({ ...p, name: e.target.value.slice(0, 40) }))}
                data-testid="page-name"
              />
            </label>
            <span className="muted">
              {page.widgets.length} widget{page.widgets.length === 1 ? '' : 's'} · showing {rt.v.slot}
            </span>
            <button className="st-btn st-btn--primary" onClick={() => setAdding(true)} data-testid="widget-add">
              <Plus size={16} aria-hidden="true" /> Add widget
            </button>
          </div>
          {page.widgets.length ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={page.widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
                <div className="st-wgrid" data-testid="widget-grid">
                  {page.widgets.map((w, i) => (
                    <Tile
                      key={w.id}
                      w={w}
                      vid={vid}
                      reduced={reduced}
                      first={i === 0}
                      last={i === page.widgets.length - 1}
                      menuOpen={menu === w.id}
                      onMenu={() => setMenu((m) => (m === w.id ? null : w.id))}
                      onChange={(patch) => updateWidget(w.id, patch)}
                      onMove={(d) => move(w.id, d)}
                      onRemove={() => {
                        setMenu(null);
                        updatePage((p) => ({ ...p, widgets: p.widgets.filter((x) => x.id !== w.id) }));
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="st-empty st-empty--page">
              <p className="st-empty__title">This page is empty</p>
              <div className="st-empty__body">
                <p>Add widgets one at a time, or replace the page with a template.</p>
                <div className="st-empty__btns">
                  <button className="st-btn st-btn--primary" onClick={() => setAdding(true)} data-testid="empty-add">
                    <Plus size={16} aria-hidden="true" /> Add widget
                  </button>
                  <button className="st-btn" onClick={() => setTemplates(true)} data-testid="empty-templates">
                    <LayoutTemplate size={16} aria-hidden="true" /> Browse templates
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="st-empty st-empty--page">
          <p className="st-empty__title">No pages</p>
          <button className="st-btn st-btn--primary" onClick={() => setTemplates(true)} data-testid="nopage-templates">
            Start from a template
          </button>
        </div>
      )}

      <AddWidget
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(spec) => {
          updatePage((p) => ({ ...p, widgets: [...p.widgets, { ...spec, id: nextId(`${p.id}-w`) }] }));
          setAdding(false);
          toast(`Added ${CATALOG[spec.type].name.toLowerCase()}`);
        }}
      />
      <Dialog open={templates} title="Page templates" onClose={() => setTemplates(false)} testId="templates" wide>
        <p className="muted">Each template opens as a new page you can rearrange. Widgets always show the vehicle in the current tab.</p>
        <ul className="st-tpls">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <button className="st-tpl" onClick={() => addPage(t)} data-testid={`tpl-${t.id}`}>
                <TplPreview t={t} />
                <b>{t.name}</b>
                <span>{t.desc}</span>
                <small>
                  {t.widgets.length} widgets <ArrowDownToLine size={12} aria-hidden="true" />
                </small>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

function Tile({
  w,
  vid,
  reduced,
  first,
  last,
  menuOpen,
  onMenu,
  onChange,
  onMove,
  onRemove,
}: {
  w: Widget;
  vid: string;
  reduced: boolean;
  first: boolean;
  last: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onChange: (p: Partial<Widget>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: w.id });
  const minW = CATALOG[w.type].minW ?? 1;
  const title = widgetTitle(w);
  const Icon = CATALOG[w.type].icon;
  return (
    <article
      ref={setNodeRef}
      className={`st-wtile w-${w.w} h-${w.h}${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition: reduced ? undefined : transition }}
      aria-label={title}
      data-testid={`widget-${w.id}`}
      data-type={w.type}
    >
      <header className="st-wtile__head">
        <button
          className="st-wtile__grip"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag ${title} to reorder`}
          data-testid={`w-grip-${w.id}`}
        >
          <GripVertical size={16} />
        </button>
        <Icon size={15} aria-hidden="true" className="st-wtile__icon" />
        <h3 className="st-wtile__title">{title}</h3>
        <div className="st-wmenu">
          <button
            className="st-icon st-icon--sm"
            aria-label={`Options for ${title}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={onMenu}
            data-testid={`w-menu-${w.id}`}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="st-menu" role="menu">
              <button role="menuitem" disabled={first} onClick={() => onMove(-1)} data-testid={`w-left-${w.id}`}>
                <ArrowLeft size={15} aria-hidden="true" /> Move earlier
              </button>
              <button role="menuitem" disabled={last} onClick={() => onMove(1)} data-testid={`w-right-${w.id}`}>
                <ArrowRight size={15} aria-hidden="true" /> Move later
              </button>
              <button
                role="menuitem"
                disabled={w.w >= 4}
                onClick={() => onChange({ w: Math.min(4, w.w + 1) as Widget['w'] })}
                data-testid={`w-wider-${w.id}`}
              >
                <MoveDiagonal2 size={15} aria-hidden="true" /> Wider
              </button>
              <button
                role="menuitem"
                disabled={w.w <= minW}
                onClick={() => onChange({ w: Math.max(minW, w.w - 1) as Widget['w'] })}
                data-testid={`w-narrower-${w.id}`}
              >
                <Shrink size={15} aria-hidden="true" /> Narrower
              </button>
              <button role="menuitem" onClick={() => onChange({ h: w.h === 1 ? 2 : 1 })} data-testid={`w-height-${w.id}`}>
                <ArrowDownToLine size={15} aria-hidden="true" /> {w.h === 1 ? 'Taller' : 'Shorter'}
              </button>
              <button role="menuitem" className="is-danger" onClick={onRemove} data-testid={`w-remove-${w.id}`}>
                <Trash2 size={15} aria-hidden="true" /> Remove
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="st-wtile__body">
        <WidgetBody w={w} vid={vid} onChange={onChange} />
      </div>
    </article>
  );
}

function TplPreview({ t }: { t: (typeof TEMPLATES)[number] }) {
  return (
    <span className="st-tplprev" aria-hidden="true">
      {t.widgets.map((s, i) => (
        <i key={i} className={`w-${s.w} h-${s.h}`} />
      ))}
    </span>
  );
}

function AddWidget({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (s: Spec) => void }) {
  const [type, setType] = useState<WType>('gauge');
  const [sig, setSig] = useState('rpm');
  const [sigs, setSigs] = useState<string[]>(['rpm', 'load']);
  const [frame, setFrame] = useState(0x1c4);
  const c = CATALOG[type];
  const numeric = SIGNALS.filter((s) => !s.kind);
  const add = () => {
    const base: Spec = { type, w: c.w, h: c.h };
    if (c.needs === 'sig') base.sig = sig;
    if (c.needs === 'sigs') base.sigs = sigs.length ? sigs : ['rpm'];
    if (c.needs === 'frame') base.frame = frame;
    if (type === 'checklist') base.items = [];
    onAdd(base);
  };
  return (
    <Dialog
      open={open}
      title="Add a widget"
      onClose={onClose}
      testId="addw"
      wide
      footer={
        <>
          <button className="st-btn" onClick={onClose} data-testid="addw-cancel">
            Cancel
          </button>
          <button className="st-btn st-btn--primary" onClick={add} data-testid="addw-ok">
            <Plus size={16} aria-hidden="true" /> Add {c.name.toLowerCase()}
          </button>
        </>
      }
    >
      <div className="st-addw">
        <ul className="st-addw__types" role="radiogroup" aria-label="Widget type">
          {(Object.keys(CATALOG) as WType[]).map((k) => {
            const C = CATALOG[k];
            const Icon = C.icon;
            return (
              <li key={k}>
                <button
                  role="radio"
                  aria-checked={type === k}
                  className={type === k ? 'is-on' : ''}
                  onClick={() => setType(k)}
                  data-testid={`addw-${k}`}
                >
                  <Icon size={18} aria-hidden="true" />
                  <b>{C.name}</b>
                  <span>{C.desc}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {c.needs === 'sig' && (
          <label className="st-field">
            <span>Live value</span>
            <select value={sig} onChange={(e) => setSig(e.target.value)} data-testid="addw-sig">
              {GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {(type === 'gauge' ? numeric : SIGNALS)
                    .filter((s) => s.group === g)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        {c.needs === 'sigs' && (
          <fieldset className="st-field st-field--multi">
            <legend>Values to chart (up to 3)</legend>
            <div className="st-addw__sigs">
              {numeric.map((s) => {
                const on = sigs.includes(s.id);
                return (
                  <label key={s.id} className={`st-chipcheck${on ? ' is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && sigs.length >= 3}
                      onChange={() => setSigs((cur) => (on ? cur.filter((x) => x !== s.id) : [...cur, s.id].slice(0, 3)))}
                      data-testid={`addw-sigs-${s.id}`}
                    />
                    {s.short}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        {c.needs === 'frame' && (
          <label className="st-field">
            <span>Broadcast frame</span>
            <select value={frame} onChange={(e) => setFrame(Number(e.target.value))} data-testid="addw-frame">
              {DECODABLE.map((m) => (
                <option key={m.id} value={m.id}>
                  0x{hexId(m.id)} · {m.toyota ?? m.dbc} — {m.summary.slice(0, 60)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </Dialog>
  );
}

/** Validates an imported JSON export and rebuilds pages with fresh IDs. */
function parsePages(json: unknown): Page[] {
  if (!json || typeof json !== 'object') return [];
  const o = json as { format?: unknown; pages?: unknown };
  if (o.format !== 'corolla-service-console/pages' || !Array.isArray(o.pages)) return [];
  const out: Page[] = [];
  for (const raw of o.pages.slice(0, 20)) {
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as { name?: unknown; widgets?: unknown };
    const id = nextId('pg');
    const widgets: Widget[] = [];
    for (const rw of Array.isArray(p.widgets) ? p.widgets.slice(0, 40) : []) {
      if (!rw || typeof rw !== 'object') continue;
      const x = rw as Record<string, unknown>;
      const type = x.type as WType;
      if (!(type in CATALOG)) continue;
      const C = CATALOG[type];
      const w = Math.min(4, Math.max(C.minW ?? 1, Number(x.w) || C.w)) as Widget['w'];
      const h = (Number(x.h) === 2 ? 2 : 1) as Widget['h'];
      const wd: Widget = { id: nextId(`${id}-w`), type, w, h };
      if (C.needs === 'sig') wd.sig = typeof x.sig === 'string' && SIG[x.sig] ? x.sig : 'rpm';
      if (C.needs === 'sigs')
        wd.sigs = (Array.isArray(x.sigs) ? x.sigs : []).filter((s): s is string => typeof s === 'string' && !!SIG[s]).slice(0, 3);
      if (C.needs === 'frame') wd.frame = DECODABLE.some((m) => m.id === Number(x.frame)) ? Number(x.frame) : 0x1c4;
      if (type === 'checklist')
        wd.items = (Array.isArray(x.items) ? x.items : [])
          .filter((i): i is CheckItem => !!i && typeof (i as CheckItem).t === 'string')
          .slice(0, 30)
          .map((i) => ({ t: i.t.slice(0, 120), done: !!i.done }));
      if (type === 'notes' && typeof x.text === 'string') wd.text = x.text.slice(0, 4000);
      widgets.push(wd);
    }
    out.push({ id, name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 40) : 'Imported page', widgets });
  }
  return out;
}
