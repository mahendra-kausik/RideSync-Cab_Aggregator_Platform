import React from 'react';
import { LayoutProps } from '@/types';
import { Navigation } from './Navigation';
import { Header } from './Header';
import './Layout.css';

export const Layout: React.FC<LayoutProps> = ({
  children,
  showNavigation = true,
  title
}) => {
  return (
    <div className="layout">
      <Header title={title} />
      <div className="layout-content">
        {showNavigation && <Navigation />}
        <main className={`main-content ${!showNavigation ? 'full-width' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
};