import assert from "node:assert/strict";
import test from "node:test";
import {
  GUESTS_DATA,
  getGuestInfo,
  getGuestRouteAliases,
} from "../src/utils/guests.ts";

test("normalizes accented names without producing malformed aliases", () => {
  assert.deepEqual(getGuestRouteAliases("Lara Española"), [
    "lara-espanola",
    "laraespanola",
  ]);
});

test("deduplicates aliases case-insensitively", () => {
  const aliases = getGuestRouteAliases("JV Esoy");
  assert.equal(
    new Set(aliases.map((alias) => alias.toLowerCase())).size,
    aliases.length,
  );
  assert.deepEqual(aliases, ["jv-esoy", "jvesoy"]);
});

test("resolves every canonical roster name to its declared role", () => {
  for (const [role, names] of Object.entries(GUESTS_DATA)) {
    for (const name of names) {
      const guest = getGuestInfo(name);
      assert.equal(guest.rawName, name);
      assert.equal(guest.role, role);
    }
  }
});
