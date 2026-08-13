import { expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { Elysia, t } from "elysia";

import { createTreatyQuery } from "../src/index";

test("creates route-bound query options with modest overhead", () => {
  let calls = 0;
  const app = new Elysia().get(
    "/organizations/:organizationId/items/:itemId",
    () => {
      calls += 1;
      return { ok: true };
    },
    { query: t.Object({ page: t.Number() }) },
  );
  const helpers = createTreatyQuery<typeof app>().createHelpers({
    client: treaty(app),
  });

  const iterations = 20_000;
  const startedAt = performance.now();
  let lastKey: readonly unknown[] | undefined;

  for (let index = 0; index < iterations; index += 1) {
    lastKey = helpers
      .organizations({ organizationId: `org-${index % 10}` })
      .items({ itemId: index })
      .get.queryOptions({ query: { page: index % 5 } })
      .queryKey;
  }

  const elapsed = performance.now() - startedAt;
  expect(calls).toBe(0);
  expect(lastKey?.[0]).toBe("treaty-query");
  expect(elapsed).toBeLessThan(5_000);
});
