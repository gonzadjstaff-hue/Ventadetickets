import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import ProtectedRoute from "../features/auth/ProtectedRoute";
import { AuthProvider } from "../features/auth/AuthContext";
import AdminDashboardPage from "./AdminDashboardPage";

/**
 * Aislado por completo de servicios externos. Se renderiza detrás de un
 * ProtectedRoute("ADMIN") real (no solo la página sola) para validar también
 * el ciclo completo de logout → pérdida de sesión → redirección a
 * /staff/login, que es responsabilidad conjunta de ambos componentes.
 */
const { subscribeToAuthStateMock, getIdTokenMock, createSessionMock, logoutMock } = vi.hoisted(() => ({
  subscribeToAuthStateMock: vi.fn(),
  getIdTokenMock: vi.fn(),
  createSessionMock: vi.fn(),
  logoutMock: vi.fn(),
}));

vi.mock("../features/auth/authService", () => ({
  subscribeToAuthState: subscribeToAuthStateMock,
  loginWithEmail: vi.fn(),
  logout: logoutMock,
  getIdToken: getIdTokenMock,
  mapFirebaseAuthError: vi.fn(),
}));

vi.mock("../api/auth", () => ({
  createSession: createSessionMock,
}));

const FAKE_USER = { uid: "uid-1", email: "admin@test.local" };
const ADMIN_PROFILE = { id: "user-1", email: "admin@test.local", role: "ADMIN", status: "ACTIVE" };

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/login" element={<div>LOGIN PAGE</div>} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <AdminDashboardPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AdminDashboardPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el email y el rol del usuario autenticado", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(FAKE_USER);
      return () => {};
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    createSessionMock.mockResolvedValue({ user: ADMIN_PROFILE });

    renderDashboard();

    expect(await screen.findByText("admin@test.local")).toBeInTheDocument();
    expect(screen.getByText("Administrador")).toBeInTheDocument();
  });

  it("las tarjetas de Resumen nunca muestran cifras inventadas: solo el texto de placeholder", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(FAKE_USER);
      return () => {};
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    createSessionMock.mockResolvedValue({ user: ADMIN_PROFILE });

    renderDashboard();

    const placeholders = await screen.findAllByText("Pendiente de conectar al backend");
    expect(placeholders.length).toBeGreaterThanOrEqual(4);

    // Ningún dígito en todo el contenido de la sección de Resumen: no hay
    // ninguna cifra hardcodeada disfrazada de métrica real.
    const summaryHeading = screen.getByRole("heading", { name: /resumen/i });
    const summarySection = summaryHeading.closest("section");
    expect(summarySection?.textContent).not.toMatch(/\d/);
  });

  it("el ítem de navegación 'Check-in' es un link real a /check-in; el resto son placeholders no interactivos", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(FAKE_USER);
      return () => {};
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    createSessionMock.mockResolvedValue({ user: ADMIN_PROFILE });

    renderDashboard();

    const checkInLink = await screen.findByRole("link", { name: "Check-in" });
    expect(checkInLink).toHaveAttribute("href", "/check-in");

    expect(screen.queryByRole("link", { name: "Órdenes" })).not.toBeInTheDocument();
    expect(screen.getByText("Órdenes")).toBeInTheDocument();
    expect(screen.getAllByText("Próximamente").length).toBeGreaterThan(0);
  });

  it("logout: limpia la sesión y ProtectedRoute redirige a /staff/login", async () => {
    let emitUser: ((user: unknown) => void) | undefined;
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      emitUser = callback;
      callback(FAKE_USER);
      return () => {};
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    createSessionMock.mockResolvedValue({ user: ADMIN_PROFILE });
    logoutMock.mockImplementation(async () => {
      emitUser?.(null);
    });

    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText("admin@test.local");

    await user.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("LOGIN PAGE")).toBeInTheDocument();
  });
});
