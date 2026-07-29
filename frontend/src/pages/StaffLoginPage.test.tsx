import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { ApiError } from "../api/client";
import { AuthProvider } from "../features/auth/AuthContext";
import StaffLoginPage from "./StaffLoginPage";

/**
 * Aislado por completo de servicios externos: ni el SDK de Firebase ni el
 * backend real se tocan. Se mockea `features/auth/authService` (login/logout/
 * ID Token) y `api/auth` (createSession) enteros.
 */
const { subscribeToAuthStateMock, loginWithEmailMock, logoutMock, getIdTokenMock, createSessionMock } = vi.hoisted(() => ({
  subscribeToAuthStateMock: vi.fn(),
  loginWithEmailMock: vi.fn(),
  logoutMock: vi.fn(),
  getIdTokenMock: vi.fn(),
  createSessionMock: vi.fn(),
}));

vi.mock("../features/auth/authService", () => ({
  subscribeToAuthState: subscribeToAuthStateMock,
  loginWithEmail: loginWithEmailMock,
  logout: logoutMock,
  getIdToken: getIdTokenMock,
  mapFirebaseAuthError: () => "Email o contraseña incorrectos.",
}));

vi.mock("../api/auth", () => ({
  createSession: createSessionMock,
}));

const FAKE_USER = { uid: "uid-1", email: "staff@test.local" };

function adminSessionResponse() {
  return { user: { id: "user-1", email: "staff@test.local", role: "ADMIN", status: "ACTIVE" } };
}

function validatorSessionResponse() {
  return { user: { id: "user-2", email: "staff@test.local", role: "VALIDATOR", status: "ACTIVE" } };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/staff/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/login" element={<StaffLoginPage />} />
          <Route path="/admin" element={<div>ADMIN PAGE</div>} />
          <Route path="/check-in" element={<div>CHECKIN PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function submitLoginForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email/i), "staff@test.local");
  await user.type(screen.getByLabelText("Contraseña"), "secret123");
  await user.click(screen.getByRole("button", { name: /ingresar/i }));
}

describe("StaffLoginPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sin sesión: muestra el formulario de login", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(null);
      return () => {};
    });

    renderPage();

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
  });

  it("login ADMIN: redirige a /admin", async () => {
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
    createSessionMock.mockResolvedValue(adminSessionResponse());

    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText(/email/i);

    await submitLoginForm(user);

    expect(await screen.findByText("ADMIN PAGE")).toBeInTheDocument();
  });

  it("login VALIDATOR: redirige a /check-in", async () => {
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
    createSessionMock.mockResolvedValue(validatorSessionResponse());

    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText(/email/i);

    await submitLoginForm(user);

    expect(await screen.findByText("CHECKIN PAGE")).toBeInTheDocument();
  });

  it("sesión ya activa (recarga): redirige de inmediato según el rol, sin mostrar el formulario", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(FAKE_USER);
      return () => {};
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    createSessionMock.mockResolvedValue(adminSessionResponse());

    renderPage();

    expect(await screen.findByText("ADMIN PAGE")).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it("error de login (credenciales Firebase inválidas): muestra un mensaje claro, no redirige", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(null);
      return () => {};
    });
    loginWithEmailMock.mockRejectedValue(Object.assign(new Error("wrong password"), { code: "auth/wrong-password" }));

    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText(/email/i);

    await submitLoginForm(user);

    expect(await screen.findByText(/email o contraseña incorrectos/i)).toBeInTheDocument();
    expect(screen.queryByText("ADMIN PAGE")).not.toBeInTheDocument();
  });

  it.each([
    [401, "No autorizado."],
    [403, "No tenés permisos para realizar esta acción."],
    [409, "Esta cuenta ya está vinculada a otro usuario de Firebase."],
    [500, "Ocurrió un error inesperado."],
  ])("error %i de POST /api/auth/session: muestra el mensaje, vuelve a mostrar el formulario (logout automático)", async (status, message) => {
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
    createSessionMock.mockRejectedValue(new ApiError(status, message, "SOME_CODE"));
    logoutMock.mockImplementation(async () => {
      emitUser?.(null);
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText(/email/i);

    await submitLoginForm(user);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it("botón mostrar/ocultar contraseña alterna el tipo del input", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(null);
      return () => {};
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText(/email/i);

    const passwordInput = screen.getByLabelText("Contraseña");
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /mostrar contraseña/i }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /ocultar contraseña/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
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
    createSessionMock.mockResolvedValue(adminSessionResponse());

    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText(/email/i);
    await submitLoginForm(user);
    await screen.findByText("ADMIN PAGE");

    expect(document.body.textContent).not.toContain("token-super-secreto-xyz");
  });
});
