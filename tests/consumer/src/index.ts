import { createTreatyQuery, version } from "treaty-query";

const treatyQuery = createTreatyQuery<{ readonly consumer: true }>();

if (treatyQuery.phase !== "scaffold" || version !== "0.1.0") {
  throw new Error("The packed treaty-query package could not be consumed.");
}

console.log(`Consumed treaty-query ${version}`);
