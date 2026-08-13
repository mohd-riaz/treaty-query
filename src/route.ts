export type RouteParameters = Readonly<Record<string, string | number>>;

export const routeSegment: unique symbol = Symbol("treaty-query.route-segment");

export interface RouteParameterSegment {
  readonly kind: "parameters";
  readonly value: RouteParameters;
}

export interface EscapedRouteSegment {
  readonly kind: "escaped";
  readonly value: string;
}

export type RouteSegment = string | EscapedRouteSegment | RouteParameterSegment;

export type TreatyHttpMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete";

export function appendRouteProperty(
  route: readonly RouteSegment[],
  property: string,
): readonly RouteSegment[] {
  return Object.freeze([...route, property]);
}

export function appendEscapedRouteProperty(
  route: readonly RouteSegment[],
  property: string,
): readonly RouteSegment[] {
  return Object.freeze([
    ...route,
    Object.freeze({ kind: "escaped" as const, value: property }),
  ]);
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

    if (segment.kind === "escaped") {
      if (
        route[0] === segment &&
        (segment.value === "then" ||
          segment.value === "catch" ||
          segment.value === "finally")
      ) {
        if (typeof node !== "function") {
          throw new TypeError("Treaty root route is not callable.");
        }

        node = (node as (parameters: RouteParameters) => unknown)({
          __treatyQueryRouteSegment: segment.value,
        });
      } else {
        node = (node as Record<string, unknown>)[segment.value];
      }

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
  method: TreatyHttpMethod,
): unknown {
  const node = resolveRouteNode(client, route);
  return (node as Record<string, unknown>)[method];
}
