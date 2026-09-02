import { describe, expect, test } from "bun:test";

import {
  requireOwnedIconId,
} from "../../src/ui/primitives/Icon";
import { UI_OWNED_ICON_IDS } from "../../src/ui/ui-contract";
import { UiContractError } from "../../src/ui/primitives/validation";

describe("U0 source-owned icon identities", () => {
  test("accepts every reviewed identity and refuses an unknown icon", () => {
    expect(UI_OWNED_ICON_IDS).toContain("aim");
    expect(UI_OWNED_ICON_IDS).toContain("insert");
    expect(UI_OWNED_ICON_IDS).toContain("split");

    for (const iconId of UI_OWNED_ICON_IDS) {
      expect(() => {
        requireOwnedIconId("icon-owner", ["iconId"], iconId);
      }).not.toThrow();
    }

    try {
      requireOwnedIconId("icon-owner", ["iconId"], "invented-fallback");
      throw new Error("Expected an unknown icon identity to refuse.");
    } catch (error) {
      expect(error).toBeInstanceOf(UiContractError);
      if (error instanceof UiContractError) {
        expect(error.diagnostic.code).toBe("ui.value_malformed");
        expect(error.diagnostic.path).toEqual(["iconId"]);
      }
    }
  });
});
