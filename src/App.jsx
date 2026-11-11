import { lazy, Suspense, useEffect, useState } from "react";

const ScoutMarketingSite = lazy(() => import("./ScoutMarketingSite"));
const ResetPasswordPage = lazy(() => import("./ResetPasswordPage"));
const VerifiedEmailPage = lazy(() => import("./VerifiedEmailPage"));
const ScoutReportsPortalPage = lazy(() => import("./ScoutReportsPortalPage"));
const GalleryPage = lazy(() => import("./GalleryPage"));
const ClientDetailsPage = lazy(() => import("./ClientDetailsPage"));
const ScoutPunchListPage = lazy(() => import("./ScoutPunchListPage"));
const PortalAccessAdminPage = lazy(() => import("./PortalAccessAdminPage"));
const CustomerLifecycleAdminPage = lazy(() => import("./CustomerLifecycleAdminPage"));
const ForgotPasswordPage = lazy(() => import("./ForgotPasswordPage"));
const AccountPage = lazy(() => import("./AccountPage"));
const PrivacyPage = lazy(() => import("./PrivacyPage"));
const TermsPage = lazy(() => import("./TermsPage"));
const ServiceTermsPage = () => <TermsPage kind="service" />;
const SoftwareTermsPage = () => <TermsPage kind="software" />;

function AdminWorkspace() {
  const [activePath, setActivePath] = useState(() => window.location.pathname.replace(/\/+$/, "") || "/");

  useEffect(() => {
    const onRouteChange = () => setActivePath(window.location.pathname.replace(/\/+$/, "") || "/");
    window.addEventListener("admin-route-change", onRouteChange);
    window.addEventListener("popstate", onRouteChange);
    return () => {
      window.removeEventListener("admin-route-change", onRouteChange);
      window.removeEventListener("popstate", onRouteChange);
    };
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PortalAccessAdminPage hidden={activePath !== "/admin/portal-access"} />
      </Suspense>
      <Suspense fallback={null}>
        <CustomerLifecycleAdminPage hidden={activePath !== "/admin/customers"} />
      </Suspense>
    </>
  );
}

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  let Page = ScoutMarketingSite;

  if (pathname === "/verified") {
    Page = VerifiedEmailPage;
  } else if (pathname === "/reset-password" || pathname === "/accept-invite") {
    Page = ResetPasswordPage;
  } else if (pathname === "/forgot-password") {
    Page = ForgotPasswordPage;
  } else if (pathname === "/account") {
    Page = AccountPage;
  } else if (pathname === "/privacy") {
    Page = PrivacyPage;
  } else if (pathname === "/terms/service") {
    Page = ServiceTermsPage;
  } else if (pathname === "/terms/software") {
    Page = SoftwareTermsPage;
  } else if (pathname === "/reports") {
    Page = ScoutReportsPortalPage;
  } else if (pathname === "/gallery") {
    Page = GalleryPage;
  } else if (pathname === "/clients") {
    Page = ClientDetailsPage;
  } else if (pathname === "/punch-list") {
    Page = ScoutPunchListPage;
  } else if (pathname === "/admin/portal-access" || pathname === "/admin/customers") {
    Page = AdminWorkspace;
  }

  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}
