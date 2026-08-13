import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { QueryClient } from "@tanstack/react-query";
import { Elysia, t } from "elysia";

import { createTreatyQuery, TreatyQueryError } from "../src/index";

let mutationCalls = 0;

const app = new Elysia()
  .post(
    "/products",
    ({ body, headers, query }) => {
      mutationCalls += 1;
      return {
        id: "product-1",
        name: body.name,
        price: body.price,
        notify: query.notify ?? false,
        operationId: headers["x-operation-id"] ?? null,
      };
    },
    {
      body: t.Object({
        name: t.String(),
        price: t.Number(),
      }),
      query: t.Object({
        notify: t.Optional(t.Boolean()),
      }),
    },
  )
  .put(
    "/products/:id",
    ({ body, params }) => ({
      id: params.id,
      method: "PUT" as const,
      name: body.name,
      price: body.price,
    }),
    {
      body: t.Object({ name: t.String(), price: t.Number() }),
    },
  )
  .patch(
    "/products/:id",
    ({ body, params }) => ({
      id: params.id,
      method: "PATCH" as const,
      name: body.name,
    }),
    {
      body: t.Object({ name: t.String() }),
    },
  )
  .delete(
    "/products/:id",
    ({ body, params }) => ({
      id: params.id,
      method: "DELETE" as const,
      reason: body.reason,
    }),
    {
      body: t.Object({ reason: t.String() }),
    },
  )
  .post(
    "/jobs",
    ({ body, query }) => ({ task: body.task, notify: query.notify }),
    {
      body: t.Object({ task: t.String() }),
      query: t.Object({ notify: t.Boolean() }),
    },
  )
  .post(
    "/denied",
    ({ status }) => status(409, { code: "CONFLICT" as const }),
    {
      body: t.Object({ value: t.String() }),
      response: {
        409: t.Object({ code: t.Literal("CONFLICT") }),
      },
    },
  );

const client = treaty(app);
const tq = createTreatyQuery<typeof app>();
const helpers = tq.createHelpers({ client });

function createMutationContext(mutationKey: readonly unknown[]) {
  return {
    client: new QueryClient(),
    meta: undefined,
    mutationKey,
  };
}

describe("mutation option factories", () => {
  test("creates a lazy POST mutation whose variables are the body", async () => {
    mutationCalls = 0;
    const options = helpers.products.post.mutationOptions();

    expect(mutationCalls).toBe(0);
    expect(options.mutationKey).toEqual([
      "treaty-query",
      ["products"],
      { kind: "mutation", method: "POST" },
    ]);

    const data = await options.mutationFn(
      { name: "Latte", price: 20 },
      createMutationContext(options.mutationKey),
    );

    expect(data).toEqual({
      id: "product-1",
      name: "Latte",
      price: 20,
      notify: false,
      operationId: null,
    });
    expect(mutationCalls).toBe(1);

    if (false) {
      // @ts-expect-error The mutation body requires price.
      options.mutationFn({ name: "Latte" }, createMutationContext([]));
      // @ts-expect-error Static request configuration is not part of variables.
      options.mutationFn({ body: { name: "Latte", price: 20 } }, createMutationContext([]));
    }
  });

  test("binds query, headers, and fetch while excluding transport data from the key", async () => {
    const controller = new AbortController();
    const options = helpers.products.post.mutationOptions({
      request: {
        query: { notify: true },
        headers: { "x-operation-id": "operation-1" },
        fetch: { signal: controller.signal },
      },
      retry: 1,
    });

    expect(options.mutationKey).toEqual([
      "treaty-query",
      ["products"],
      {
        kind: "mutation",
        method: "POST",
        input: { query: { notify: true } },
      },
    ]);
    expect("request" in options).toBe(false);
    expect(options.retry).toBe(1);

    const data = await options.mutationFn(
      { name: "Tea", price: 12 },
      createMutationContext(options.mutationKey),
    );

    expect(data.notify).toBe(true);
    expect(data.operationId).toBe("operation-1");
  });

  test("forwards method, body, query, headers, and fetch to a remote Treaty client", async () => {
    let receivedBody = "";
    let receivedCredentials: RequestCredentials | undefined;
    let receivedHeaders: Headers | undefined;
    let receivedMethod = "";
    let receivedSignal: AbortSignal | null | undefined;
    let receivedUrl = "";
    const controller = new AbortController();
    const remoteClient = treaty<typeof app>("https://example.test", {
      fetcher: (async (input, init) => {
        receivedBody = String(init?.body);
        receivedCredentials = init?.credentials;
        receivedHeaders = new Headers(init?.headers);
        receivedMethod = init?.method ?? "";
        receivedSignal = init?.signal;
        receivedUrl = String(input);

        return Response.json({
          id: "remote-1",
          name: "Remote",
          price: 30,
          notify: true,
          operationId: "remote-operation",
        });
      }) as typeof fetch,
    });
    const remoteHelpers = tq.createHelpers({ client: remoteClient });
    const options = remoteHelpers.products.post.mutationOptions({
      request: {
        query: { notify: true },
        headers: { "x-operation-id": "remote-operation" },
        fetch: {
          credentials: "include",
          signal: controller.signal,
        },
      },
    });

    await options.mutationFn(
      { name: "Remote", price: 30 },
      createMutationContext(options.mutationKey),
    );

    expect(receivedMethod).toBe("POST");
    expect(receivedUrl).toBe("https://example.test/products?notify=true");
    expect(JSON.parse(receivedBody)).toEqual({ name: "Remote", price: 30 });
    expect(receivedHeaders?.get("x-operation-id")).toBe("remote-operation");
    expect(receivedCredentials).toBe("include");
    expect(receivedSignal).toBe(controller.signal);
  });

  test("requires declared mutation query parameters in the bound request", async () => {
    const options = helpers.jobs.post.mutationOptions({
      request: { query: { notify: true } },
    });

    expect(
      await options.mutationFn(
        { task: "sync" },
        createMutationContext(options.mutationKey),
      ),
    ).toEqual({ task: "sync", notify: true });

    if (false) {
      // @ts-expect-error This mutation has required query parameters.
      helpers.jobs.post.mutationOptions();
      // @ts-expect-error The required query field is notify.
      helpers.jobs.post.mutationOptions({ request: { query: {} } });
    }
  });

  test("supports PUT, PATCH, and DELETE on dynamic routes", async () => {
    const route = helpers.products({ id: 42 });
    const put = route.put.mutationOptions();
    const patch = route.patch.mutationOptions();
    const remove = route.delete.mutationOptions();

    expect(put.mutationKey).toEqual([
      "treaty-query",
      ["products", ["$params", [["id", "42"]]]],
      { kind: "mutation", method: "PUT" },
    ]);
    expect(patch.mutationKey.at(-1)).toEqual({
      kind: "mutation",
      method: "PATCH",
    });
    expect(remove.mutationKey.at(-1)).toEqual({
      kind: "mutation",
      method: "DELETE",
    });

    expect(
      await put.mutationFn(
        { name: "Updated", price: 25 },
        createMutationContext(put.mutationKey),
      ),
    ).toEqual({
      id: "42",
      method: "PUT",
      name: "Updated",
      price: 25,
    });
    expect(
      await patch.mutationFn(
        { name: "Patched" },
        createMutationContext(patch.mutationKey),
      ),
    ).toEqual({ id: "42", method: "PATCH", name: "Patched" });
    expect(
      await remove.mutationFn(
        { reason: "duplicate" },
        createMutationContext(remove.mutationKey),
      ),
    ).toEqual({ id: "42", method: "DELETE", reason: "duplicate" });
  });

  test("throws typed TreatyQueryError values for mutation failures", async () => {
    const options = helpers.denied.post.mutationOptions();

    try {
      await options.mutationFn(
        { value: "conflict" },
        createMutationContext(options.mutationKey),
      );
      throw new Error("Expected mutation failure.");
    } catch (error) {
      expect(error).toBeInstanceOf(TreatyQueryError);

      if (!(error instanceof TreatyQueryError)) throw error;

      expect(error.status).toBe(409);
      expect(error.value).toEqual({ code: "CONFLICT" });
      expect(error.response).toBeInstanceOf(Response);
    }
  });

  test("overrides a globally throwing Treaty client for structured mutation errors", async () => {
    const remoteClient = treaty<typeof app>("https://example.test", {
      throwHttpError: true,
      fetcher: (async () =>
        Response.json(
          { code: "CONFLICT" },
          { status: 409 },
        )) as unknown as typeof fetch,
    });
    const remoteHelpers = tq.createHelpers({ client: remoteClient });
    const options = remoteHelpers.denied.post.mutationOptions();

    try {
      await options.mutationFn(
        { value: "conflict" },
        createMutationContext(options.mutationKey),
      );
      throw new Error("Expected mutation failure.");
    } catch (error) {
      expect(error).toBeInstanceOf(TreatyQueryError);

      if (!(error instanceof TreatyQueryError)) throw error;

      expect(error.status).toBe(409);
      expect(error.value).toEqual({ code: "CONFLICT" });
    }
  });

  test("preserves callback inference for result, body, and onMutate value", () => {
    helpers.products.post.mutationOptions({
      onMutate(body) {
        const name: string = body.name;
        return { previousName: name };
      },
      onSuccess(data, body, onMutateResult) {
        const id: string = data.id;
        const price: number = body.price;
        const previousName: string | undefined = onMutateResult?.previousName;

        expect(id).toBeDefined();
        expect(price).toBeDefined();
        expect(previousName).toBeDefined();
      },
    });

    expect(true).toBe(true);
  });
});
