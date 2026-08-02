import React, { useEffect, useState } from 'react';
import { Ride } from '../../../types';

interface OfferCardProps {
  offer: {
    rideId: string;
    pickup: Ride['pickup'];
    destination: Ride['destination'];
    estimatedFare: number;
    estimatedDistance: number;
    expiresAt: string;
  };
  onAccept: (rideId: string) => void;
  onDecline: (rideId: string) => void;
  accepting: boolean;
  declining: boolean;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);
};

// Reuses PendingRidesSection's styles (same class names) so this needs no new CSS file.
const OfferCard: React.FC<OfferCardProps> = ({ offer, onAccept, onDecline, accepting, declining }) => {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    setSecondsLeft(Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000)));
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [offer.expiresAt]);

  const busy = accepting || declining;

  return (
    <div className="pending-rides-section offer-card-section">
      <div className="section-header">
        <h3>🔔 New Ride Offer</h3>
        <span className="ride-time">{secondsLeft}s to respond</span>
      </div>

      <div className="rides-list">
        <div className="ride-card">
          <div className="ride-header">
            <span className="ride-fare">{formatCurrency(offer.estimatedFare)}</span>
          </div>

          <div className="ride-info">
            <div className="locations">
              <div className="location">
                <span className="icon pickup">📍</span>
                <div className="location-text">
                  <strong>Pickup</strong>
                  <span>{offer.pickup.address}</span>
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
                  <span>{offer.destination.address}</span>
                </div>
              </div>
            </div>

            <div className="ride-meta">
              <div className="meta-item">
                <span className="meta-label">Distance</span>
                <span className="meta-value">{offer.estimatedDistance.toFixed(1)} km</span>
              </div>
            </div>
          </div>

          <div className="ride-actions">
            <button
              className="btn btn-outline btn-decline"
              onClick={() => onDecline(offer.rideId)}
              disabled={busy}
            >
              {declining ? 'Declining...' : 'Decline'}
            </button>
            <button
              className="btn btn-primary btn-accept"
              onClick={() => onAccept(offer.rideId)}
              disabled={busy}
            >
              {accepting ? 'Accepting...' : 'Accept'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfferCard;
