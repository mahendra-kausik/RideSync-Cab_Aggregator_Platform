import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { rideService } from '../../services/rideService';
import { paymentService } from '../../services/paymentService';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Ride } from '../../types';
import Receipt from '../../components/common/Receipt';
import './DriverMyRides.css';

const DriverMyRides: React.FC = () => {
    const navigate = useNavigate();
    const [rides, setRides] = useState<Ride[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
    const [rideReceipt, setRideReceipt] = useState<any>(null);
    const [loadingReceipt, setLoadingReceipt] = useState(false);

    useEffect(() => {
        fetchRides();
    }, [currentPage]);

    const fetchRides = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await rideService.getRideHistory(currentPage, 10);
            setRides(data.rides);
            setTotalPages(data.pages);
        } catch (err: any) {
            setError(err.message || 'Failed to load rides');
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case 'completed':
                return 'status-badge status-completed';
            case 'cancelled':
                return 'status-badge status-cancelled';
            case 'in_progress':
                return 'status-badge status-in-progress';
            case 'accepted':
                return 'status-badge status-accepted';
            case 'requested':
            case 'matched':
                return 'status-badge status-requested';
            default:
                return 'status-badge';
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
        }).format(amount);
    };

    const filteredRides = filterStatus === 'all'
        ? rides
        : rides.filter(ride => ride.status === filterStatus);

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

    const calculateEarnings = () => {
        return rides
            .filter(ride => ride.status === 'completed')
            .reduce((total, ride) => total + ((ride.fare.final || ride.fare.estimated) * 0.8), 0);
    };

    if (isLoading) {
        return <LoadingSpinner message="Loading your rides..." />;
    }

    return (
        <div className="driver-my-rides">
            <div className="rides-header">
                <div>
                    <h1>My Rides</h1>
                    <p className="rides-subtitle">Track your ride history and earnings</p>
                </div>
                <button className="btn-primary" onClick={() => navigate('/driver/dashboard')}>
                    Back to Dashboard
                </button>
            </div>

            {error && (
                <div className="error-message">
                    <span className="error-icon">⚠️</span>
                    {error}
                </div>
            )}

            {/* Earnings Summary */}
            <div className="earnings-summary">
                <div className="earnings-card">
                    <div className="earnings-icon">💰</div>
                    <div className="earnings-content">
                        <span className="earnings-label">Total Earnings</span>
                        <span className="earnings-value">{formatCurrency(calculateEarnings())}</span>
                    </div>
                </div>

                <div className="earnings-card">
                    <div className="earnings-icon">✅</div>
                    <div className="earnings-content">
                        <span className="earnings-label">Completed Rides</span>
                        <span className="earnings-value">
                            {rides.filter(r => r.status === 'completed').length}
                        </span>
                    </div>
                </div>

                <div className="earnings-card">
                    <div className="earnings-icon">📊</div>
                    <div className="earnings-content">
                        <span className="earnings-label">Total Rides</span>
                        <span className="earnings-value">{rides.length}</span>
                    </div>
                </div>
            </div>

            <div className="rides-filters">
                <button
                    className={filterStatus === 'all' ? 'filter-btn active' : 'filter-btn'}
                    onClick={() => setFilterStatus('all')}
                >
                    All Rides
                </button>
                <button
                    className={filterStatus === 'completed' ? 'filter-btn active' : 'filter-btn'}
                    onClick={() => setFilterStatus('completed')}
                >
                    Completed
                </button>
                <button
                    className={filterStatus === 'in_progress' ? 'filter-btn active' : 'filter-btn'}
                    onClick={() => setFilterStatus('in_progress')}
                >
                    In Progress
                </button>
                <button
                    className={filterStatus === 'accepted' ? 'filter-btn active' : 'filter-btn'}
                    onClick={() => setFilterStatus('accepted')}
                >
                    Accepted
                </button>
                <button
                    className={filterStatus === 'cancelled' ? 'filter-btn active' : 'filter-btn'}
                    onClick={() => setFilterStatus('cancelled')}
                >
                    Cancelled
                </button>
            </div>

            {filteredRides.length === 0 ? (
                <div className="no-rides">
                    <div className="no-rides-icon">🚗</div>
                    <h3>No rides found</h3>
                    <p>
                        {filterStatus === 'all'
                            ? 'You haven\'t completed any rides yet.'
                            : `You don't have any ${filterStatus} rides.`}
                    </p>
                    <button className="btn-primary" onClick={() => navigate('/driver/dashboard')}>
                        Go to Dashboard
                    </button>
                </div>
            ) : (
                <>
                    <div className="rides-list">
                        {filteredRides.map((ride) => (
                            <div key={ride._id} className="ride-card">
                                <div className="ride-card-header">
                                    <span className={getStatusBadgeClass(ride.status)}>
                                        {ride.status.replace('_', ' ').toUpperCase()}
                                    </span>
                                    <span className="ride-date">{formatDate(ride.timeline.requestedAt)}</span>
                                </div>

                                <div className="ride-card-body">
                                    <div className="ride-locations">
                                        <div className="location-item">
                                            <span className="location-icon pickup">📍</span>
                                            <div className="location-details">
                                                <span className="location-label">Pickup</span>
                                                <span className="location-address">{ride.pickup.address}</span>
                                            </div>
                                        </div>

                                        <div className="location-divider"></div>

                                        <div className="location-item">
                                            <span className="location-icon destination">🎯</span>
                                            <div className="location-details">
                                                <span className="location-label">Destination</span>
                                                <span className="location-address">{ride.destination.address}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="ride-info">
                                        <div className="info-item">
                                            <span className="info-label">Earnings</span>
                                            <span className="info-value earnings">
                                                {formatCurrency((ride.fare.final || ride.fare.estimated) * 0.8)}
                                            </span>
                                        </div>

                                        {ride.rating?.driverRating && (
                                            <div className="info-item">
                                                <span className="info-label">Rider Rating</span>
                                                <span className="info-value rating">
                                                    ⭐ {ride.rating.driverRating.toFixed(1)}
                                                </span>
                                            </div>
                                        )}

                                        {ride.timeline.completedAt && ride.timeline.startedAt && (
                                            <div className="info-item">
                                                <span className="info-label">Duration</span>
                                                <span className="info-value">
                                                    {Math.round(
                                                        (new Date(ride.timeline.completedAt).getTime() -
                                                            new Date(ride.timeline.startedAt).getTime()) /
                                                        60000
                                                    )}{' '}
                                                    min
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="ride-card-footer">
                                    <button
                                        className="btn-secondary btn-sm"
                                        onClick={() => handleViewDetails(ride._id)}
                                    >
                                        View Details
                                    </button>

                                    {ride.status === 'completed' && !ride.rating?.riderRating && (
                                        <button
                                            className="btn-primary btn-sm"
                                            onClick={() => navigate(`/driver/completion/${ride._id}`)}
                                        >
                                            Rate Rider
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {totalPages > 1 && (
                        <div className="pagination">
                            <button
                                className="pagination-btn"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(currentPage - 1)}
                            >
                                Previous
                            </button>
                            <span className="pagination-info">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                className="pagination-btn"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(currentPage + 1)}
                            >
                                Next
                            </button>
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
                                            <h3>Trip Information</h3>
                                            <div className="detail-item">
                                                <span className="detail-label">Status:</span>
                                                <span className={getStatusBadgeClass(selectedRide.status)}>
                                                    {selectedRide.status.replace('_', ' ').toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="detail-label">Requested At:</span>
                                                <span>{formatDate(selectedRide.timeline.requestedAt)}</span>
                                            </div>
                                            {selectedRide.timeline.completedAt && (
                                                <div className="detail-item">
                                                    <span className="detail-label">Completed At:</span>
                                                    <span>{formatDate(selectedRide.timeline.completedAt)}</span>
                                                </div>
                                            )}
                                            {selectedRide.timeline.startedAt && selectedRide.timeline.completedAt && (
                                                <div className="detail-item">
                                                    <span className="detail-label">Duration:</span>
                                                    <span>
                                                        {Math.round(
                                                            (new Date(selectedRide.timeline.completedAt).getTime() -
                                                                new Date(selectedRide.timeline.startedAt).getTime()) /
                                                            60000
                                                        )} min
                                                    </span>
                                                </div>
                                            )}
                                        </div>

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
                                            <h3>Fare & Earnings</h3>
                                            <div className="detail-item">
                                                <span className="detail-label">Estimated Fare:</span>
                                                <span>{formatCurrency(selectedRide.fare.estimated)}</span>
                                            </div>
                                            {selectedRide.fare.final && (
                                                <>
                                                    <div className="detail-item">
                                                        <span className="detail-label">Final Fare:</span>
                                                        <span>{formatCurrency(selectedRide.fare.final)}</span>
                                                    </div>
                                                    <div className="detail-item">
                                                        <span className="detail-label">Your Earnings (80%):</span>
                                                        <span className="detail-value-highlight">
                                                            {formatCurrency(selectedRide.fare.final * 0.8)}
                                                        </span>
                                                    </div>
                                                </>
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

                                        {selectedRide.rating?.driverRating && (
                                            <div className="detail-section">
                                                <h3>Rider's Rating</h3>
                                                <div className="detail-item">
                                                    <span className="detail-label">Rating:</span>
                                                    <span>⭐ {selectedRide.rating.driverRating.toFixed(1)}</span>
                                                </div>
                                                {selectedRide.rating.driverFeedback && (
                                                    <div className="detail-item">
                                                        <span className="detail-label">Feedback:</span>
                                                        <span>{selectedRide.rating.driverFeedback}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default DriverMyRides;
