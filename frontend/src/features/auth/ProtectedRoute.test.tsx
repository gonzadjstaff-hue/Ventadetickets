import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./AuthContext";
import ProtectedRoute from "./ProtectedRoute";

/**
 * Aislado por completo: se mockea `authService` y `api/auth` (createSession)
 * enteros — nunca se llama al SDK real de Firebase ni al backend real. Cada
 * test controla directamente qué usuario/perfil "existe" vía estos mocks.
 */
const { subscribeToAuthStateMock, getIdTokenMock, createSessionMock } = vi.hoisted(() => ({
  subscribeToAuthStateMock: vi.fn(),
  getIdTokenMock: vi.fn(),
  createSessionMock: vi.fn(),
}));

vi.mock("./authService", () => ({
  subscribeToAuthState: subscribeToAuthStateMock,
  loginWithEmail: vi.fn(),
  logout: vi.fn(),
  getIdToken: getIdTokenMock,
  mapFirebaseAuthError: vi.fn(),
}));

vi.mock("../../api/auth", () => ({
  createSession: createSessionMock,
}));

const FAKE_USER = { uid: "uid-1", email: "admin@test.local" };

function renderProtected(allowedRoles: Array<"USER" | "VALIDATOR" | "ADMIN">) {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/login" element={<div>LOGIN PAGE</div>} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={allowedRoles}>
                <div>SECRET CONTENT</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("mientras carga (resolución inicial de Firebase): muestra estado de carga, nunca el contenido ni redirige", () => {
    subscribeToAuthStateMock.mockImplementation(() => () => {});

    renderProtected(["ADMIN"]);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
    expect(screen.queryByText("LOGIN PAGE")).not.toBeInTheDocument();
  });

  it("mientras se vincula la sesión (profileLoading): muestra estado de carga, no el contenido", () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(FAKE_USER);
      return () => {};
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    // createSession nunca resuelve en este test: se queda "cargando" a propósito.
    createSessionMock.mockImplementation(() => new Promise(() => {}));

    renderProtected(["ADMIN"]);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
  });

  it("sin sesión de Firebase: redirige a /staff/login", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(null);
      return () => {};
    });

    renderProtected(["ADMIN"]);

    expect(await screen.findByText("LOGIN PAGE")).toBeInTheDocument();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
  });

  it("sesión válida pero rol no permitido: muestra acceso denegado, no redirige ni muestra el contenido", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(FAKE_USER);
      return () => {};
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    createSessionMock.mockResolvedValue({
      user: { id: "user-1", email: "validador@test.local", role: "VALIDATOR", status: "ACTIVE" },
    });

    renderProtected(["ADMIN"]);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no tenés permisos/i);
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
    expect(screen.queryByText("LOGIN PAGE")).not.toBeInTheDocument();
  });

  it("sesión válida con rol permitido: muestra el contenido protegido", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(FAKE_USER);
      return () => {};
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    createSessionMock.mockResolvedValue({
      user: { id: "user-1", email: "admin@test.local", role: "ADMIN", status: "ACTIVE" },
    });

    renderProtected(["ADMIN"]);

    expect(await screen.findByText("SECRET CONTENT")).toBeInTheDocument();
  });

  it("sesión con backend rechazando (profileError, sin profile): redirige a /staff/login, no muestra el contenido", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(FAKE_USER);
      return () => {};
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    createSessionMock.mockRejectedValue(new Error("401"));

    renderProtected(["ADMIN"]);

    expect(await screen.findByText("LOGIN PAGE")).toBeInTheDocument();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
  });
});
