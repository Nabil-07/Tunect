// src/layouts/MainLayout.tsx
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ShutdownBanner from '../components/ShutdownBanner';
import Breadcrumbs from '../components/Breadcrumbs';
import Footer from '../components/Footer';

export default function MainLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <ShutdownBanner prominent={pathname === '/'} />
      <Breadcrumbs />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
