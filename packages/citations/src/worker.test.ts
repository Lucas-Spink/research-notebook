import { describe, expect, it } from "vitest";
import { EN_US_LOCALE, NUMERIC_STYLE } from "./bundled";
import { renderLiterature, type LiteratureInput } from "./literature";
import { createLiteratureClient } from "./worker-client";
import { attachLiteratureWorker } from "./worker-protocol";

/**
 * ADR-0012: the postMessage boundary, exercised over a real structured-clone
 * channel (a `MessageChannel`), so a message that could not cross a Worker
 * fails here. The Worker constructor itself is checked in the webview.
 */

const input: LiteratureInput = {
  clusters: [
    {
      items: [
        {
          prefix: "",
          suppressAuthor: false,
          citekey: "z:u:SMIT2222",
          suffix: "",
        },
      ],
    },
  ],
  items: [
    {
      id: "z:u:SMIT2222",
      type: "book",
      title: "Widgets",
      author: [{ family: "Smith", given: "Jane" }],
      issued: { "date-parts": [[2020]] },
    },
  ],
  styleXml: NUMERIC_STYLE,
  localeXml: EN_US_LOCALE,
};

function connected() {
  const { port1, port2 } = new MessageChannel();
  attachLiteratureWorker(port1);
  const client = createLiteratureClient(port2);
  return { client, close: () => (port1.close(), port2.close()) };
}

describe("the Literature worker boundary", () => {
  it("returns exactly what renderLiterature returns in-process", async () => {
    const { client, close } = connected();
    expect(await client.render(input)).toEqual(renderLiterature(input));
    close();
  });

  it("answers overlapping requests each with its own result", async () => {
    const { client, close } = connected();
    const other: LiteratureInput = { ...input, clusters: [] };
    const [a, b] = await Promise.all([
      client.render(input),
      client.render(other),
    ]);
    expect(a.ok && a.value.entries).toHaveLength(1);
    expect(b.ok && b.value.entries).toHaveLength(0);
    close();
  });

  it("reports a style error as a result, and the worker keeps answering", async () => {
    const { client, close } = connected();
    expect((await client.render({ ...input, styleXml: "<nope" })).ok).toBe(
      false,
    );
    expect((await client.render(input)).ok).toBe(true);
    close();
  });

  it("rejects pending requests when the worker is terminated", async () => {
    const { port1, port2 } = new MessageChannel();
    const client = createLiteratureClient(port2); // nothing attached: never answers
    const pending = client.render(input);
    client.dispose();
    await expect(pending).rejects.toThrow();
    port1.close();
  });
});
