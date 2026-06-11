'use client';

import { useMemo, useState } from 'react';
import type {
  WorldTimeline,
  HeroTimeline,
  SupportTimeline,
  SupportCharacter,
  Collision,
  WorldEvent,
  HeroEvent,
  SupportEvent,
} from '@core/narrative/types';
import { compareEventOrder, type SortableEvent } from '@core/narrative/timeline-sort';

type Lane = 'world' | 'support' | 'hero';

interface DragPayload {
  lane: Lane;
  eventId: string;
  fromDay: number;
}

interface Props {
  world: WorldTimeline;
  hero: HeroTimeline;
  support?: SupportTimeline | null;
  supportCharacters?: SupportCharacter[];
  collisions?: Collision[];
  disabled?: boolean;
  onMoveEvent: (
    lane: Lane,
    eventId: string,
    day: number,
    beforeEventId?: string
  ) => Promise<void>;
}

const VISIBILITY_LABEL: Record<WorldEvent['visibility'], string> = {
  secret: '隐',
  rumor: '谣',
  public: '公',
};

function dayRange(world: WorldTimeline, hero: HeroTimeline, support?: SupportTimeline | null): number[] {
  const maxEventDay = Math.max(
    0,
    ...world.events.map((e) => e.day),
    ...hero.events.map((e) => e.day),
    ...(support?.events ?? []).map((e) => e.day)
  );
  const end = Math.max(world.currentDay, maxEventDay);
  return Array.from({ length: end + 1 }, (_, i) => i);
}

function groupByDay<T extends SortableEvent>(events: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const e of events) {
    const list = map.get(e.day) ?? [];
    list.push(e);
    map.set(e.day, list);
  }
  for (const [, list] of map) {
    list.sort(compareEventOrder);
  }
  return map;
}

const AWARENESS_LABEL: Record<SupportEvent['protagonistAwareness'], string> = {
  none: '隐',
  rumor: '谣',
  partial: '觉',
};

export function TimelineVisualizer({
  world,
  hero,
  support,
  supportCharacters = [],
  collisions = [],
  disabled = false,
  onMoveEvent,
}: Props) {
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dropDay, setDropDay] = useState<number | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const charName = useMemo(
    () => new Map(supportCharacters.map((c) => [c.id, c.name])),
    [supportCharacters]
  );
  const days = useMemo(() => dayRange(world, hero, support), [world, hero, support]);
  const worldByDay = useMemo(() => groupByDay(world.events), [world.events]);
  const heroByDay = useMemo(() => groupByDay(hero.events), [hero.events]);
  const supportByDay = useMemo(() => groupByDay(support?.events ?? []), [support?.events]);
  const hasSupportLane = (support?.events.length ?? 0) > 0 || supportCharacters.length > 0;

  const collisionDays = useMemo(() => {
    const set = new Set<number>();
    for (const c of collisions.filter((x) => x.status === 'candidate' || x.status === 'accepted')) {
      set.add(c.day);
    }
    return set;
  }, [collisions]);

  function startDrag(lane: Lane, event: WorldEvent | HeroEvent | SupportEvent) {
    if (disabled || event.locked) return;
    setDragging({ lane, eventId: event.id, fromDay: event.day });
  }

  async function finishDrop(targetDay: number, beforeEventId?: string) {
    if (!dragging || disabled) return;
    setDropDay(null);
    const payload = dragging;
    setDragging(null);

    const sameDay = targetDay === payload.fromDay;
    const samePosition = sameDay && beforeEventId === payload.eventId;
    if (samePosition) return;

    const key = `${payload.lane}-${payload.eventId}`;
    setMoving(key);
    try {
      await onMoveEvent(payload.lane, payload.eventId, targetDay, beforeEventId);
    } finally {
      setMoving(null);
    }
  }

  function renderWorldCard(event: WorldEvent) {
    const isDragging = dragging?.eventId === event.id;
    const isMoving = moving === `world-${event.id}`;
    return (
      <div
        key={event.id}
        className={`tl-event tl-event-world vis-${event.visibility}${event.locked ? ' locked' : ''}${isDragging ? ' dragging' : ''}`}
        draggable={!disabled && !event.locked}
        onDragStart={() => startDrag('world', event)}
        onDragEnd={() => {
          setDragging(null);
          setDropDay(null);
        }}
        onDragOver={(e) => {
          if (!dragging || dragging.lane !== 'world' || dragging.eventId === event.id) return;
          e.preventDefault();
          setDropDay(event.day);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void finishDrop(event.day, event.id);
        }}
        title={event.description}
      >
        <span className="tl-vis">{VISIBILITY_LABEL[event.visibility]}</span>
        <span className="tl-title">{event.title}</span>
        {event.locked && <span className="tl-lock">🔒</span>}
        {isMoving && <span className="tl-moving">…</span>}
      </div>
    );
  }

  function renderSupportCard(event: SupportEvent) {
    const who = charName.get(event.characterId) ?? event.characterId;
    const isDragging = dragging?.eventId === event.id;
    const isMoving = moving === `support-${event.id}`;
    return (
      <div
        key={event.id}
        className={`tl-event tl-event-support aware-${event.protagonistAwareness}${event.locked ? ' locked' : ''}${isDragging ? ' dragging' : ''}`}
        draggable={!disabled && !event.locked}
        onDragStart={() => startDrag('support', event)}
        onDragEnd={() => {
          setDragging(null);
          setDropDay(null);
        }}
        onDragOver={(e) => {
          if (!dragging || dragging.lane !== 'support' || dragging.eventId === event.id) return;
          e.preventDefault();
          setDropDay(event.day);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void finishDrop(event.day, event.id);
        }}
        title={event.intent}
      >
        <span className="tl-vis">{AWARENESS_LABEL[event.protagonistAwareness]}</span>
        <span className="tl-title">
          {who}·{event.title}
        </span>
        {event.locked && <span className="tl-lock">🔒</span>}
        {isMoving && <span className="tl-moving">…</span>}
      </div>
    );
  }

  function renderHeroCard(event: HeroEvent) {
    const isDragging = dragging?.eventId === event.id;
    const isMoving = moving === `hero-${event.id}`;
    return (
      <div
        key={event.id}
        className={`tl-event tl-event-hero${event.locked ? ' locked' : ''}${isDragging ? ' dragging' : ''}`}
        draggable={!disabled && !event.locked}
        onDragStart={() => startDrag('hero', event)}
        onDragEnd={() => {
          setDragging(null);
          setDropDay(null);
        }}
        onDragOver={(e) => {
          if (!dragging || dragging.lane !== 'hero' || dragging.eventId === event.id) return;
          e.preventDefault();
          setDropDay(event.day);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void finishDrop(event.day, event.id);
        }}
        title={event.intent}
      >
        <span className="tl-title">{event.title}</span>
        {event.locked && <span className="tl-lock">🔒</span>}
        {isMoving && <span className="tl-moving">…</span>}
      </div>
    );
  }

  return (
    <div className="tl-root">
      <div className="tl-legend">
        <span>
          <i className="tl-swatch tl-swatch-world" /> 世界线（隐线）
        </span>
        <span>
          <i className="tl-swatch tl-swatch-hero" /> 主人公线（明线）
        </span>
        {hasSupportLane && (
          <span>
            <i className="tl-swatch tl-swatch-support" /> 配角隐线
          </span>
        )}
        <span className="muted">
          世界/配角/主角轨均可拖拽改天与同日内顺序；锁定事件不可拖
        </span>
      </div>

      <div className="tl-scroll">
        <div
          className="tl-grid"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(108px, 1fr))` }}
        >
          {days.map((day) => {
            const isCurrent = day === world.currentDay;
            const hasCollision = collisionDays.has(day);
            const isDropTarget = dropDay === day && dragging !== null;
            return (
              <div
                key={day}
                className={`tl-day-col${isCurrent ? ' current' : ''}${hasCollision ? ' collision' : ''}${isDropTarget ? ' drop-target' : ''}`}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  setDropDay(day);
                }}
                onDragLeave={() => {
                  if (dropDay === day) setDropDay(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void finishDrop(day);
                }}
              >
                <div className="tl-day-head">
                  <span className="tl-day-num">第 {day} 天</span>
                  {isCurrent && <span className="badge badge-success">今</span>}
                  {hasCollision && <span className="badge badge-warn">碰</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="tl-lane-label">世界线</div>
        <div
          className="tl-grid tl-lane"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(108px, 1fr))` }}
        >
          {days.map((day) => (
            <div key={`w-${day}`} className="tl-cell">
              {(worldByDay.get(day) ?? []).map(renderWorldCard)}
            </div>
          ))}
        </div>

        {hasSupportLane && (
          <>
            <div className="tl-lane-label support">配角隐线</div>
            <div
              className="tl-grid tl-lane"
              style={{ gridTemplateColumns: `repeat(${days.length}, minmax(108px, 1fr))` }}
            >
              {days.map((day) => (
                <div key={`s-${day}`} className="tl-cell">
                  {(supportByDay.get(day) ?? []).map(renderSupportCard)}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="tl-lane-label hero">主人公线</div>
        <div
          className="tl-grid tl-lane"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(108px, 1fr))` }}
        >
          {days.map((day) => (
            <div key={`h-${day}`} className="tl-cell">
              {(heroByDay.get(day) ?? []).map(renderHeroCard)}
            </div>
          ))}
        </div>
      </div>

      {collisions.length > 0 && (
        <details className="tl-collisions">
          <summary>碰撞连结（{collisions.filter((c) => c.status === 'candidate').length} 候选）</summary>
          <ul>
            {collisions
              .filter((c) => c.status === 'candidate' || c.status === 'accepted')
              .map((c) => (
                <li key={c.id}>
                  第{c.day}天 · {c.location} — {c.title}
                  {c.required ? '（必须）' : ''}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
