import ScoutMarketingSite from "./ScoutMarketingSite";
import ResetPasswordPage from "./ResetPasswordPage";
import VerifiedEmailPage from "./VerifiedEmailPage";

export default function App() {
  if (window.location.pathname === "/verified") {
    return <VerifiedEmailPage />;
  }

  if (window.location.pathname === "/reset-password") {
    return <ResetPasswordPage />;
  }

  return <ScoutMarketingSite />;
}
