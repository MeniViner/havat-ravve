import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Place } from '../../../types';
import { connectionCurrent, sections, type Point, type Trail } from '../../../survey/model';
import { AppScreen, go } from '../../core';
import { Icon } from '../../kit';
import { PlaceGlyph, type DrawnTrail } from './SurveyMap';
import './mapWorkspace.css';

type Layer = 'places' | 'walk' | 'vehicle' | 'unknown' | 'current';
type Selection = { kind: 'place' | 'trail'; id: string };
type MapUI = {
  selected?: string;
  selectedTrail?: string;
  demoBase: 'terrain' | 'osm';
  onPlace: (id: string) => void;
  onTrail: (id: string) => void;
  panelOpen: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  layers: Partial<Record<Layer, boolean>>;
};
type Props = {
  places: Place[];
  trails: DrawnTrail[];
  online: boolean;
  isDemo?: boolean;
  editing?: boolean;
  onToggleEdit?: () => void;
  panel?: ReactNode;
  onClosePanel?: () => void;
  dock?: ReactNode;
  toolbar?: ReactNode;
  hint?: ReactNode;
  onEditPlace?: (place: Place) => void;
  onEditTrail?: (trail: Trail) => void;
  onFocus: (points: Point[]) => void;
  onHome: () => void;
  onLocate?: () => void;
  onLocationDetails?: () => void;
  onOpenTools?: () => void;
  locationLabel?: string;
  locationDetail?: string;
  notice?: ReactNode;
  renderMap: (ui: MapUI) => ReactNode;
};
const layerNames: Record<Layer, [string, string]> = {
  places: ['מקומות בחווה', 'מקום בחווה'],
  walk: ['שבילי הליכה', 'שביל הליכה'],
  vehicle: ['שבילים שמתאימים לרכב', 'שביל מתאים לרכב'],
  unknown: ['שבילים ללא התאמה מאושרת', 'התאמה טרם אושרה'],
  current: ['הסקר הנוכחי', 'הסקר הנוכחי'],
};
function Glyph({ kind }: { kind: 'layers' | 'fit' | 'target' | 'trail' | 'map' }) {
  const paths = {
    layers: 'm3 8 9-5 9 5-9 5z M3 12l9 5 9-5 M3 16l9 5 9-5',
    fit: 'M8 4H4v4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4',
    target:
      'M12 2v3 M12 19v3 M2 12h3 M19 12h3 M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0z M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
    trail: 'M5 19c0-6 13-2 13-8 0-4-10-1-10-5 M7 3l2 3-2 2',
    map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16',
  };
  return (
    <svg
      aria-hidden="true"
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[kind]} />
    </svg>
  );
}

export function MapPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [title]);
  return (
    <section className="fm-panel" aria-labelledby={titleId}>
      <span className="fm-handle" aria-hidden="true" />
      <header className="fm-panel-head">
        <h2 id={titleId} ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button className="fm-icon" aria-label="סגירה" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="fm-panel-body">{children}</div>
    </section>
  );
}

function trailLength(path: DrawnTrail) {
  let length = 0;
  const radians = Math.PI / 180;
  for (const group of sections(path.points)) {
    for (let i = 1; i < group.length; i++) {
      const a = group[i - 1],
        b = group[i];
      const h =
        Math.sin(((b.lat - a.lat) * radians) / 2) ** 2 +
        Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(((b.lng - a.lng) * radians) / 2) ** 2;
      length += 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
    }
  }
  return length >= 1000
    ? (length / 1000).toLocaleString('he-IL', { maximumFractionDigits: 1 }) + ' ק״מ'
    : Math.round(length) + ' מ׳';
}

function PlaceDetails({
  place,
  trails,
  onFocus,
  onEdit,
  onTrail,
}: {
  place: Place;
  trails: DrawnTrail[];
  onFocus: () => void;
  onEdit?: () => void;
  onTrail: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const linked = trails.filter(({ trail }) =>
    trail.connections?.some(
      (c) => c.target === 'place' && c.targetId === place.id && connectionCurrent(c, [place], [])
    )
  );
  return (
    <div className="fm-stack">
      <div className="fm-detail-kind">
        <span className="fm-key">
          <PlaceGlyph icon={place.icon || 'pin'} />
        </span>
        <b>מקום בחווה</b>
      </div>
      {place.photo && <img className="fm-place-photo" src={place.photo} alt={'תמונה של ' + place.name} />}
      {expanded && (
        <>
          <div>
            <small>נקודה במפה</small>
            <div className="fm-coordinates">
              <bdi>
                {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
              </bdi>
            </div>
          </div>
          {linked.length ? (
            <div>
              <small>שבילים שמתחברים למקום</small>
              {linked.map(({ trail }) => (
                <button className="fm-related" key={trail.id} onClick={() => onTrail(trail.id)}>
                  {trail.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="fm-muted">אין חיבור שמור לקצה שביל.</p>
          )}
        </>
      )}
      <div className="fm-pair">
        <button className="fm-btn" onClick={onFocus}>
          <Glyph kind="target" />
          מיקוד במפה
        </button>
        <button className="fm-btn" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <Icon name="chevron-down" />
          {expanded ? 'פחות פרטים' : 'עוד פרטים'}
        </button>
      </div>
      {onEdit && (
        <button className="fm-btn fm-primary" onClick={onEdit}>
          <Icon name="edit" />
          עריכת המקום
        </button>
      )}
    </div>
  );
}

function TrailDetails({
  path,
  places,
  trails,
  onFocus,
  onEdit,
}: {
  path: DrawnTrail;
  places: Place[];
  trails: DrawnTrail[];
  onFocus: () => void;
  onEdit?: () => void;
}) {
  const { trail, points } = path;
  const linked = new Set<string>();
  const trailDocs = trails.map((t) => t.trail);
  for (const c of trail.connections ?? []) {
    if (!connectionCurrent(c, places, trailDocs)) continue;
    const target = (c.target === 'place' ? places : trailDocs).find((t) => t.id === c.targetId);
    if (target) linked.add(target.name);
  }
  return (
    <div className="fm-stack">
      {points.length ? (
        <div className="fm-metrics">
          <span>
            <b>{trailLength(path)}</b>
            <small>אורך התוואי</small>
          </span>
          <span>
            <b>{sections(points).length}</b>
            <small>מקטעים</small>
          </span>
        </div>
      ) : (
        <p className="fm-muted">נקודות השביל עדיין לא נטענו.</p>
      )}
      {(
        [
          'walk',
          'vehicle',
          ...(trail.modes?.includes('bike') || trail.unsuitableModes?.includes('bike') ? ['bike'] : []),
        ] as const
      ).map((mode) => (
        <div key={mode} className="fm-mode">
          <span>{mode === 'walk' ? 'הליכה' : mode === 'vehicle' ? 'רכב' : 'אופניים'}</span>
          <b>
            {trail.modes?.some((m) => m === mode)
              ? 'מתאים'
              : trail.unsuitableModes?.some((m) => m === mode)
                ? 'אינו מתאים'
                : 'טרם נקבע'}
          </b>
        </div>
      ))}
      <small>{linked.size ? 'מתחבר אל ' + [...linked].join(' · ') : 'אין חיבורים שמורים לקצות השביל.'}</small>
      <button className="fm-btn" disabled={!points.length} onClick={onFocus}>
        <Glyph kind="fit" />
        הצגת כל השביל
      </button>
      {onEdit && (
        <button className="fm-btn fm-primary" onClick={onEdit}>
          <Icon name="edit" />
          עריכת השביל
        </button>
      )}
    </div>
  );
}

function MapSearch({
  places,
  trails,
  onSelect,
}: {
  places: Place[];
  trails: DrawnTrail[];
  onSelect: (choice: Selection) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const resultsId = useId();
  const results = [
    ...places.map((p) => ({ id: p.id, name: p.name, kind: 'place' as const })),
    ...trails.map(({ trail }) => ({ id: trail.id, name: trail.name, kind: 'trail' as const })),
  ].filter((row) => row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const choose = (choice: Selection) => {
    setOpen(false);
    setQuery('');
    setActive(-1);
    onSelect(choice);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key !== '/' ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]'))
      )
        return;
      e.preventDefault();
      setOpen(true);
      input.current?.focus();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (open && active >= 0)
      document.getElementById(resultsId + '-' + active)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, resultsId]);
  return (
    <div
      className="fm-search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <div className="fm-search-field">
        <Icon name="search" size={22} />
        <input
          ref={input}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={resultsId}
          aria-expanded={open}
          aria-activedescendant={open && active >= 0 ? resultsId + '-' + active : undefined}
          aria-label="חיפוש מקום או שביל בחווה"
          autoComplete="off"
          placeholder="חיפוש מקום או שביל בחווה"
          value={query}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
              input.current?.blur();
              return;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              setActive((a) =>
                results.length
                  ? a < 0
                    ? e.key === 'ArrowDown'
                      ? 0
                      : results.length - 1
                    : (a + results.length + (e.key === 'ArrowDown' ? 1 : -1)) % results.length
                  : -1
              );
            }
            if (e.key === 'Enter' && open && results.length) {
              e.preventDefault();
              choose(results[active] || results[0]);
            }
          }}
        />
        {query ? (
          <button
            className="fm-icon"
            aria-label="ניקוי החיפוש"
            onClick={() => {
              setQuery('');
              setActive(-1);
              input.current?.focus();
            }}
          >
            <Icon name="close" size={18} />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </div>
      {open && (
        <div className="fm-results" id={resultsId} role="listbox" aria-label="תוצאות חיפוש">
          {results.map((r, i) => (
            <button
              role="option"
              aria-selected={active === i}
              id={resultsId + '-' + i}
              key={r.kind + r.id}
              tabIndex={-1}
              className="fm-result"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(r)}
            >
              <span className="fm-key">
                {r.kind === 'place' ? <Icon name="pin" size={19} /> : <Glyph kind="trail" />}
              </span>
              <span>
                <b>{r.name}</b>
                <small>{r.kind === 'place' ? 'מקום בחווה' : 'שביל בחווה'}</small>
              </span>
              <Icon name="chevron" size={16} />
            </button>
          ))}
          {!results.length && (
            <p className="fm-muted">
              {query.trim() ? 'לא נמצאו מקומות או שבילים בשם הזה.' : 'עדיין אין מקומות או שבילים להצגה.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function MapWorkspace(p: Props) {
  const [selection, setSelection] = useState<Selection | 'layers' | null>(null);
  const [layers, setLayers] = useState<MapUI['layers']>({});
  const [legend, setLegend] = useState(() => window.matchMedia('(min-width:761px)').matches);
  const [demoBase, setDemoBase] = useState<'terrain' | 'osm'>('terrain');
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const place =
    selection && selection !== 'layers' && selection.kind === 'place'
      ? p.places.find((q) => q.id === selection.id)
      : undefined;
  const path =
    selection && selection !== 'layers' && selection.kind === 'trail'
      ? p.trails.find((q) => q.trail.id === selection.id)
      : undefined;
  const close = () => {
    if (!selection) p.onClosePanel?.();
    setSelection(null);
    if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
  };
  const pick = (choice: Selection) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelection(choice);
    if (choice.kind === 'place') {
      const selectedPlace = p.places.find((v) => v.id === choice.id);
      if (selectedPlace) {
        setLayers((prev) => ({ ...prev, places: true }));
        p.onFocus([selectedPlace]);
      }
    } else {
      const selectedTrail = p.trails.find((v) => v.trail.id === choice.id);
      if (selectedTrail) {
        const key = selectedTrail.trail.modes?.includes('vehicle')
          ? 'vehicle'
          : selectedTrail.trail.modes?.includes('walk')
            ? 'walk'
            : 'unknown';
        setLayers((prev) => ({ ...prev, [key]: true }));
        if (selectedTrail.points.length) p.onFocus(selectedTrail.points);
      }
    }
  };
  const run = (act?: () => void) => {
    setSelection(null);
    act?.();
  };
  const layerKeys = Object.keys(layerNames) as Layer[];
  const panel =
    selection === 'layers' ? (
      <MapPanel title="שכבות המפה" onClose={close}>
        {layerKeys
          .filter((k) => k !== 'current' || p.editing)
          .map((k) => (
            <label className="fm-layer" key={k}>
              <span className={'fm-swatch fm-' + k} />
              {layerNames[k][0]}
              <input
                type="checkbox"
                checked={layers[k] !== false}
                onChange={(e) => setLayers((prev) => ({ ...prev, [k]: e.target.checked }))}
              />
            </label>
          ))}
        {p.isDemo ? (
          <label className="fm-demo-base">
            מפת בסיס
            <select
              value={demoBase}
              onChange={(e) => setDemoBase(e.target.value === 'osm' ? 'osm' : 'terrain')}
            >
              <option value="terrain">מפה טופוגרפית להמחשה</option>
              <option value="osm">מפה גאוגרפית · OpenStreetMap</option>
            </select>
          </label>
        ) : (
          <small>מפת בסיס · OpenStreetMap</small>
        )}
      </MapPanel>
    ) : place ? (
      <MapPanel title={place.name} onClose={close}>
        <PlaceDetails
          key={place.id}
          place={place}
          trails={p.trails}
          onFocus={() => p.onFocus([place])}
          onTrail={(id) => pick({ kind: 'trail', id })}
          onEdit={p.editing && p.onEditPlace ? () => run(() => p.onEditPlace?.(place)) : undefined}
        />
      </MapPanel>
    ) : path ? (
      <MapPanel title={path.trail.name} onClose={close}>
        <TrailDetails
          path={path}
          places={p.places}
          trails={p.trails}
          onFocus={() => p.onFocus(path.points)}
          onEdit={p.editing && p.onEditTrail ? () => run(() => p.onEditTrail?.(path.trail)) : undefined}
        />
      </MapPanel>
    ) : (
      p.panel
    );
  const legendKeys = layerKeys.filter(
    (k) =>
      layers[k] !== false &&
      (k !== 'unknown' || p.trails.some((t) => !t.trail.modes?.some((m) => m === 'vehicle' || m === 'walk'))) &&
      (k !== 'current' || p.dock)
  );
  return (
    <AppScreen className={'farm-map-workspace' + (p.toolbar ? ' map-home-framing' : '')} variant="plain">
      <header className={'fm-header' + (p.editing ? ' fm-header-edit' : '')}>
        {p.toolbar || (
          <>
            <div className="fm-brand">
              <img src="/assets/rava-logo.png" alt="" />
              <div>
                <strong>חוות רווה</strong>
                <h1>
                  <Glyph kind="map" />
                  מפת החווה
                </h1>
              </div>
            </div>
            <div className="fm-actions">
              {p.onToggleEdit && (
                <button className="fm-btn fm-primary" onClick={() => run(p.onToggleEdit)}>
                  <Icon name={p.editing ? 'check' : 'edit'} size={18} />
                  {p.editing ? 'סיום עריכה' : 'עריכת המפה'}
                </button>
              )}
              <button className="fm-back" aria-label="חזרה לחווה" onClick={() => go('/farm')}>
                <span>חזרה לחווה</span>
                <Icon name="back" size={19} />
              </button>
            </div>
          </>
        )}
      </header>
      <div
        className={'fm-viewport' + (panel ? ' fm-with-panel' : '') + (p.dock ? ' fm-with-dock' : '')}
        onKeyDown={(e) => {
          if (panel && e.key === 'Escape' && !e.defaultPrevented) {
            e.stopPropagation();
            close();
          }
        }}
      >
        <div className="fm-map-host">
          {p.renderMap({
            selected: place?.id,
            selectedTrail: path?.trail.id,
            onPlace: (id) => pick({ kind: 'place', id }),
            onTrail: (id) => pick({ kind: 'trail', id }),
            panelOpen: !!panel,
            panelRef,
            layers,
            demoBase,
          })}
        </div>
        {!p.toolbar && (
          <>
            <MapSearch places={p.places} trails={p.trails} onSelect={pick} />
            <div className="fm-rail">
              {p.onLocate && (
                <button
                  className="fm-icon"
                  title="המיקום שלי"
                  aria-label="המיקום שלי"
                  onClick={() => run(p.onLocate)}
                >
                  <Glyph kind="target" />
                </button>
              )}
              <button
                className="fm-icon"
                title="מבט על החווה"
                aria-label="מבט על החווה"
                onClick={() => run(p.onHome)}
              >
                <Glyph kind="fit" />
              </button>
              <button
                className="fm-icon"
                title="שכבות המפה"
                aria-label="שכבות המפה"
                aria-expanded={selection === 'layers'}
                onClick={(e) => {
                  if (selection === 'layers') close();
                  else {
                    returnFocus.current = e.currentTarget;
                    setSelection('layers');
                  }
                }}
              >
                <Glyph kind="layers" />
              </button>
            </div>
            {p.editing && !panel && p.onOpenTools && (
              <button className="fm-btn fm-tools" onClick={() => run(p.onOpenTools)}>
                <Icon name="sliders" size={17} />
                כלי עריכה
              </button>
            )}
            {!panel && !p.dock && (
              <>
                <section className="fm-legend">
                  <button className="fm-legend-head" aria-expanded={legend} onClick={() => setLegend(!legend)}>
                    <b>מקרא המפה</b>
                    <Icon name="chevron-down" size={17} />
                  </button>
                  {legend && (
                    <ul>
                      {legendKeys.map((k) => (
                        <li key={k}>
                          <span className={'fm-swatch fm-' + k} />
                          {layerNames[k][1]}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                {(p.onLocationDetails || p.onLocate) && (
                  <button className="fm-location" onClick={() => run(p.onLocationDetails || p.onLocate)}>
                    <span className="fm-key">
                      <Glyph kind="target" />
                    </span>
                    <span>
                      <b>{p.locationLabel || 'הצגת המיקום שלי'}</b>
                      <small>{p.locationDetail || 'כדי להתמצא בשטח'}</small>
                    </span>
                    <Icon name="chevron" size={16} />
                  </button>
                )}
              </>
            )}
          </>
        )}
        {panel && (
          <div className="fm-sheet" ref={panelRef}>
            {panel}
          </div>
        )}
        {p.dock && <div className="fm-dock">{p.dock}</div>}
        {p.hint && <div className="fm-hint">{p.hint}</div>}
        {p.notice && (
          <div className="fm-notice" role="status">
            {p.notice}
          </div>
        )}
      </div>
    </AppScreen>
  );
}
