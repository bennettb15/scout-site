import ScoutMarketingSite from "./ScoutMarketingSite";
import ResetPasswordPage from "./ResetPasswordPage";
import VerifiedEmailPage from "./VerifiedEmailPage";
import ScoutReportsPortalPage from "./ScoutReportsPortalPage";
import ScoutPunchListPage from "./ScoutPunchListPage";
import PortalAccessAdminPage from "./PortalAccessAdminPage";
import ForgotPasswordPage from "./ForgotPasswordPage";

export default function App() {
  if (window.location.pathname === "/verified") {
    return <VerifiedEmailPage />;
  }

  if (window.location.pathname === "/reset-password") {
    return <ResetPasswordPage />;
  }

  if (window.location.pathname === "/accept-invite") {
    return <ResetPasswordPage />;
  }

  if (window.location.pathname === "/forgot-password") {
    return <ForgotPasswordPage />;
  }

  if (window.location.pathname === "/reports") {
    return <ScoutReportsPortalPage />;
  }

  if (window.location.pathname === "/punch-list") {
    return <ScoutPunchListPage />;
  }

  if (window.location.pathname === "/admin/portal-access") {
    return <PortalAccessAdminPage />;
  }

  return <ScoutMarketingSite />;
}
