import { describe, expect, it } from "vitest";
import type { ZoteroSearchRow } from "../../../ipc/bindings";
import type { CitationSearchApi } from "./citationSearchApi";
import { fetchCitationSearch } from "./citationSearchApi";

const ROW: ZoteroSearchRow = {
  citekey: "z:u:7XK2PQ9M",
  title: "A Study of Widgets",
  creatorSummary: "Smith",
  itemType: "journalArticle",
};

function fakeApi(reply: unknown): CitationSearchApi {
  const api = { zoteroSearchItems: () => Promise.resolve(reply) };
  // The fake has the same shape as the generated command.
  return api as unknown as CitationSearchApi;
}

describe("fetchCitationSearch", () => {
  it("reports the matching rows on success", async () => {
    const api = fakeApi({ status: "ok", data: [ROW] });
    await expect(fetchCitationSearch(api, "widget")).resolves.toEqual({
      kind: "ok",
      rows: [ROW],
    });
  });

  it("reports ok with no rows when nothing matches", async () => {
    const api = fakeApi({ status: "ok", data: [] });
    await expect(fetchCitationSearch(api, "widget")).resolves.toEqual({
      kind: "ok",
      rows: [],
    });
  });

  it("reports notRunning and disabled from the command's typed error", async () => {
    const notRunning = fakeApi({
      status: "error",
      error: { kind: "notRunning" },
    });
    await expect(fetchCitationSearch(notRunning, "widget")).resolves.toEqual({
      kind: "notRunning",
    });

    const disabled = fakeApi({ status: "error", error: { kind: "disabled" } });
    await expect(fetchCitationSearch(disabled, "widget")).resolves.toEqual({
      kind: "disabled",
    });
  });

  it("reports error for any other failure", async () => {
    const api = fakeApi({ status: "error", error: { kind: "requestFailed" } });
    await expect(fetchCitationSearch(api, "widget")).resolves.toEqual({
      kind: "error",
    });
  });
});
