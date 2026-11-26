import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Link, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query';
import { useAccess, WORKSPACE_HOME, type Workspace } from '@/lib/access';
import { ToastProvider } from '@/components/ui/toast';
import { Splash } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/states';
import { PublicLayout } from '@/layouts/PublicLayout';
import { AppShell } from '@/layouts/AppShell';
import { Landing } from '@/features/public/Landing';
import { SignIn } from '@/features/public/SignIn';
import { PublicServices } from '@/features/public/PublicServices';

// Signed-in areas are split into their own chunks so the public pages stay light on slow connections.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = (load: () => Promise<Record<string, unknown>>, name: string) => lazy(async () => ({ default: (await load())[name] as ComponentType<any> }));
const student = () => import('@/features/student/StudentHome');
const PublicMap = P(() => import('@/features/public/PublicPages'), 'PublicMap');
const PublicAsk = P(() => import('@/features/public/PublicPages'), 'PublicAsk');
const StudentHome = P(student, 'StudentHome');
const StudentQueue = P(() => import('@/features/student/Queue'), 'StudentQueue');
const TicketDetail = P(() => import('@/features/student/Queue'), 'TicketDetail');
const StudentRequests = P(() => import('@/features/student/Requests'), 'StudentRequests');
const StudentRequestDetail = P(() => import('@/features/student/Requests'), 'StudentRequestDetail');
const StudentClearance = P(() => import('@/features/student/Clearance'), 'StudentClearance');
const StudentPenalties = P(() => import('@/features/student/Penalties'), 'StudentPenalties');
const PenaltyDetailPage = P(() => import('@/features/student/Penalties'), 'PenaltyDetailPage');
const StudentPayments = P(() => import('@/features/student/Penalties'), 'StudentPayments');
const StudentReceipts = P(() => import('@/features/student/Receipts'), 'StudentReceipts');
const shared = () => import('@/features/shared/SharedPages');
const NotificationsPage = P(shared, 'NotificationsPage');
const ProfilePage = P(shared, 'ProfilePage');
const AssistantPage = P(shared, 'AssistantPage');
const CampusMapPage = P(shared, 'CampusMapPage');
const ApprovalsPage = P(shared, 'ApprovalsPage');
const ReportsPage = P(shared, 'ReportsPage');
const ClearanceDetailPage = P(() => import('@/features/shared/ClearanceDetail'), 'ClearanceDetailPage');
const office = () => import('@/features/office/Office');
const OfficeHome = P(office, 'OfficeHome');
const QueueBoard = P(office, 'QueueBoard');
const OfficeRequests = P(office, 'OfficeRequests');
const OfficeRequestDetail = P(office, 'OfficeRequestDetail');
const GuidancePage = P(office, 'GuidancePage');
const LibraryPage = P(office, 'LibraryPage');
const OfficeClearances = P(office, 'OfficeClearances');
const org = () => import('@/features/org/Org');
const OrgHome = P(org, 'OrgHome');
const OrgReceipts = P(org, 'OrgReceipts');
const OrgRemittances = P(org, 'OrgRemittances');
const RemittanceDetail = P(org, 'RemittanceDetail');
const OrgViolations = P(org, 'OrgViolations');
const OrgPenalties = P(org, 'OrgPenalties');
const PaymentsReview = P(org, 'PaymentsReview');
const DepartmentHome = P(org, 'DepartmentHome');
const admin = () => import('@/features/admin/Admin');
const AdminHome = P(admin, 'AdminHome');
const AdminUsers = P(admin, 'AdminUsers');
const AdminConfig = P(admin, 'AdminConfig');
const AdminPolicies = P(admin, 'AdminPolicies');
const AdminClearance = P(admin, 'AdminClearance');
const AdminAi = P(admin, 'AdminAi');
const AdminAutomation = P(admin, 'AdminAutomation');
const AdminAudit = P(admin, 'AdminAudit');
const AdminGis = P(admin, 'AdminGis');

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="py-10"><Spinner /></div>}>{children}</Suspense>;
}

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <div className="flex min-h-dvh items-center justify-center"><Spinner /></div>;
  if (status === 'signed_out') return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Shows a workspace only to people who have it. This is a UI convenience; the API enforces access. */
function Workspace({ ws }: { ws: Workspace }) {
  const access = useAccess();
  if (!access.workspaces.includes(ws)) return <Forbidden />;
  return <Outlet />;
}

function HomeRedirect() {
  const access = useAccess();
  const ws = access.workspaces[0];
  if (!ws) return <div className="max-w-prose"><h1>Your account is not set up yet</h1><p className="mt-2 text-ink-soft">Ask the Registrar or SAS to link your account to your student record or position.</p></div>;
  return <Navigate to={WORKSPACE_HOME[ws]} replace />;
}

function Forbidden() {
  return <div className="max-w-prose py-6"><h1>This area is not part of your account</h1><p className="mt-2 text-ink-soft">If you think you should have access, ask an administrator to check your role.</p><Button className="mt-4" asChild><Link to="/home">Go to my home</Link></Button></div>;
}

function NotFound() {
  return <div className="mx-auto max-w-prose px-4 py-16"><h1>Page not found</h1><p className="mt-2 text-ink-soft">The link may be old or mistyped.</p><Button className="mt-4" asChild><Link to="/">Back to CampusServe</Link></Button></div>;
}

const w = (el: ReactNode) => <Page>{el}</Page>;

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/sign-in', element: <SignIn /> },
      { path: '/services', element: <PublicServices /> },
      { path: '/map', element: w(<PublicMap />) },
      { path: '/ask', element: w(<PublicAsk />) },
    ],
  },
  {
    element: <RequireAuth />,
    children: [{
      element: <AppShell />,
      children: [
        { path: '/home', element: <HomeRedirect /> },
        { path: '/notifications', element: w(<NotificationsPage />) },
        { path: '/profile', element: w(<ProfilePage />) },
        { path: '/assistant', element: w(<AssistantPage />) },
        { path: '/campus-map', element: w(<CampusMapPage />) },
        { path: '/approvals', element: w(<ApprovalsPage />) },
        { path: '/reports', element: w(<ReportsPage />) },
        { path: '/clearances/:id', element: w(<ClearanceDetailPage />) },
        { path: '/student', element: <Workspace ws="student" />, children: [
          { index: true, element: w(<StudentHome />) },
          { path: 'queue', element: w(<StudentQueue />) },
          { path: 'queue/:id', element: w(<TicketDetail />) },
          { path: 'requests', element: w(<StudentRequests />) },
          { path: 'requests/:id', element: w(<StudentRequestDetail />) },
          { path: 'clearance', element: w(<StudentClearance />) },
          { path: 'penalties', element: w(<StudentPenalties />) },
          { path: 'penalties/:id', element: w(<PenaltyDetailPage />) },
          { path: 'payments', element: w(<StudentPayments />) },
          { path: 'receipts', element: w(<StudentReceipts />) },
        ] },
        { path: '/org', element: <Workspace ws="organization" />, children: [
          { index: true, element: w(<OrgHome />) },
          { path: 'receipts', element: w(<OrgReceipts />) },
          { path: 'remittances', element: w(<OrgRemittances />) },
          { path: 'remittances/:id', element: w(<RemittanceDetail />) },
          { path: 'violations', element: w(<OrgViolations />) },
          { path: 'penalties', element: w(<OrgPenalties />) },
          { path: 'payments', element: w(<PaymentsReview />) },
        ] },
        { path: '/office', element: <Workspace ws="office" />, children: [
          { index: true, element: w(<OfficeHome />) },
          { path: 'queue', element: w(<QueueBoard />) },
          { path: 'requests', element: w(<OfficeRequests />) },
          { path: 'requests/:id', element: w(<OfficeRequestDetail />) },
          { path: 'guidance', element: w(<GuidancePage />) },
          { path: 'library', element: w(<LibraryPage />) },
          { path: 'clearance', element: w(<OfficeClearances />) },
        ] },
        { path: '/department', element: <Workspace ws="department" />, children: [{ index: true, element: w(<DepartmentHome />) }] },
        { path: '/cashier', element: <Workspace ws="cashier" />, children: [{ index: true, element: w(<PaymentsReview title="Online payments" />) }] },
        { path: '/admin', element: <Workspace ws="admin" />, children: [
          { index: true, element: w(<AdminHome />) },
          { path: 'users', element: w(<AdminUsers />) },
          { path: 'config', element: w(<AdminConfig />) },
          { path: 'policies', element: w(<AdminPolicies />) },
          { path: 'clearance', element: w(<AdminClearance />) },
          { path: 'ai', element: w(<AdminAi />) },
          { path: 'automation', element: w(<AdminAutomation />) },
          { path: 'gis', element: w(<AdminGis />) },
          { path: 'payments', element: w(<PaymentsReview title="All online payments" />) },
          { path: 'audit', element: w(<AdminAudit />) },
        ] },
      ],
    }],
  },
  { path: '*', element: <NotFound /> },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <Splash />
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
