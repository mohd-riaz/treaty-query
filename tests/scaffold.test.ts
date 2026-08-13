import { describe, expect, test } from "bun:test";

import { createTreatyQuery, version } from "../src/index";

describe("package scaffold", () => {
  test("exports a typed root factory", () => {
    const treatyQuery = createTreatyQuery<{ readonly routes: true }>();

    expect(treatyQuery).toEqual({ phase: "scaffold" });
    expect(Object.isFrozen(treatyQuery)).toBe(true);
  });

  test("exports the package version", () => {
    expect(version).toBe("0.1.0");
  });
});
