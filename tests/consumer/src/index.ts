import { treaty } from "@elysiajs/eden";
import { QueryClient } from "@tanstack/react-query";
import { Elysia } from "elysia";
import {
  createTreatyQuery,
  TreatyQueryError,
  version,
} from "treaty-query";

const app = new Elysia().get("/health", () => ({ ok: true }));
const client = treaty(app);
const tq = createTreatyQuery<typeof app>();
const helpers = tq.createHelpers({ client });
const options = helpers.health.get.queryOptions({ staleTime: 1_000 });
const queryClient = new QueryClient();
const data = await queryClient.fetchQuery(options);

if (!data.ok || version !== "0.1.0") {
  throw new Error("The packed treaty-query package returned invalid data.");
}

if (options.queryKey[0] !== "treaty-query") {
  throw new Error("The packed treaty-query package returned an invalid key.");
}

if (!(TreatyQueryError.prototype instanceof Error)) {
  throw new Error("The packed treaty-query error export is invalid.");
}

if (typeof tq.Provider !== "function" || typeof tq.health.get.useQuery !== "function") {
  throw new Error("The packed treaty-query React API is invalid.");
}

console.log(`Consumed treaty-query ${version} helpers and React API`);
