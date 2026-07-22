import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import adminService, { User, PaginatedResponse } from '../../services/adminService';
import { useAuth } from '../../contexts/AuthContext';
import './AdminDashboard.css';

const UsersManagementPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 10,
        total: 0,
        pages: 0
    });
    const [filters, setFilters] = useState({
        role: '',
        status: '',
        search: ''
    });

    useEffect(() => {
        if (user?.role !== 'admin') {
            navigate('/auth/login');
            return;
        }
        loadUsers();
    }, [user, navigate, pagination.page, filters]);

    const loadUsers = async () => {
        try {
            setLoading(true);
            setError(null);

            const params = {
                page: pagination.page,
                limit: pagination.limit,
                ...(filters.role && { role: filters.role }),
                ...(filters.status && { status: filters.status }),
                ...(filters.search && { search: filters.search })
            };

            const response: PaginatedResponse<User> = await adminService.getAllUsers(params);
            // Backend already filters out admin users
            setUsers(response.data);
            setPagination(response.pagination);
        } catch (err: any) {
            console.error('Failed to load users:', err);
            setError(err.response?.data?.error?.message || 'Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const handleUserAction = async (userId: string, action: 'suspend' | 'reactivate') => {
        // Prevent admin from suspending admin users (including self)
        const targetUser = users.find(u => u._id === userId);
        if (targetUser?.role === 'admin') {
            setError('Cannot suspend admin users');
            return;
        }

        const reason = prompt(`Please provide a reason for ${action}ing this user:`);
        if (reason === null) {
          return;
        } // User cancelled

        try {
            if (action === 'suspend') {
                await adminService.suspendUser(userId, reason);
            } else {
                await adminService.reactivateUser(userId, reason);
            }
            await loadUsers(); // Refresh data
        } catch (err: any) {
            console.error(`Failed to ${action} user:`, err);
            setError(err.response?.data?.error?.message || `Failed to ${action} user`);
        }
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
    };

    const handlePageChange = (newPage: number) => {
        setPagination(prev => ({ ...prev, page: newPage }));
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

    if (loading && users.length === 0) {
        return (
            <div className="page-container">
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Loading users...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-dashboard">
            <div className="dashboard-header">
                <div>
                    <h1>User Management</h1>
                    <p>Manage platform users and their accounts</p>
                </div>
                <button
                    onClick={() => navigate('/admin')}
                    className="btn btn-secondary"
                >
                    Back to Dashboard
                </button>
            </div>

            {error && (
                <div className="error-message">
                    <p>{error}</p>
                    <button onClick={() => setError(null)} className="btn btn-primary">
                        Dismiss
                    </button>
                </div>
            )}

            {/* Filters */}
            <div className="filters-section">
                <div className="filters-grid">
                    <div className="filter-group">
                        <label>Search Users</label>
                        <input
                            type="text"
                            placeholder="Search by name, email, or phone..."
                            value={filters.search}
                            onChange={(e) => handleFilterChange('search', e.target.value)}
                            className="filter-input"
                        />
                    </div>

                    <div className="filter-group">
                        <label>Role</label>
                        <select
                            value={filters.role}
                            onChange={(e) => handleFilterChange('role', e.target.value)}
                            className="filter-select"
                        >
                            <option value="">All Roles</option>
                            <option value="rider">Rider</option>
                            <option value="driver">Driver</option>
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>Status</label>
                        <select
                            value={filters.status}
                            onChange={(e) => handleFilterChange('status', e.target.value)}
                            className="filter-select"
                        >
                            <option value="">All Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Suspended</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Users Table */}
            <div className="users-table">
                <table>
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Total Rides</th>
                            <th>Rating</th>
                            <th>Joined</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
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
                                <td>{user.profile.totalRides}</td>
                                <td>
                                    {user.profile.rating > 0 ? (
                                        <span>⭐ {user.profile.rating.toFixed(1)}</span>
                                    ) : (
                                        <span className="no-rating">No rating</span>
                                    )}
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
                                        <button
                                            onClick={() => navigate(`/admin/users/${user._id}`)}
                                            className="btn btn-primary btn-sm"
                                        >
                                            View Details
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
                <div className="pagination">
                    <button
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page === 1}
                        className="btn btn-secondary btn-sm"
                    >
                        Previous
                    </button>

                    <span className="pagination-info">
                        Page {pagination.page} of {pagination.pages}
                        ({pagination.total} total users)
                    </span>

                    <button
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page === pagination.pages}
                        className="btn btn-secondary btn-sm"
                    >
                        Next
                    </button>
                </div>
            )}

            {loading && users.length > 0 && (
                <div className="loading-overlay">
                    <div className="spinner"></div>
                </div>
            )}
        </div>
    );
};

export default UsersManagementPage;