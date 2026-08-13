import { treaty } from "@elysiajs/eden";
import { QueryClient } from "@tanstack/react-query";
import { Elysia, t } from "elysia";
import { createTreatyQuery, routeSegment, version } from "treaty-query";

const app = new Elysia()
  .get("/then", () => ({ escaped: true }))
  .get("/items/:id", ({ params }) => ({ id: params.id }))
  .post("/items", ({ body }) => ({ name: body.name }), {
    body: t.Object({ name: t.String() }),
  });

const client = treaty(app);
const tq = createTreatyQuery<typeof app>();
const helpers = tq.createHelpers({ client, cacheScope: ["user", "lower"] });
const queryClient = new QueryClient();

const escaped = await queryClient.fetchQuery(
  helpers[routeSegment]("then").get.queryOptions(),
);
const item = await queryClient.fetchQuery(
  helpers.items({ id: 7 }).get.queryOptions(),
);
const mutation = helpers.items.post.mutationOptions();
const created = await mutation.mutationFn(
  { name: "lower-bound" },
  { client: queryClient, meta: undefined, mutationKey: mutation.mutationKey },
);

if (!escaped.escaped || item.id !== "7" || created.name !== "lower-bound") {
  throw new Error("The lower-bound package consumer returned invalid data.");
}

queryClient.clear();
console.log(`Consumed treaty-query ${version} with lower-bound peers`);
process.exit(0);
