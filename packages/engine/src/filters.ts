import * as Schema from "effect/Schema";
import type { DimensionName } from "@opencode-stats/browser-copy";

export const filterDimensions = [
  "project",
  "provider",
  "model",
  "variant",
  "agent",
  "session",
] as const;
export const FilterDimension = Schema.Literals(filterDimensions);
export type FilterDimension = typeof FilterDimension.Type;
export const Filter = Schema.Struct({ dimension: FilterDimension, id: Schema.String });
export type Filter = typeof Filter.Type;
export const filterLabels: Record<FilterDimension, string> = {
  project: "Project",
  provider: "Provider",
  model: "Model",
  variant: "Variant",
  agent: "Agent",
  session: "Session",
};
export type CompiledFilters = readonly { dimension: FilterDimension; codes: ReadonlySet<number> }[];

export function parseFilters(address: string, baseUrl: string): readonly Filter[] {
  const params = new URL(address, baseUrl).searchParams;
  return filterDimensions.flatMap((dimension) =>
    [...new Set(params.getAll(`f.${dimension}`))].map((id) => ({ dimension, id })),
  );
}

export function filterAddress(address: string, filters: readonly Filter[]) {
  const params = new URLSearchParams(address.slice(address.indexOf("?") + 1));
  for (const filter of filters) params.append(`f.${filter.dimension}`, filter.id);
  return `/?${params}`;
}

export function compileFilters(
  filters: readonly Filter[],
  names: readonly DimensionName[],
): CompiledFilters {
  return filterDimensions
    .filter((dimension) => filters.some((filter) => filter.dimension === dimension))
    .map((dimension) => {
      const ids = new Set(
        filters.filter((filter) => filter.dimension === dimension).map((filter) => filter.id),
      );
      return {
        dimension,
        codes: new Set(
          names
            .filter((name) => name.dimension === dimension && ids.has(name.id))
            .map((name) => name.code),
        ),
      };
    });
}

export const matchesFilters = (
  fact: Readonly<Record<FilterDimension, number>>,
  filters: CompiledFilters,
  ignore?: FilterDimension,
) =>
  filters.every(
    (filter) => filter.dimension === ignore || filter.codes.has(fact[filter.dimension]),
  );

export function* matchingFacts<Fact extends Readonly<Record<FilterDimension, number>>>(
  facts: Iterable<Fact>,
  filters: CompiledFilters,
) {
  for (const fact of facts) if (matchesFilters(fact, filters)) yield fact;
}

export const removeFilter = (filters: readonly Filter[], filter: Filter): readonly Filter[] =>
  filters.filter((value) => value.dimension !== filter.dimension || value.id !== filter.id);

export const toggleFilter = (filters: readonly Filter[], filter: Filter): readonly Filter[] =>
  filters.some((value) => value.dimension === filter.dimension && value.id === filter.id)
    ? removeFilter(filters, filter)
    : [...filters, filter];

export const filterName = (filter: Filter, names: readonly DimensionName[]) =>
  names.find((name) => name.dimension === filter.dimension && name.id === filter.id)?.name ??
  filter.id;
