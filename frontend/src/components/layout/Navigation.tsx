import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import './Navigation.css';

export const Navigation: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const getNavigationItems = () => {
    switch (user.role) {
      case 'rider':
        return [
          { path: '/rider/book', label: 'Book Ride', icon: '🚗' },
          { path: '/rider/rides', label: 'My Rides', icon: '📋' },
          { path: '/rider/profile', label: 'Profile', icon: '👤' },
        ];
      case 'driver':
        return [
          { path: '/driver/dashboard', label: 'Dashboard', icon: '🏠' },
          { path: '/driver/rides', label: 'My Rides', icon: '📋' },
          { path: '/driver/profile', label: 'Profile', icon: '👤' },
        ];
      case 'admin':
        return [
          { path: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
          { path: '/admin/users', label: 'Users', icon: '👥' },
          { path: '/admin/rides', label: 'Rides', icon: '🚗' },
        ];
      default:
        return [];
    }
  };

  const navigationItems = getNavigationItems();

  return (
    <nav className="navigation">
      <div className="nav-header">
        <h3>{user.role.charAt(0).toUpperCase() + user.role.slice(1)} Menu</h3>
      </div>
      <ul className="nav-list">
        {navigationItems.map((item) => (
          <li key={item.path} className="nav-item">
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};