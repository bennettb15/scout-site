import ScoutMarketingSite from "./ScoutMarketingSite";
import VerifiedEmailPage from "./VerifiedEmailPage";

export default function App() {
  if (window.location.pathname === "/verified") {
    return <VerifiedEmailPage />;
  }

  return <ScoutMarketingSite />;
}
