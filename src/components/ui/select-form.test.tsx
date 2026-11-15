import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

/**
 * The quest form submits through a server action, so its selects must take
 * part in the `<form>` like a native control. Base UI does that with a hidden
 * input when `name` is set; this pins it, because a select that silently
 * submits nothing would arrive at the server as a validation error with no
 * obvious cause.
 */
describe("Select inside a form", () => {
  it("submits its value under its name", () => {
    const { container } = render(
      <form>
        <Select
          name="type"
          defaultValue="TESTIMONIAL"
          items={[
            { value: "REFERENCE_CALL", label: "Reference call" },
            { value: "TESTIMONIAL", label: "Testimonial" },
          ]}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="REFERENCE_CALL">Reference call</SelectItem>
            <SelectItem value="TESTIMONIAL">Testimonial</SelectItem>
          </SelectContent>
        </Select>
      </form>,
    );

    const form = container.querySelector("form")!;
    expect(new FormData(form).get("type")).toBe("TESTIMONIAL");
    // And it shows the label, not the enum value.
    expect(container.textContent).toContain("Testimonial");
    expect(container.textContent).not.toContain("TESTIMONIAL");
  });
});
