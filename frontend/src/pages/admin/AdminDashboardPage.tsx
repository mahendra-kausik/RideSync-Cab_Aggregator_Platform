import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import adminService, { PlatformStats, User, Ride } from '../../services/adminService';
import { useAuth } from '../../contexts/AuthContext';
import { useSocketEvent } from '../../contexts/SocketContext';
import './AdminDashboard.css';

const AdminDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [stats, setStats] = useState<PlatformStats | null>(null);
    const [recentUsers, setRecentUsers] = useState<User[]>([]);
    const [recentRides, setRecentRides] = useState<Ride[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'rides'>('overview');

    useEffect(() => {
        if (user?.role !== 'admin') {
            navigate('/auth/login');
            return;
        }
        loadDashboardData();
    }, [user, navigate]);

    // Auto-refresh on relevant socket events
    useSocketEvent('ride:status-change', () => {
        if (user?.role === 'admin') {
            loadDashboardData();
        }
    });
    useSocketEvent('ride:status-updated', () => {
        if (user?.role === 'admin') {
            loadDashboardData();
        }
    });
    useSocketEvent('ride:driver-assigned', () => {
        if (user?.role === 'admin') {
            loadDashboardData();
        }
    });
    useSocketEvent('driver:status-change', () => {
        if (user?.role === 'admin') {
            loadDashboardData();
        }
    });

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            setError(null);

            const [statsData, usersData, ridesData] = await Promise.all([
                adminService.getPlatformStats(),
                adminService.getAllUsers({ page: 1, limit: 5 }),
                adminService.getAllRides({ page: 1, limit: 5 })
            ]);

            setStats(statsData);
            setRecentUsers(usersData.data);
            setRecentRides(ridesData.data);
        } catch (err: any) {
            console.error('Failed to load dashboard data:', err);
            setError(err.message || 'Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const handleUserAction = async (userId: string, action: 'suspend' | 'reactivate', reason?: string) => {
        try {
            if (action === 'suspend') {
                await adminService.suspendUser(userId, reason);
            } else {
                await adminService.reactivateUser(userId, reason);
            }
            await loadDashboardData(); // Refresh data
        } catch (err: any) {
            console.error(`Failed to ${action} user:`, err);
            setError(err.message || `Failed to ${action} user`);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusBadgeClass = (status: string) => {
        const statusClasses: { [key: string]: string } = {
            'completed': 'status-completed',
            'in_progress': 'status-in-progress',
            'accepted': 'status-accepted',
            'matched': 'status-matched',
            'requested': 'status-requested',
            'cancelled': 'status-cancelled'
        };
        return statusClasses[status] || 'status-default';
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="page-container">
                <div className="error-message">
                    <h3>Error Loading Dashboard</h3>
                    <p>{error}</p>
                    <button onClick={loadDashboardData} className="btn btn-primary">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-dashboard">
            <div className="dashboard-header">
                <div>
                    <h1>Admin Dashboard</h1>
                    <p>Manage users, rides, and platform analytics</p>
                </div>
                <button onClick={loadDashboardData} className="btn btn-secondary">
                    Refresh Data
                </button>
            </div>

            <div className="dashboard-tabs">
                <button
                    className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    Overview
                </button>
                <button
                    className={`tab ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    Users
                </button>
                <button
                    className={`tab ${activeTab === 'rides' ? 'active' : ''}`}
                    onClick={() => setActiveTab('rides')}
                >
                    Rides
                </button>
            </div>

            {activeTab === 'overview' && stats && (
                <div className="dashboard-content">
                    {/* Statistics Cards */}
                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-icon">👥</div>
                            <div className="stat-content">
                                <h3>{stats.users.total}</h3>
                                <p>Total Users</p>
                                <small>{stats.users.activeUsers} active</small>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon">🚗</div>
                            <div className="stat-content">
                                <h3>{stats.users.drivers}</h3>
                                <p>Drivers</p>
                                <small>{stats.users.activeDrivers} available</small>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon">🚕</div>
                            <div className="stat-content">
                                <h3>{stats.rides.total}</h3>
                                <p>Total Rides</p>
                                <small>{stats.rides.completed} completed</small>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon">💰</div>
                            <div className="stat-content">
                                <h3>{formatCurrency(stats.revenue.totalRevenue || 0)}</h3>
                                <p>Platform Revenue</p>
                                <small>Avg fare: {formatCurrency(stats.revenue.averageFare || 0)}</small>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon">🚗💵</div>
                            <div className="stat-content">
                                <h3>{formatCurrency(stats.revenue.totalDriverEarnings || 0)}</h3>
                                <p>Driver Earnings</p>
                                <small>From {stats.rides.completed} rides</small>
                            </div>
                        </div>
                    </div>

                    {/* Today's Stats */}
                    <div className="today-stats">
                        <h3>Today's Activity</h3>
                        <div className="today-grid">
                            <div className="today-item">
                                <span className="today-number">
                                    {stats.rides.requested + stats.rides.accepted + stats.rides.inProgress}
                                </span>
                                <span className="today-label">Active Rides</span>
                            </div>
                            <div className="today-item">
                                <span className="today-number">{stats.today.completed}</span>
                                <span className="today-label">Completed</span>
                            </div>
                            <div className="today-item">
                                <span className="today-number">{stats.today.cancelled}</span>
                                <span className="today-label">Cancelled</span>
                            </div>
                        </div>
                    </div>

                    {/* Ride Status Breakdown */}
                    <div className="ride-status-breakdown">
                        <h3>Ride Status Distribution</h3>
                        <div className="status-grid">
                            <div className="status-item">
                                <span className="status-count">{stats.rides.requested}</span>
                                <span className="status-label">Requested</span>
                            </div>
                            <div className="status-item">
                                <span className="status-count">{stats.rides.accepted}</span>
                                <span className="status-label">Accepted</span>
                            </div>
                            <div className="status-item">
                                <span className="status-count">{stats.rides.inProgress}</span>
                                <span className="status-label">In Progress</span>
                            </div>
                            <div className="status-item">
                                <span className="status-count">{stats.rides.completed}</span>
                                <span className="status-label">Completed</span>
                            </div>
                            <div className="status-item">
                                <span className="status-count">{stats.rides.cancelled}</span>
                                <span className="status-label">Cancelled</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'users' && (
                <div className="dashboard-content">
                    <div className="section-header">
                        <h3>Recent Users</h3>
                        <button
                            onClick={() => navigate('/admin/users')}
                            className="btn btn-primary"
                        >
                            View All Users
                        </button>
                    </div>
                    <div className="users-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Joined</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentUsers.map(user => (
                                    <tr key={user._id}>
                                        <td>
                                            <div className="user-info">
                                                <strong>{user.profile.name}</strong>
                                                <small>{user.email || user.phone}</small>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`role-badge role-${user.role}`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                                                {user.isActive ? 'Active' : 'Suspended'}
                                            </span>
                                        </td>
                                        <td>{formatDate(user.createdAt)}</td>
                                        <td>
                                            <div className="action-buttons">
                                                {user.isActive ? (
                                                    <button
                                                        onClick={() => handleUserAction(user._id, 'suspend')}
                                                        className="btn btn-danger btn-sm"
                                                    >
                                                        Suspend
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleUserAction(user._id, 'reactivate')}
                                                        className="btn btn-success btn-sm"
                                                    >
                                                        Reactivate
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'rides' && (
                <div className="dashboard-content">
                    <div className="section-header">
                        <h3>Recent Rides</h3>
                        <button
                            onClick={() => navigate('/admin/rides')}
                            className="btn btn-primary"
                        >
                            View All Rides
                        </button>
                    </div>
                    <div className="rides-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Rider</th>
                                    <th>Driver</th>
                                    <th>Route</th>
                                    <th>Status</th>
                                    <th>Fare</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentRides.map(ride => (
                                    <tr key={ride._id}>
                                        <td>
                                            <div className="user-info">
                                                <strong>{ride.riderId.profile.name}</strong>
                                                <small>{ride.riderId.phone}</small>
                                            </div>
                                        </td>
                                        <td>
                                            {ride.driverId ? (
                                                <div className="user-info">
                                                    <strong>{ride.driverId.profile.name}</strong>
                                                    <small>
                                                        {ride.driverId.driverInfo?.vehicleDetails.make} {ride.driverId.driverInfo?.vehicleDetails.model}
                                                    </small>
                                                </div>
                                            ) : (
                                                <span className="no-driver">No driver assigned</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="route-info">
                                                <div className="pickup">📍 {ride.pickup.address}</div>
                                                <div className="destination">🎯 {ride.destination.address}</div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${getStatusBadgeClass(ride.status)}`}>
                                                {ride.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="fare-info">
                                                <strong>{formatCurrency(ride.fare.final || ride.fare.estimated)}</strong>
                                                {ride.fare.final && (
                                                    <small>Final</small>
                                                )}
                                            </div>
                                        </td>
                                        <td>{formatDate(ride.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboardPage;