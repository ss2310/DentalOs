// Tests the ENABLE_MULTI_VERTICAL truth table (lib/multi-vertical-flag.mjs).
//   node --test scripts/test-multi-vertical-flag.mjs   (or: npm test)

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMultiVerticalFlag } from "../lib/multi-vertical-flag.mjs";

test("default / unset / empty / falsey values are OFF (production default)", () => {
  for (const v of [undefined, null, "", "  ", "false", "0", "off", "no", "FALSE", "nope", "2"]) {
    assert.equal(parseMultiVerticalFlag(v), false, JSON.stringify(v));
  }
});

test("explicit truthy values are ON", () => {
  for (const v of ["true", "1", "on", "yes", "TRUE", " On ", "YES"]) {
    assert.equal(parseMultiVerticalFlag(v), true, JSON.stringify(v));
  }
});
