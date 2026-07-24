import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import App from "./App";

describe("App", () => {
  it("renders the Pulse Event landing at the root route", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/viví el/i);
    expect(heading.textContent).toMatch(/momento/i);
    expect(screen.getByRole("link", { name: /reservar entrada/i })).toBeInTheDocument();
  });
});
