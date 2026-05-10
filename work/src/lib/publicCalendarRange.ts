import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "date-fns";

export type PublicCalendarScope = "day" | "week" | "month" | "quarter" | "year";

/** Диапазон загрузки записей и time-off для текущего режима календаря. */
export function getCalendarDataRange(
  scope: PublicCalendarScope,
  viewMonth: Date,
  selectedDay: Date,
): { from: Date; to: Date } {
  switch (scope) {
    case "day":
      return { from: startOfDay(selectedDay), to: endOfDay(selectedDay) };
    case "week": {
      const a = startOfWeek(selectedDay, { weekStartsOn: 1 });
      const b = endOfWeek(selectedDay, { weekStartsOn: 1 });
      return { from: startOfDay(a), to: endOfDay(b) };
    }
    case "month":
      return {
        from: startOfDay(startOfMonth(viewMonth)),
        to: endOfDay(endOfMonth(viewMonth)),
      };
    case "quarter":
      return {
        from: startOfDay(startOfQuarter(viewMonth)),
        to: endOfDay(endOfQuarter(viewMonth)),
      };
    case "year":
      return {
        from: startOfDay(startOfYear(viewMonth)),
        to: endOfDay(endOfYear(viewMonth)),
      };
  }
}

export function eachDayInDataRange(
  scope: PublicCalendarScope,
  viewMonth: Date,
  selectedDay: Date,
): Date[] {
  const { from, to } = getCalendarDataRange(scope, viewMonth, selectedDay);
  return eachDayOfInterval({ start: from, end: to });
}
