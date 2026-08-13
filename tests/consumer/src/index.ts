import { treaty } from "@elysiajs/eden";
import { QueryClient } from "@tanstack/react-query";
import { Elysia, t } from "elysia";
import {
  createTreatyQuery,
  TreatyQueryError,
  type CacheScope,
  version,
} from "treaty-query";

const app = new Elysia()
  .get("/health", () => ({ ok: true }))
  .get("/search", ({ query }) => ({ term: query.term }), {
    query: t.Object({ term: t.String() }),
  })
  .get("/products/:id", ({ params }) => ({ id: params.id }))
  .post(
    "/products",
    ({ body }) => ({ id: "created-1", name: body.name, price: body.price }),
    {
      body: t.Object({ name: t.String(), price: t.Number() }),
    },
  );
const client = treaty(app);
const tq = createTreatyQuery<typeof app>();
const helpers = tq.createHelpers({ client });
const scope: CacheScope = ["user", { id: "consumer-user" }];
const scopedHelpers = tq.createHelpers({ client, cacheScope: scope });
const queryClient = new QueryClient();

const health = await queryClient.fetchQuery(
  helpers.health.get.queryOptions(undefined, { staleTime: 1_000 }),
);
const search = await queryClient.fetchQuery(
  helpers.search.get.queryOptions({ query: { term: "coffee" } }),
);
const productOptions = helpers.products({ id: 42 }).get.queryOptions();
const scopedHealthOptions = scopedHelpers.health.get.queryOptions();
const product = await queryClient.fetchQuery(productOptions);
const mutationOptions = helpers.products.post.mutationOptions();
const created = await mutationOptions.mutationFn(
  { name: "Latte", price: 20 },
  {
    client: queryClient,
    meta: undefined,
    mutationKey: mutationOptions.mutationKey,
  },
);

if (
  !health.ok ||
  search.term !== "coffee" ||
  product.id !== "42" ||
  created.id !== "created-1"
) {
  throw new Error("The packed treaty-query package returned invalid data.");
}

if (
  version !== "0.1.0" ||
  productOptions.queryKey[0] !== "treaty-query" ||
  JSON.stringify(scopedHealthOptions.queryKey[1]) !==
    JSON.stringify(["scope", ["user", { id: "consumer-user" }]])
) {
  throw new Error("The packed treaty-query package returned invalid metadata.");
}

if (!(TreatyQueryError.prototype instanceof Error)) {
  throw new Error("The packed treaty-query error export is invalid.");
}

if (
  typeof tq.Provider !== "function" ||
  typeof tq.CacheScope !== "function" ||
  typeof tq.useUtils !== "function" ||
  typeof tq.search.get.useQuery !== "function" ||
  typeof tq.products({ id: 1 }).get.useQuery !== "function" ||
  typeof tq.products.post.useMutation !== "function"
) {
  throw new Error("The packed treaty-query React API is invalid.");
}

console.log(`Consumed treaty-query ${version} Phase 6 API`);
