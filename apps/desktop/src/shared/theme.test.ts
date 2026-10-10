import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, initTheme, setTheme, storedTheme } from "./theme";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("theme", () => {
  it("is dark until the person chooses otherwise", () => {
    expect(storedTheme()).toBe("dark");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("remembers a choice and puts it on the page", () => {
    setTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(storedTheme()).toBe("light");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("ignores a stored value it does not know", () => {
    window.localStorage.setItem("strata-theme", "sepia");
    expect(storedTheme()).toBe("dark");
  });

  it("still works when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(storedTheme()).toBe("dark");
    setTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
