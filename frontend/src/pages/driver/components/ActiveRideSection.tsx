import React from 'react';
import { Ride } from '../../../types';

interface ActiveRideSectionProps {
  ride: Ride;
  onStatusUpdate: (status: Ride['status']) => void;
  // Optional: distance calculated from OSRM route (in km)
  distanceKm?: number;
}

const ActiveRideSection: React.FC<ActiveRideSectionProps> = ({
  ride,
  onStatusUpdate,
  distanceKm
}) => {
  const rider = typeof ride.riderId === 'object' ? ride.riderId : null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const getStatusActions = () => {
    switch (ride.status) {
      case 'matched':
      case 'accepted':
        return (
          <button
            className="btn btn-primary"
            onClick={() => onStatusUpdate('in_progress')}
          >
            Start Ride
          </button>
        );
      case 'in_progress':
        return (
          <button
            className="btn btn-success"
            onClick={() => onStatusUpdate('completed')}
          >
            Complete Ride
          </button>
        );
      default:
        return null;
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="active-ride-section">
      <div className="section-header">
        <h3>Active Ride</h3>
        <span className={`status-badge ${ride.status === 'matched' ? 'accepted' : ride.status}`}>
          {ride.status === 'matched' ? 'ACCEPTED' : ride.status.replace('_', ' ').toUpperCase()}
        </span>
      </div>

      <div className="ride-details">
        <div className="location-info">
          <div className="location-item">
            <span className="location-icon pickup">📍</span>
            <div>
              <strong>Pickup</strong>
              <p>{ride.pickup.address}</p>
              {ride.timeline.acceptedAt && (
                <small>Accepted at {formatTime(ride.timeline.acceptedAt)}</small>
              )}
            </div>
          </div>
          <div className="location-item">
            <span className="location-icon destination">🎯</span>
            <div>
              <strong>Destination</strong>
              <p>{ride.destination.address}</p>
            </div>
          </div>
        </div>

        <div className="ride-info">
          <div className="info-item">
            <strong>Fare:</strong> {formatCurrency(ride.fare.estimated)}
          </div>
          <div className="info-item">
            <strong>Distance:</strong> {(
              typeof distanceKm === 'number' ? distanceKm : ride.estimatedDistance
            ).toFixed(1)} km
          </div>
          {ride.timeline.startedAt && (
            <div className="info-item">
              <strong>Started:</strong> {formatTime(ride.timeline.startedAt)}
            </div>
          )}
        </div>

        {rider && (
          <div className="contact-info">
            <div className="info-item">
              <strong>Rider:</strong> {rider.profile.name}
            </div>
            <div className="info-item">
              <strong>Phone:</strong> <a href={`tel:${rider.phone}`}>{rider.phone}</a>
            </div>
          </div>
        )}

        <div className="ride-actions">
          {getStatusActions()}
          <button
            className="btn btn-outline btn-danger"
            onClick={() => onStatusUpdate('cancelled')}
          >
            Cancel Ride
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActiveRideSection;