import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Login from "../pages/Login";
import VerifyCode from "../pages/VerifyCode";
import Home from "../pages/Home";
import Admin from "../pages/Admin";
import ComisarioPanel from "../pages/ComisarioPanel";
import EscribanoPanel from "../pages/EscribanoPanel";
import ProtectedRoute from "../components/ProtectedRoute";
import RoleRoute from "../components/RoleRoute";
import ForgotPassword from "../pages/ForgotPassword";
import ResetPassword from "../pages/ResetPassword";
import Modal from "../components/Modal";
import Landing from "../pages/Landing";

function AuthModal({ children, dismissible = true, label }) {
  return (
    <Modal dismissible={dismissible} label={label}>
      {children}
    </Modal>
  );
}

function AppRoutes() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;

  return (
    <>
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<Landing />} />
        <Route
          path="/login"
          element={
            <AuthModal label="Iniciar sesión">
              <Login />
            </AuthModal>
          }
        />
        <Route
          path="/verify-code"
          element={
            <AuthModal dismissible={false} label="Verificar código">
              <VerifyCode />
            </AuthModal>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <AuthModal label="Recuperar contraseña">
              <ForgotPassword />
            </AuthModal>
          }
        />
        <Route
          path="/reset-password"
          element={
            <AuthModal dismissible={false} label="Restablecer contraseña">
              <ResetPassword />
            </AuthModal>
          }
        />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={["jurado", "admin"]}>
                <Home />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/comisario"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={["comisario", "admin"]}>
                <ComisarioPanel />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/escribano"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={["escribano", "admin"]}>
                <EscribanoPanel />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={["admin"]}>
                <Admin />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {backgroundLocation && (
        <Routes>
          <Route
            path="/login"
            element={
              <AuthModal label="Iniciar sesión">
                <Login />
              </AuthModal>
            }
          />
          <Route
            path="/verify-code"
            element={
              <AuthModal dismissible={false} label="Verificar código">
                <VerifyCode />
              </AuthModal>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <AuthModal label="Recuperar contraseña">
                <ForgotPassword />
              </AuthModal>
            }
          />
          <Route
            path="/reset-password"
            element={
              <AuthModal dismissible={false} label="Restablecer contraseña">
                <ResetPassword />
              </AuthModal>
            }
          />
        </Routes>
      )}
    </>
  );
}

export default function Router() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
