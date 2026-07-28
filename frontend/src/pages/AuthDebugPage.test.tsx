import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import AuthDebugPage from "./AuthDebugPage";

/**
 * Aislado por completo de servicios externos: ni el SDK de Firebase ni el
 * backend real se tocan. Se mockea `features/auth/authService` (login/logout/
 * ID Token) y `api/auth` (GET /api/auth/me) enteros.
 */
const { subscribeToAuthStateMock, loginWithEmailMock, logoutMock, getIdTokenMock, getMeMock } = vi.hoisted(() => ({
  subscribeToAuthStateMock: vi.fn(),
  loginWithEmailMock: vi.fn(),
  logoutMock: vi.fn(),
  getIdTokenMock: vi.fn(),
  getMeMock: vi.fn(),
}));

vi.mock("../features/auth/authService", () => ({
  subscribeToAuthState: subscribeToAuthStateMock,
  loginWithEmail: loginWithEmailMock,
  logout: logoutMock,
  getIdToken: getIdTokenMock,
  mapFirebaseAuthError: () => "Email o contraseña incorrectos.",
}));

vi.mock("../api/auth", () => ({
  getMe: getMeMock,
}));

const FAKE_USER = { uid: "uid-1", email: "admin@test.local" };
const FAKE_ME_RESPONSE = {
  user: { id: "user-1", firebaseUid: "uid-1", email: "admin@test.local", role: "ADMIN", status: "ACTIVE" },
};

async function submitLoginForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email/i), "admin@test.local");
  await user.type(screen.getByLabelText(/contraseña/i), "secret123");
  await user.click(screen.getByRole("button", { name: /ingresar/i }));
}

describe("AuthDebugPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sin sesión: muestra el formulario de login", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(null);
      return () => {};
    });

    render(<AuthDebugPage />);

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
  });

  it("login exitoso: llama a loginWithEmail y, tras autenticar, consulta GET /api/auth/me con el Bearer token", async () => {
    let emitUser: ((user: unknown) => void) | undefined;
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      emitUser = callback;
      callback(null);
      return () => {};
    });
    loginWithEmailMock.mockImplementation(async () => {
      emitUser?.(FAKE_USER);
      return FAKE_USER;
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    getMeMock.mockResolvedValue(FAKE_ME_RESPONSE);

    const user = userEvent.setup();
    render(<AuthDebugPage />);
    await screen.findByLabelText(/email/i);

    await submitLoginForm(user);

    expect(loginWithEmailMock).toHaveBeenCalledWith("admin@test.local", "secret123");
    expect(await screen.findByText("ADMIN")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(getMeMock).toHaveBeenCalledWith("id-token-abc");
  });

  it("error de login: muestra un mensaje claro y nunca llama a GET /api/auth/me", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(null);
      return () => {};
    });
    loginWithEmailMock.mockRejectedValue(Object.assign(new Error("wrong password"), { code: "auth/wrong-password" }));

    const user = userEvent.setup();
    render(<AuthDebugPage />);
    await screen.findByLabelText(/email/i);

    await submitLoginForm(user);

    expect(await screen.findByText(/email o contraseña incorrectos/i)).toBeInTheDocument();
    expect(getMeMock).not.toHaveBeenCalled();
  });

  it("error 401 del backend en GET /api/auth/me: muestra el mensaje de error sin romper la pantalla", async () => {
    let emitUser: ((user: unknown) => void) | undefined;
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      emitUser = callback;
      callback(null);
      return () => {};
    });
    loginWithEmailMock.mockImplementation(async () => {
      emitUser?.(FAKE_USER);
      return FAKE_USER;
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    getMeMock.mockRejectedValue(new ApiError(401, "No autorizado.", "UNAUTHORIZED"));

    const user = userEvent.setup();
    render(<AuthDebugPage />);
    await screen.findByLabelText(/email/i);

    await submitLoginForm(user);

    expect(await screen.findByText("No autorizado.")).toBeInTheDocument();
  });

  it("logout: llama al servicio de logout y vuelve a mostrar el formulario de login", async () => {
    let emitUser: ((user: unknown) => void) | undefined;
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      emitUser = callback;
      callback(FAKE_USER);
      return () => {};
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    getMeMock.mockResolvedValue(FAKE_ME_RESPONSE);
    logoutMock.mockImplementation(async () => {
      emitUser?.(null);
    });

    const user = userEvent.setup();
    render(<AuthDebugPage />);
    await screen.findByText("ADMIN");

    await user.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });

  it("nunca muestra el ID Token en pantalla", async () => {
    let emitUser: ((user: unknown) => void) | undefined;
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      emitUser = callback;
      callback(null);
      return () => {};
    });
    loginWithEmailMock.mockImplementation(async () => {
      emitUser?.(FAKE_USER);
      return FAKE_USER;
    });
    getIdTokenMock.mockResolvedValue("token-super-secreto-xyz");
    getMeMock.mockResolvedValue(FAKE_ME_RESPONSE);

    const user = userEvent.setup();
    render(<AuthDebugPage />);
    await screen.findByLabelText(/email/i);
    await submitLoginForm(user);
    await screen.findByText("ADMIN");

    expect(document.body.textContent).not.toContain("token-super-secreto-xyz");
  });
});
