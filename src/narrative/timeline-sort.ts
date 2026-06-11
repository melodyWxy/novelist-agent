/**
 * 时间轴同日内排序工具
 */
export interface SortableEvent {
  id: string;
  day: number;
  sortOrder: number;
  title: string;
}

export function compareEventOrder(a: SortableEvent, b: SortableEvent): number {
  return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN');
}

export function nextSortOrderOnDay<T extends { day: number; sortOrder: number }>(
  events: T[],
  day: number
): number {
  const onDay = events.filter((e) => e.day === day);
  if (onDay.length === 0) return 0;
  return Math.max(...onDay.map((e) => e.sortOrder)) + 1;
}

export function renumberDayEvents<T extends SortableEvent>(
  events: T[],
  day: number,
  orderedIds: string[]
): T[] {
  const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
  return events.map((e) =>
    e.day === day && orderMap.has(e.id) ? { ...e, sortOrder: orderMap.get(e.id)! } : e
  );
}

/** 移动事件到目标日，可选插入到 beforeEventId 之前 */
export function moveEventInTimeline<T extends SortableEvent>(
  events: T[],
  eventId: string,
  targetDay: number,
  beforeEventId?: string
): T[] {
  const moving = events.find((e) => e.id === eventId);
  if (!moving) throw new Error(`事件 ${eventId} 不存在`);

  const sourceDay = moving.day;
  const rest = events.filter((e) => e.id !== eventId);
  const moved: T = { ...moving, day: targetDay };

  let targetList = rest.filter((e) => e.day === targetDay).sort(compareEventOrder);
  let insertAt = targetList.length;
  if (beforeEventId) {
    const beforeIdx = targetList.findIndex((e) => e.id === beforeEventId);
    if (beforeIdx >= 0) insertAt = beforeIdx;
  }
  targetList = [...targetList.slice(0, insertAt), moved, ...targetList.slice(insertAt)];

  let result = [...rest, moved];
  result = renumberDayEvents(
    result,
    targetDay,
    targetList.map((e) => e.id)
  );

  if (sourceDay !== targetDay) {
    const sourceList = result
      .filter((e) => e.day === sourceDay && e.id !== eventId)
      .sort(compareEventOrder);
    result = renumberDayEvents(
      result,
      sourceDay,
      sourceList.map((e) => e.id)
    );
  }

  return result;
}

/** 为缺少 sortOrder 的事件按 day 分组补序号 */
export function normalizeEventSortOrders<T extends { day: number; sortOrder?: number; title: string }>(
  events: T[]
): (T & { sortOrder: number })[] {
  const byDay = new Map<number, T[]>();
  for (const e of events) {
    const list = byDay.get(e.day) ?? [];
    list.push(e);
    byDay.set(e.day, list);
  }

  const result: (T & { sortOrder: number })[] = [];
  for (const list of byDay.values()) {
    list.sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title, 'zh-CN')
    );
    list.forEach((e, i) => result.push({ ...e, sortOrder: e.sortOrder ?? i }));
  }
  return result;
}
