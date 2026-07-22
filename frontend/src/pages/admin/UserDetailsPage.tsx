import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import adminService, { User, UserStats } from '../../services/adminService';
import { useAuth } from '../../contexts/AuthContext';
import './AdminDashboard.css';

const UserDetailsPage: React.FC = () => {
    const navigate = useNavigate();
    const { userId } = useParams<{ userId: string }>();
    const { user: currentUser } = useAuth();
    const [user, setUser] = useState<User | null>(null);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (currentUser?.role !== 'admin') {
            navigate('/auth/login');
            return;
        }
        if (userId) {
            loadUserDetails();
        }
    }, [currentUser, navigate, userId]);

    const loadUserDetails = async () => {
        if (!userId) {
          return;
        }

        try {
            setLoading(true);
            setError(null);

            const response = await adminService.getUserById(userId);
            setUser(response.user);
            setStats(response.stats);
        } catch (err: any) {
            console.error('Failed to load user details:', err);
            setError(err.response?.data?.error?.message || 'Failed to load user details');
        } finally {
            setLoading(false);
        }
    };

    const handleUserAction = async (action: 'suspend' | 'reactivate') => {
        if (!user) {
          return;
        }

        const reason = prompt(`Please provide a reason for ${action}ing this user:`);
        if (reason === null) {
          return;
        }

        try {
            if (action === 'suspend') {
                await adminService.suspendUser(user._id, reason);
            } else {
                await adminService.reactivateUser(user._id, reason);
            }
            await loadUserDetails();
        } catch (err: any) {
            console.error(`Failed to ${action} user:`, err);
            setError(err.response?.data?.error?.message || `Failed to ${action} user`);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Loading user details...</p>
                </div>
            </div>
        );
    }

    if (error || !user) {
        return (
            <div className="page-container">
                <div className="error-message">
                    <h3>Error Loading User Details</h3>
                    <p>{error || 'User not found'}</p>
                    <button onClick={() => navigate('/admin/users')} className="btn btn-secondary">
                        Back to Users
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-dashboard">
            <div className="dashboard-header">
                <div>
                    <h1>User Details</h1>
                    <p>Detailed information for {user.profile.name}</p>
                </div>
                <div className="header-actions">
                    <button
                        onClick={() => navigate('/admin/users')}
                        className="btn btn-secondary"
                    >
                        Back to Users
                    </button>
                    {user.isActive ? (
                        <button
                            onClick={() => handleUserAction('suspend')}
                            className="btn btn-danger"
                        >
                            Suspend User
                        </button>
                    ) : (
                        <button
                            onClick={() => handleUserAction('reactivate')}
                            className="btn btn-success"
                        >
                            Reactivate User
                        </button>
                    )}
                </div>
            </div>

            <div className="user-details-grid">
                <div className="detail-card">
                    <h3>User Information</h3>
                    <div className="detail-content">
                        <div className="detail-row">
                            <span className="detail-label">Name:</span>
                            <span className="detail-value">{user.profile.name}</span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Role:</span>
                            <span className={`role-badge role-${user.role}`}>
                                {user.role}
                            </span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Status:</span>
                            <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                                {user.isActive ? 'Active' : 'Suspended'}
                            </span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Email:</span>
                            <span className="detail-value">{user.email || 'Not provided'}</span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Phone:</span>
                            <span className="detail-value">{user.phone || 'Not provided'}</span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Joined:</span>
                            <span className="detail-value">{formatDate(user.createdAt)}</span>
                        </div>
                    </div>
                </div>

                <div className="detail-card">
                    <h3>Statistics</h3>
                    <div className="detail-content">
                        <div className="detail-row">
                            <span className="detail-label">Total Rides:</span>
                            <span className="detail-value">{stats?.totalRides || 0}</span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Completed Rides:</span>
                            <span className="detail-value">{stats?.completedRides || 0}</span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Rating:</span>
                            <span className="detail-value">
                                {user.profile.rating > 0 ? (
                                    <>⭐ {user.profile.rating.toFixed(1)}</>
                                ) : (
                                    <span className="no-rating">No rating</span>
                                )}
                            </span>
                        </div>
                        {user.role === 'driver' && (
                            <div className="detail-row">
                                <span className="detail-label">Total Earnings:</span>
                                <span className="detail-value">{formatCurrency(stats?.totalEarnings || 0)}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserDetailsPage;