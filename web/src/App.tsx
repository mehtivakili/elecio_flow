import { Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useAuth } from './lib/session';
import { Shell } from './components/Shell';
import { Spinner } from './components/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ContactsPage from './pages/crm/ContactsPage';
import ContactPage from './pages/crm/ContactPage';
import PipelinePage from './pages/crm/PipelinePage';
import LeadsPage from './pages/crm/LeadsPage';
import FollowupsPage from './pages/crm/FollowupsPage';
import MapPage from './pages/crm/MapPage';
import OrdersPage from './pages/sales/OrdersPage';
import OrderPage from './pages/sales/OrderPage';
import PurchaseOrdersPage from './pages/scm/PurchaseOrdersPage';
import PurchaseOrderPage from './pages/scm/PurchaseOrderPage';
import SuppliersPage from './pages/scm/SuppliersPage';
import ItemsPage from './pages/inventory/ItemsPage';
import ItemPage from './pages/inventory/ItemPage';
import StockPage, { StockMovesPage } from './pages/inventory/StockPage';
import WorkOrdersPage from './pages/production/WorkOrdersPage';
import WorkOrderPage from './pages/production/WorkOrderPage';
import UnitsPage from './pages/units/UnitsPage';
import UnitPage from './pages/units/UnitPage';
import TicketsPage from './pages/service/TicketsPage';
import TicketPage from './pages/service/TicketPage';
import FinancePage from './pages/FinancePage';
import TasksPage from './pages/TasksPage';
import SettingsPage from './pages/SettingsPage';
import ProductFlowPage from './pages/ProductFlowPage';

export default function App() {
  const { token } = useAuth();
  if (!token) return <LoginPage />;
  return (
    <SessionProvider fallback={<div className="grid-bg flex h-full items-center justify-center"><Spinner label="در حال آماده‌سازی فضای کار…" /></div>}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<DashboardPage />} />
          <Route path="operations/product-flow" element={<ProductFlowPage />} />
          <Route path="crm/contacts" element={<ContactsPage />} />
          <Route path="crm/contacts/:id" element={<ContactPage />} />
          <Route path="crm/pipeline" element={<PipelinePage />} />
          <Route path="crm/leads" element={<LeadsPage />} />
          <Route path="crm/followups" element={<FollowupsPage />} />
          <Route path="crm/map" element={<MapPage />} />
          <Route path="sales/orders" element={<OrdersPage />} />
          <Route path="sales/orders/:id" element={<OrderPage />} />
          <Route path="scm/purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="scm/purchase-orders/:id" element={<PurchaseOrderPage />} />
          <Route path="scm/suppliers" element={<SuppliersPage />} />
          <Route path="inventory/items" element={<ItemsPage />} />
          <Route path="inventory/items/:id" element={<ItemPage />} />
          <Route path="inventory/stock" element={<StockPage />} />
          <Route path="inventory/moves" element={<StockMovesPage />} />
          <Route path="production/work-orders" element={<WorkOrdersPage />} />
          <Route path="production/work-orders/:id" element={<WorkOrderPage />} />
          <Route path="units" element={<UnitsPage />} />
          <Route path="units/:key" element={<UnitPage />} />
          <Route path="service/tickets" element={<TicketsPage />} />
          <Route path="service/tickets/:id" element={<TicketPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SessionProvider>
  );
}
