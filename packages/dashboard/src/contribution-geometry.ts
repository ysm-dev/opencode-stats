import {
  addDates,
  calendarRange,
  dateCount,
  dateLabel,
  type ContributionGraph,
  type CalendarUnit,
} from "@opencode-stats/engine";

export const graphRow = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
export const weekNumber = (date: string) => {
  const thursday = addDates(date, 3 - graphRow(date));
  const start = `${thursday.slice(0, 4)}-01-04`;
  return Math.floor((dateCount(calendarRange(start, "week").from, thursday) - 1) / 7) + 1;
};
export function graphGeometry(days: ContributionGraph["days"]) {
  const start = calendarRange(days[0]!.date, "week").from;
  const column = (date: string) => Math.floor((dateCount(start, date) - 1) / 7);
  const columns = column(days.at(-1)!.date) + 1;
  const months = [...new Set(days.map((day) => day.date.slice(0, 7)))].map((month) => {
    const visible = days.filter((day) => day.date.startsWith(month));
    const first = visible[0]!.date;
    const last = visible.at(-1)!.date;
    return {
      date: first,
      x: (column(first) + column(last) + 1) * 8,
      label: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(
        new Date(first),
      ),
    };
  });
  const weeks = Array.from({ length: columns }, (_, index) => {
    const date = days.find((day) => column(day.date) === index)!.date;
    return { date, x: index * 16 + 8, label: weekNumber(date) };
  });
  const points = [
    ...days.map((day) => ({
      date: day.date,
      unit: "day" as const,
      x: column(day.date) * 16 + 8,
      y: graphRow(day.date) * 16 + 40,
    })),
    ...months.map((month) => ({ ...month, unit: "month" as const, y: 12 })),
    ...weeks.map((week) => ({ ...week, unit: "week" as const, y: 160 })),
  ];
  const nearest = (x: number, y: number): { date: string; unit: CalendarUnit } =>
    points.reduce((best, point) =>
      Math.hypot(point.x - x, point.y - y) < Math.hypot(best.x - x, best.y - y) ? point : best,
    );
  return { column, columns, months, weeks, nearest };
}
export const readingLabel = (date: string) =>
  `${new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(date))}, ${dateLabel(date, navigator.language)}`;
export const monthName = (date: string) =>
  new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(date));
