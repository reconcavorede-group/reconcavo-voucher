import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import OrderStatus from "./pages/OrderStatus.tsx";
import AdminLayout from "./components/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import Vouchers from "./pages/admin/Vouchers";
import Sales from "./pages/admin/Sales";
import Settings from "./pages/admin/Settings";
import Mikrotik from "./pages/admin/Mikrotik";
import Locations from "./pages/admin/Locations";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/order/:id" element={<OrderStatus />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="vouchers" element={<Vouchers />} />
            <Route path="sales" element={<Sales />} />
            <Route path="settings" element={<Settings />} />
            <Route path="mikrotik" element={<Mikrotik />} />
            <Route path="locations" element={<Locations />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

