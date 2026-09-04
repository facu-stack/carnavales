import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Login from "../pages/Login";
import VerifyCode from "../pages/VerifyCode";
import Home from "../pages/Home";
import Admin from "../pages/Admin";
import ProtectedRoute from "../components/ProtectedRoute";
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
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Admin />
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
