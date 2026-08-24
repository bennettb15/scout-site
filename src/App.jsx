import ScoutMarketingSite from "./ScoutMarketingSite";
import ResetPasswordPage from "./ResetPasswordPage";
import VerifiedEmailPage from "./VerifiedEmailPage";
import ScoutReportsPortalPage from "./ScoutReportsPortalPage";

export default function App() {
  if (window.location.pathname === "/verified") {
    return <VerifiedEmailPage />;
  }

  if (window.location.pathname === "/reset-password") {
    return <ResetPasswordPage />;
  }

  if (window.location.pathname === "/reports") {
    return <ScoutReportsPortalPage />;
  }

  return <ScoutMarketingSite />;
}
