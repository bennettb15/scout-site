import { lazy, Suspense } from "react";

const ScoutMarketingSite = lazy(() => import("./ScoutMarketingSite"));
const ResetPasswordPage = lazy(() => import("./ResetPasswordPage"));
const VerifiedEmailPage = lazy(() => import("./VerifiedEmailPage"));
const ScoutReportsPortalPage = lazy(() => import("./ScoutReportsPortalPage"));
const ScoutPunchListPage = lazy(() => import("./ScoutPunchListPage"));
const PortalAccessAdminPage = lazy(() => import("./PortalAccessAdminPage"));
const ForgotPasswordPage = lazy(() => import("./ForgotPasswordPage"));

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  let Page = ScoutMarketingSite;

  if (pathname === "/verified") {
    Page = VerifiedEmailPage;
  } else if (pathname === "/reset-password" || pathname === "/accept-invite") {
    Page = ResetPasswordPage;
  } else if (pathname === "/forgot-password") {
    Page = ForgotPasswordPage;
  } else if (pathname === "/reports") {
    Page = ScoutReportsPortalPage;
  } else if (pathname === "/punch-list") {
    Page = ScoutPunchListPage;
  } else if (pathname === "/admin/portal-access") {
    Page = PortalAccessAdminPage;
  }

  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}
