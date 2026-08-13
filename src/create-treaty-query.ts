/**
 * Temporary Phase 1 return value used to verify the package boundary.
 * Functional Treaty and TanStack Query bindings arrive in later phases.
 */
export interface TreatyQueryScaffold {
  readonly phase: "scaffold";
}

const scaffold: TreatyQueryScaffold = Object.freeze({ phase: "scaffold" });

/**
 * Creates the root Treaty Query API.
 *
 * Phase 1 intentionally returns only a package scaffold. The generic parameter
 * reserves the eventual application type without executing requests or
 * constructing the route proxy yet.
 */
export function createTreatyQuery<TApp = unknown>(): TreatyQueryScaffold {
  return scaffold;
}
