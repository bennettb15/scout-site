import ScoutMarketingSite from "./ScoutMarketingSite";
import ResetPasswordPage from "./ResetPasswordPage";
import VerifiedEmailPage from "./VerifiedEmailPage";
import ScoutReportsPortalPage from "./ScoutReportsPortalPage";
import ScoutPunchListPage from "./ScoutPunchListPage";
import PortalAccessAdminPage from "./PortalAccessAdminPage";
import ForgotPasswordPage from "./ForgotPasswordPage";

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/verified") {
    return <VerifiedEmailPage />;
  }

  if (pathname === "/reset-password") {
    return <ResetPasswordPage />;
  }

  if (pathname === "/accept-invite") {
    return <ResetPasswordPage />;
  }

  if (pathname === "/forgot-password") {
    return <ForgotPasswordPage />;
  }

  if (pathname === "/reports") {
    return <ScoutReportsPortalPage />;
  }

  if (pathname === "/punch-list") {
    return <ScoutPunchListPage />;
  }

  if (pathname === "/admin/portal-access") {
    return <PortalAccessAdminPage />;
  }

  return <ScoutMarketingSite />;
}
