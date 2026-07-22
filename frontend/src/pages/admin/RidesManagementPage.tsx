import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import adminService, { Ride, PaginatedResponse } from '../../services/adminService';
import { paymentService } from '../../services/paymentService';
import { useAuth } from '../../contexts/AuthContext';
import Receipt from '../../components/common/Receipt';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import './AdminDashboard.css';

const RidesManagementPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [rides, setRides] = useState<Ride[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
    const [rideReceipt, setRideReceipt] = useState<any>(null);
    const [loadingReceipt, setLoadingReceipt] = useState(false);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 10,
        total: 0,
        pages: 0
    });
    const [filters, setFilters] = useState({
        status: '',
        search: '',
        startDate: '',
        endDate: ''
    });

    useEffect(() => {
        if (user?.role !== 'admin') {
            navigate('/auth/login');
            return;
        }
        loadRides();
    }, [user, navigate, pagination.page, filters]);

    const loadRides = async () => {
        try {
            setLoading(true);
            setError(null);

            const params = {
                page: pagination.page,
                limit: pagination.limit,
                ...(filters.status && { status: filters.status }),
                ...(filters.search && { search: filters.search }),
                ...(filters.startDate && { startDate: filters.startDate }),
                ...(filters.endDate && { endDate: filters.endDate })
            };

            const response: PaginatedResponse<Ride> = await adminService.getAllRides(params);
            setRides(response.data);
            setPagination(response.pagination);
        } catch (err: any) {
            console.error('Failed to load rides:', err);
            setError(err.response?.data?.error?.message || 'Failed to load rides');
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
    };

    const handlePageChange = (newPage: number) => {
        setPagination(prev => ({ ...prev, page: newPage }));
    };

    const handleViewDetails = async (rideId: string) => {
        const ride = rides.find(r => r._id === rideId);
        if (!ride) {
          return;
        }

        setSelectedRide(ride);

        // Load receipt if ride is completed and payment is done
        if (ride.status === 'completed' && ride.payment?.status === 'completed') {
            try {
                setLoadingReceipt(true);
                const receipt = await paymentService.getReceipt(rideId);
                setRideReceipt(receipt);
            } catch (err: any) {
                console.error('Failed to load receipt:', err);
                // Show modal even without receipt
                setRideReceipt(null);
            } finally {
                setLoadingReceipt(false);
            }
        }
    };

    const handleCloseDetails = () => {
        setSelectedRide(null);
        setRideReceipt(null);
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

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
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

    if (loading && rides.length === 0) {
        return (
            <div className="page-container">
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Loading rides...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-dashboard">
            <div className="dashboard-header">
                <div>
                    <h1>Ride Management</h1>
                    <p>Monitor and manage all platform rides</p>
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
                        <label>Search Rides</label>
                        <input
                            type="text"
                            placeholder="Search by rider, driver, or location..."
                            value={filters.search}
                            onChange={(e) => handleFilterChange('search', e.target.value)}
                            className="filter-input"
                        />
                    </div>

                    <div className="filter-group">
                        <label>Status</label>
                        <select
                            value={filters.status}
                            onChange={(e) => handleFilterChange('status', e.target.value)}
                            className="filter-select"
                        >
                            <option value="">All Status</option>
                            <option value="requested">Requested</option>
                            <option value="matched">Matched</option>
                            <option value="accepted">Accepted</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>Date Range</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="date"
                                value={filters.startDate}
                                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                                className="filter-input"
                                style={{ flex: 1 }}
                            />
                            <input
                                type="date"
                                value={filters.endDate}
                                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                                className="filter-input"
                                style={{ flex: 1 }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Rides Table */}
            <div className="rides-table">
                <table>
                    <thead>
                        <tr>
                            <th>Ride ID</th>
                            <th>Rider</th>
                            <th>Driver</th>
                            <th>Route</th>
                            <th>Status</th>
                            <th>Fare</th>
                            <th>Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rides.map(ride => (
                            <tr key={ride._id}>
                                <td>
                                    <code className="ride-id">
                                        {ride._id.slice(-8)}
                                    </code>
                                </td>
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
                                        {ride.fare.final ? (
                                            <small>Final</small>
                                        ) : (
                                            <small>Estimated</small>
                                        )}
                                    </div>
                                </td>
                                <td>{formatDate(ride.createdAt)}</td>
                                <td>
                                    <div className="action-buttons">
                                        <button
                                            onClick={() => handleViewDetails(ride._id)}
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
                        ({pagination.total} total rides)
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

            {loading && rides.length > 0 && (
                <div className="loading-overlay">
                    <div className="spinner"></div>
                </div>
            )}

            {/* Ride Details Modal */}
            {selectedRide && (
                <div className="modal-overlay" onClick={handleCloseDetails}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Ride Details</h2>
                            <button className="close-btn" onClick={handleCloseDetails}>×</button>
                        </div>

                        {loadingReceipt ? (
                            <div className="modal-loading">
                                <LoadingSpinner message="Loading details..." />
                            </div>
                        ) : rideReceipt ? (
                            <Receipt receipt={rideReceipt} onClose={handleCloseDetails} />
                        ) : (
                            <div className="modal-body">
                                <div className="detail-section">
                                    <h3>Ride Information</h3>
                                    <div className="detail-item">
                                        <span className="detail-label">Ride ID:</span>
                                        <span>{selectedRide._id}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Status:</span>
                                        <span className={`status-badge ${getStatusBadgeClass(selectedRide.status)}`}>
                                            {selectedRide.status.replace('_', ' ').toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Created At:</span>
                                        <span>{formatDate(selectedRide.createdAt)}</span>
                                    </div>
                                    {selectedRide.timeline?.completedAt && (
                                        <div className="detail-item">
                                            <span className="detail-label">Completed At:</span>
                                            <span>{formatDate(selectedRide.timeline.completedAt)}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="detail-section">
                                    <h3>Rider Information</h3>
                                    <div className="detail-item">
                                        <span className="detail-label">Name:</span>
                                        <span>{selectedRide.riderId.profile.name}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Contact:</span>
                                        <span>{selectedRide.riderId.phone || 'N/A'}</span>
                                    </div>
                                </div>

                                {selectedRide.driverId && (
                                    <div className="detail-section">
                                        <h3>Driver Information</h3>
                                        <div className="detail-item">
                                            <span className="detail-label">Name:</span>
                                            <span>{selectedRide.driverId.profile.name}</span>
                                        </div>
                                        <div className="detail-item">
                                            <span className="detail-label">Contact:</span>
                                            <span>{selectedRide.driverId.phone || 'N/A'}</span>
                                        </div>
                                        {selectedRide.driverId.driverInfo?.vehicleDetails && (
                                            <>
                                                <div className="detail-item">
                                                    <span className="detail-label">Vehicle:</span>
                                                    <span>{selectedRide.driverId.driverInfo.vehicleDetails.make} {selectedRide.driverId.driverInfo.vehicleDetails.model}</span>
                                                </div>
                                                <div className="detail-item">
                                                    <span className="detail-label">Plate Number:</span>
                                                    <span>{selectedRide.driverId.driverInfo.vehicleDetails.plateNumber}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                <div className="detail-section">
                                    <h3>Route</h3>
                                    <div className="detail-item">
                                        <span className="detail-label">📍 Pickup:</span>
                                        <span>{selectedRide.pickup.address}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">🎯 Destination:</span>
                                        <span>{selectedRide.destination.address}</span>
                                    </div>
                                </div>

                                <div className="detail-section">
                                    <h3>Fare Details</h3>
                                    <div className="detail-item">
                                        <span className="detail-label">Estimated Fare:</span>
                                        <span>{formatCurrency(selectedRide.fare.estimated)}</span>
                                    </div>
                                    {selectedRide.fare.final && (
                                        <div className="detail-item">
                                            <span className="detail-label">Final Fare:</span>
                                            <span className="detail-value-highlight">{formatCurrency(selectedRide.fare.final)}</span>
                                        </div>
                                    )}
                                </div>

                                {selectedRide.payment && (
                                    <div className="detail-section">
                                        <h3>Payment</h3>
                                        <div className="detail-item">
                                            <span className="detail-label">Status:</span>
                                            <span className={`status-badge status-${selectedRide.payment.status}`}>
                                                {selectedRide.payment.status.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="detail-item">
                                            <span className="detail-label">Method:</span>
                                            <span>{selectedRide.payment.method.toUpperCase()}</span>
                                        </div>
                                    </div>
                                )}

                                {(selectedRide.rating?.driverRating || selectedRide.rating?.riderRating) && (
                                    <div className="detail-section">
                                        <h3>Ratings</h3>
                                        {selectedRide.rating?.driverRating && (
                                            <div className="detail-item">
                                                <span className="detail-label">Driver Rating:</span>
                                                <span>⭐ {selectedRide.rating.driverRating.toFixed(1)}</span>
                                            </div>
                                        )}
                                        {selectedRide.rating?.riderRating && (
                                            <div className="detail-item">
                                                <span className="detail-label">Rider Rating:</span>
                                                <span>⭐ {selectedRide.rating.riderRating.toFixed(1)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RidesManagementPage;