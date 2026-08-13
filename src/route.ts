export type RouteParameters = Readonly<Record<string, string | number>>;

export interface RouteParameterSegment {
  readonly kind: "parameters";
  readonly value: RouteParameters;
}

export type RouteSegment = string | RouteParameterSegment;

export function appendRouteProperty(
  route: readonly RouteSegment[],
  property: string,
): readonly RouteSegment[] {
  return Object.freeze([...route, property]);
}

export function appendRouteParameters(
  route: readonly RouteSegment[],
  parameters: RouteParameters,
): readonly RouteSegment[] {
  return Object.freeze([
    ...route,
    Object.freeze({
      kind: "parameters" as const,
      value: Object.freeze({ ...parameters }),
    }),
  ]);
}

export function resolveRouteNode(
  client: unknown,
  route: readonly RouteSegment[],
): unknown {
  let node = client;

  for (const segment of route) {
    if (typeof segment === "string") {
      node = (node as Record<string, unknown>)[segment];
      continue;
    }

    if (typeof node !== "function") {
      throw new TypeError("Treaty dynamic route is not callable.");
    }

    node = (node as (parameters: RouteParameters) => unknown)(segment.value);
  }

  return node;
}

export function resolveRouteMethod(
  client: unknown,
  route: readonly RouteSegment[],
  method: "get",
): unknown {
  const node = resolveRouteNode(client, route);
  return (node as Record<string, unknown>)[method];
}
