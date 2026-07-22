import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import './Header.css';

interface HeaderProps {
  title?: string;
}

export const Header: React.FC<HeaderProps> = ({ title }) => {
  const { user, logout } = useAuth();
  const { isConnected } = useSocket();

  const handleLogout = () => {
    logout();
  };

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <h1 className="header-title">
            🚗 {title || 'Cab Aggregator'}
          </h1>
          <div className="connection-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? '🟢' : '🔴'}
            </span>
            <span className="status-text">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {user && (
          <div className="header-right">
            <div className="user-info">
              <span className="user-name">{user.profile.name}</span>
              <span className="user-role">{user.role}</span>
              {user.role === 'driver' && user.driverInfo && (
                <span className={`driver-status ${user.driverInfo.isAvailable ? 'available' : 'unavailable'}`}>
                  {user.driverInfo.isAvailable ? 'Available' : 'Busy'}
                </span>
              )}
            </div>
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
};