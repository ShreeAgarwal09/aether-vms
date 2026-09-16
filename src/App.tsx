import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '@/components/AdminLayout'
import { CompanyLayout } from '@/components/CompanyLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AuthProvider } from '@/contexts/AuthContext'
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage'
import { CompaniesPage } from '@/pages/admin/CompaniesPage'
import { BulkInvitePage } from '@/pages/company/BulkInvitePage'
import { CompanyDashboardPage } from '@/pages/company/CompanyDashboardPage'
import { CompanyPasswordPage } from '@/pages/company/CompanyPasswordPage'
import { CompanyProfilePage } from '@/pages/company/CompanyProfilePage'
import { FormBuilderEditorPage } from '@/pages/company/FormBuilderEditorPage'
import { FormBuilderPage } from '@/pages/company/FormBuilderPage'
import { InviteVendorPage } from '@/pages/company/InviteVendorPage'
import { SyncDataPage } from '@/pages/company/SyncDataPage'
import { TallyIpPage } from '@/pages/company/TallyIpPage'
import { VendorDetailPage } from '@/pages/company/VendorDetailPage'
import { VendorReviewPage } from '@/pages/company/VendorReviewPage'
import { VendorsPage } from '@/pages/company/VendorsPage'
import { HomeRedirect } from '@/pages/HomeRedirect'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OnboardPage } from '@/pages/onboard/OnboardPage'
import { UnauthorizedPage } from '@/pages/UnauthorizedPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminOverviewPage />} />
            <Route path="companies" element={<CompaniesPage />} />
          </Route>
          <Route
            path="/company"
            element={
              <ProtectedRoute allowedRoles={['company']}>
                <CompanyLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<CompanyDashboardPage />} />
            <Route path="vendors" element={<VendorsPage />} />
            <Route path="vendors/invite" element={<InviteVendorPage />} />
            <Route path="vendors/bulk" element={<BulkInvitePage />} />
            <Route path="vendors/:vendorId/review" element={<VendorReviewPage />} />
            <Route path="vendors/:vendorId" element={<VendorDetailPage />} />
            <Route path="sync" element={<SyncDataPage />} />
            <Route path="form-builder" element={<FormBuilderPage />} />
            <Route path="form-builder/:templateId" element={<FormBuilderEditorPage />} />
            <Route path="profile" element={<CompanyProfilePage />} />
            <Route path="password" element={<CompanyPasswordPage />} />
            <Route path="tally" element={<TallyIpPage />} />
          </Route>
          <Route path="/onboard/:token" element={<OnboardPage />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
