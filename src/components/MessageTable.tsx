import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { MESSAGES, EXCLUDED_TSS_IDS, hex, type CanMessage } from '../data/messages';
import { SectionHead, SourceLinks, Pill, BASIS_LABEL } from './ui';
import { nameOf } from './Inspector';

const TOPICS: { k: CanMessage['topic'] | 'all'; label: string }[] = [
  { k: 'all', label: 'All' },
  { k: 'powertrain', label: 'Powertrain' },
  { k: 'chassis', label: 'Chassis' },
  { k: 'body', label: 'Body' },
  { k: 'safety', label: 'Restraints' },
  { k: 'infotainment', label: 'Audio' },
  { k: 'diagnostic', label: 'Diagnostic' },
  { k: 'unknown', label: 'Undocumented' },
];

/** IDs that appear in openpilot’s 2017 Corolla fingerprint log (the rest are scan-tool addresses from other lists). */
const LOGGED = MESSAGES.filter((m) => m.sources.includes('openpilotFingerprint')).length;

export function MessageTable({ initialOpen }: { initialOpen?: number }) {
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState<(typeof TOPICS)[number]['k']>('all');
  const [sender, setSender] = useState('all');
  const [open, setOpen] = useState<number | null>(initialOpen ?? 0x1c4);

  const senders = useMemo(() => [...new Set(MESSAGES.map((m) => m.sender).filter(Boolean) as string[])], []);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return MESSAGES.filter((m) => {
      if (topic !== 'all' && m.topic !== topic) return false;
      if (sender !== 'all' && m.sender !== sender) return false;
      if (!s) return true;
      const hay = [hex(m.id), m.id.toString(), m.toyota, m.dbc, m.summary, m.sender ? nameOf(m.sender) : '', ...(m.signals ?? []).map((x) => x.name)]
        .join(' ')
        .toLowerCase();
      return hay.includes(s);
    }).sort((a, b) => a.id - b.id);
  }, [q, topic, sender]);

  return (
    <section className="section section--msgs" aria-labelledby="msgs-title" id="messages">
      <div className="container">
        <SectionHead kicker="04 · Message dictionary" title="The conversation, frame by frame" id="msgs-title">
          <p>
            Toyota does not publish its CAN message list, so this one is assembled from open-source logs of the same platform.{' '}
            {LOGGED} of these {MESSAGES.length} identifiers were recorded on a 2017 Corolla by the openpilot project, with its{' '}
            {EXCLUDED_TSS_IDS.length} driver-assist and add-on frames removed because a 2016 LE does not have that hardware; the other{' '}
            {MESSAGES.length - LOGGED} are scan-tool addresses from openpilot’s Toyota lists. A 2016 car may differ by a few frames.
            Layouts come from comma.ai’s DBC files. Senders marked “Toyota frame name” follow Toyota’s own naming (ENG = engine, VSC =
            skid control, ACN = A/C, AVN = audio, ABG = airbag, MET = meter, STR = steering).
          </p>
        </SectionHead>

        <div className="msg-tools">
          <label className="search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search messages</span>
            <input
              type="search"
              placeholder="Search ID, name or signal — try 0x3BC or DOOR"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="msg-search"
            />
          </label>
          <label className="select">
            <span className="select__label">Sender</span>
            <select value={sender} onChange={(e) => setSender(e.target.value)} data-testid="msg-sender">
              <option value="all">Any module</option>
              {senders.map((s) => (
                <option key={s} value={s}>
                  {nameOf(s)}
                </option>
              ))}
            </select>
          </label>
          <div className="chips" role="group" aria-label="Topic">
            {TOPICS.map((t) => (
              <button
                key={t.k}
                className={`chip${topic === t.k ? ' is-on' : ''}`}
                aria-pressed={topic === t.k}
                onClick={() => setTopic(t.k)}
                data-testid={`msg-topic-${t.k}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <p className="msg-count" aria-live="polite">
          Showing <b>{rows.length}</b> of {MESSAGES.length} frames
        </p>
        <div className="table-wrap table-wrap--scroll">
          <table className="msgs" data-testid="msg-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Toyota / DBC name</th>
                <th scope="col">Sender</th>
                <th scope="col">Bytes</th>
                <th scope="col">What it carries</th>
                <th scope="col">
                  <span className="sr-only">Expand</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const b = BASIS_LABEL[m.basis];
                const isOpen = open === m.id;
                return (
                  <Fragment key={m.id}>
                    <tr className={`msg${isOpen ? ' is-open' : ''}`} onClick={() => setOpen(isOpen ? null : m.id)} data-msg-row={m.id}>
                      <td>
                        <code className="msg__id">{hex(m.id)}</code>
                      </td>
                      <td>
                        <div className="msg__names">
                          {m.toyota && <b>{m.toyota}</b>}
                          {m.dbc && <span>{m.dbc}</span>}
                          {!m.toyota && !m.dbc && <span className="muted">—</span>}
                        </div>
                      </td>
                      <td>
                        <div className="msg__sender">
                          <span>{m.sender ? nameOf(m.sender) : 'Unknown'}</span>
                          <span title={b.title}>
                            <Pill tone={b.tone}>{b.text}</Pill>
                          </span>
                        </div>
                      </td>
                      <td className="num">{m.dlc}</td>
                      <td className="msg__sum">
                        {m.summary}
                        {m.requires && <Pill tone="info">smart key cars</Pill>}
                      </td>
                      <td>
                        {(m.signals || m.note || m.consumers) && (
                          <button
                            className={`icon-btn icon-btn--sm${isOpen ? ' is-on' : ''}`}
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? 'Hide' : 'Show'} signals for ${hex(m.id)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpen(isOpen ? null : m.id);
                            }}
                            data-testid={`msg-expand-${hex(m.id)}`}
                          >
                            <ChevronDown size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (m.signals || m.note || m.consumers) && (
                      <tr className="msg-detail">
                        <td colSpan={6}>
                          <div className="msg-detail__grid">
                            {m.signals && (
                              <table className="sigs">
                                <thead>
                                  <tr>
                                    <th scope="col">Signal</th>
                                    <th scope="col">Start | length</th>
                                    <th scope="col">Scale</th>
                                    <th scope="col">Meaning</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {m.signals.map((s) => (
                                    <tr key={s.name}>
                                      <td>
                                        <code>{s.name}</code>
                                      </td>
                                      <td>
                                        <code>
                                          {s.start}|{s.len}
                                          {s.signed ? ' signed' : ''}
                                        </code>
                                      </td>
                                      <td>
                                        <code>
                                          ×{s.factor}
                                          {s.offset ? ` ${s.offset > 0 ? '+' : '−'} ${Math.abs(s.offset)}` : ''}
                                          {s.unit ? ` ${s.unit}` : ''}
                                        </code>
                                      </td>
                                      <td>
                                        {s.desc}
                                        {s.values && (
                                          <span className="vals">
                                            {Object.entries(s.values).map(([k, v]) => (
                                              <span key={k}>
                                                {k} = {v}
                                              </span>
                                            ))}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            <div className="msg-detail__side">
                              {m.consumers && (
                                <p>
                                  <b>Used by:</b> {m.consumers.map(nameOf).join(', ')}
                                </p>
                              )}
                              {m.note && <p className="muted">{m.note}</p>}
                              <SourceLinks keys={m.sources} compact />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    No frames match. Clear the search or pick another topic.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="foot-note">
          Left out on purpose: {EXCLUDED_TSS_IDS.map(hex).join(', ')} — Toyota Safety Sense driver-assist traffic and an aftermarket
          pedal interceptor that appear in the 2017 log but do not exist on a 2016 LE. “Used by” lists come from Toyota’s system
          descriptions, not from the DBC.
        </p>
      </div>
    </section>
  );
}
