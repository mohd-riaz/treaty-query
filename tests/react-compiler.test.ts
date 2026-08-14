import { describe, expect, test } from "bun:test";
import { transformSync } from "@babel/core";
import reactCompiler from "babel-plugin-react-compiler";

interface CompilerEvent {
  readonly kind?: string;
  readonly detail?: {
    readonly reason?: string;
  };
}

function compileComponent(source: string): {
  readonly code: string;
  readonly events: readonly CompilerEvent[];
} {
  const events: CompilerEvent[] = [];
  const result = transformSync(source, {
    filename: "treaty-query-react-compiler.jsx",
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ["jsx"] },
    plugins: [[reactCompiler, {
      target: "19",
      panicThreshold: "none",
      logger: {
        logEvent(_filename: string | null, event: CompilerEvent): void {
          events.push(event);
        },
      },
    }]],
  });

  return {
    code: result?.code ?? "",
    events,
  };
}

describe("React Compiler compatibility", () => {
  test.each([
    [
      "static query",
      `
        import { tq } from "./client";
        export function Component() {
          const query = tq.account.access.get.useQuery();
          return <div>{query.data ?? null}</div>;
        }
      `,
    ],
    [
      "static mutation",
      `
        import { tq } from "./client";
        export function Component() {
          const mutation = tq.products.post.useMutation();
          return <div>{mutation.status}</div>;
        }
      `,
    ],
    [
      "dynamic query parameter markers",
      `
        import { tq } from "./client";
        export function Component({ organizationId, orderId }) {
          const query = tq.organizations.$organizationId.orders.$orderId.get.useQuery({
            params: { organizationId, orderId },
          }, {
            queryKey: ["orders", organizationId, orderId],
          });
          return <div>{query.data ?? null}</div>;
        }
      `,
    ],
    [
      "dynamic mutation parameter markers",
      `
        import { tq } from "./client";
        export function Component({ id }) {
          const mutation = tq.products.$id.patch.useMutation({
            params: { id },
            mutationKey: ["update-product", id],
          });
          return <div>{mutation.status}</div>;
        }
      `,
    ],
  ])("compiles %s hooks", (_name, source) => {
    const result = compileComponent(source);
    const errors = result.events.filter((event) => event.kind === "CompileError");

    expect(errors).toEqual([]);
    expect(
      result.events.some((event) => event.kind === "CompileSuccess"),
    ).toBe(true);
    expect(result.code).toContain("react/compiler-runtime");
  });

  test("documents why legacy render-time route calls are not compiler-safe", () => {
    const result = compileComponent(`
      import { tq } from "./client";
      export function Component({ id }) {
        const mutation = tq.products({ id }).patch.useMutation();
        return <div>{mutation.status}</div>;
      }
    `);
    const reasons = result.events
      .filter((event) => event.kind === "CompileError")
      .map((event) => event.detail?.reason ?? "");

    expect(reasons.some((reason) =>
      reason.includes("Hooks must be the same function on every render")
    )).toBe(true);
  });
});
