import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '@/components/AdminLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AuthProvider } from '@/contexts/AuthContext'
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage'
import { CompaniesPage } from '@/pages/admin/CompaniesPage'
import { CompanyDashboardPage } from '@/pages/CompanyDashboardPage'
import { HomeRedirect } from '@/pages/HomeRedirect'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
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
                <CompanyDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
