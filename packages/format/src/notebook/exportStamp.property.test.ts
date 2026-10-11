import fc from "fast-check";
import { describe, it } from "vitest";
import { EXPORT_STAMP, exportStamp } from "./exportStamp";

describe("exportStamp properties (issue #102)", () => {
  it("is always the shape the filesystem helper accepts", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("2000-01-01T00:00:00Z"),
          max: new Date("2099-12-31T23:59:59Z"),
          noInvalidDate: true,
        }),
        (date) => EXPORT_STAMP.test(exportStamp(date)),
      ),
    );
  });
});
