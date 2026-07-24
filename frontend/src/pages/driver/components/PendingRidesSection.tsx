import React from 'react';
import { Ride } from '../../../types';

interface PendingRidesSectionProps {
  rides: Ride[];
  onAcceptRide: (rideId: string) => void;
  isAvailable: boolean;
  onRefresh: () => void;
}

const PendingRidesSection: React.FC<PendingRidesSectionProps> = ({
  rides,
  onAcceptRide,
  isAvailable,
  onRefresh
}) => {
  // Ensure rides is always an array
  const safeRides = Array.isArray(rides) ? rides : [];

  const formatTimeAgo = (dateString: string): string => {
    const now = new Date();
    const requestTime = new Date(dateString);
    const diffMinutes = Math.floor((now.getTime() - requestTime.getTime()) / (1000 * 60));

    if (diffMinutes < 1) {
      return 'Just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  if (!isAvailable) {
    return (
      <div className="pending-rides-section">
        <div className="offline-message">
          <h3>You're currently offline</h3>
          <p>Turn on availability to start receiving ride requests</p>
          <div className="offline-icon">🚗💤</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pending-rides-section">
      <div className="section-header">
        <h3>Pending Ride Requests ({safeRides.length})</h3>
        <button className="btn btn-outline" onClick={onRefresh}>
          🔄 Refresh
        </button>
      </div>

      {safeRides.length === 0 ? (
        <div className="no-rides">
          <div className="no-rides-icon">🔍</div>
          <h4>No pending ride requests</h4>
          <p>We'll notify you when new requests come in your area</p>
          <small>Make sure your location is enabled for better matching</small>
        </div>
      ) : (
        <div className="rides-list">
          {safeRides.map((ride) => (
            <div key={ride._id} className="ride-card">
              <div className="ride-header">
                <span className="ride-time">
                  {formatTimeAgo(ride.timeline.requestedAt)}
                </span>
                <span className="ride-fare">{formatCurrency(ride.fare.estimated)}</span>
              </div>

              <div className="ride-info">
                <div className="locations">
                  <div className="location">
                    <span className="icon pickup">📍</span>
                    <div className="location-text">
                      <strong>Pickup</strong>
                      <span>{ride.pickup.address}</span>
                    </div>
                  </div>
                  <div className="location-divider">
                    <div className="divider-line"></div>
                    <span className="divider-icon">↓</span>
                  </div>
                  <div className="location">
                    <span className="icon destination">🎯</span>
                    <div className="location-text">
                      <strong>Destination</strong>
                      <span>{ride.destination.address}</span>
                    </div>
                  </div>
                </div>

                <div className="ride-meta">
                  <div className="meta-item">
                    <span className="meta-label">Distance</span>
                    <span className="meta-value">{ride.estimatedDistance.toFixed(1)} km</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Est. Time</span>
                    <span className="meta-value">
                      {Math.ceil(ride.estimatedDuration)} min
                    </span>
                  </div>
                </div>
              </div>

              <div className="ride-actions">
                <button
                  className="btn btn-primary btn-accept"
                  onClick={() => onAcceptRide(ride._id)}
                >
                  Accept Ride
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PendingRidesSection;