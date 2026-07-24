import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ManualQrInput from "./ManualQrInput";

describe("ManualQrInput", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("se muestra en desarrollo (import.meta.env.DEV)", () => {
    vi.stubEnv("DEV", true);
    render(<ManualQrInput onSubmitPayload={vi.fn()} />);

    expect(screen.getByRole("button", { name: /validar/i })).toBeInTheDocument();
  });

  it("no se muestra fuera de desarrollo", () => {
    vi.stubEnv("DEV", false);
    render(<ManualQrInput onSubmitPayload={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /validar/i })).not.toBeInTheDocument();
  });

  it("llama a onSubmitPayload con el valor pegado y limpia el campo", async () => {
    vi.stubEnv("DEV", true);
    const onSubmitPayload = vi.fn();
    const user = userEvent.setup();

    render(<ManualQrInput onSubmitPayload={onSubmitPayload} />);

    const input = screen.getByLabelText(/contenido del qr/i);
    await user.type(input, "pulse-ticket:v1:abc123");
    await user.click(screen.getByRole("button", { name: /validar/i }));

    expect(onSubmitPayload).toHaveBeenCalledWith("pulse-ticket:v1:abc123");
    expect(input).toHaveValue("");
  });

  it("no llama a onSubmitPayload con el campo vacío", async () => {
    vi.stubEnv("DEV", true);
    const onSubmitPayload = vi.fn();

    render(<ManualQrInput onSubmitPayload={onSubmitPayload} />);

    expect(screen.getByRole("button", { name: /validar/i })).toBeDisabled();
  });

  it("deshabilita el input y el botón cuando disabled es true", () => {
    vi.stubEnv("DEV", true);
    render(<ManualQrInput onSubmitPayload={vi.fn()} disabled />);

    expect(screen.getByLabelText(/contenido del qr/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /validar/i })).toBeDisabled();
  });
});
