import React from 'react';
import { AppProvider, Link } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { NavMenu } from '@shopify/app-bridge-react';
import Dashboard from './pages/Dashboard.jsx';
import Designer from './pages/Designer.jsx';
import Orders from './pages/Orders.jsx';
import Fraud from './pages/Fraud.jsx';
import Setup from './pages/Setup.jsx';

function CurrentPage() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  switch (path) {
    case '/designer': return <Designer />;
    case '/orders': return <Orders />;
    case '/fraud': return <Fraud />;
    case '/setup': return <Setup />;
    default: return <Dashboard />;
  }
}

export default function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <NavMenu>
        <Link url="/">Dashboard</Link>
        <Link url="/designer">Form Designer</Link>
        <Link url="/orders">COD Orders</Link>
        <Link url="/fraud">Fraud Prevention</Link>
        <Link url="/setup">Setup &amp; Status</Link>
      </NavMenu>
      <CurrentPage />
    </AppProvider>
  );
}
