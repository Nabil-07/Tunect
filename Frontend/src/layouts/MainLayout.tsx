// src/layouts/MainLayout.tsx
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Breadcrumbs from '../components/Breadcrumbs';
import Footer from '../components/Footer';
import ChatWidget from '../components/ChatWidget';

export default function MainLayout() {
  // Always use the single Navbar; it decides what to show (public / student / etc.)
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <Breadcrumbs />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <ChatWidget />
    </div>
  );
}
