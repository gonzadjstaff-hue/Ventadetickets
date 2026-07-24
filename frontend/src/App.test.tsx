import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import App from "./App";

function renderApp() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App", () => {
  it("renders the Pulse Event landing at the root route", () => {
    renderApp();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/viví el/i);
    expect(heading.textContent).toMatch(/momento/i);
    expect(screen.getByRole("link", { name: /reservar entrada/i })).toBeInTheDocument();
  });
});
