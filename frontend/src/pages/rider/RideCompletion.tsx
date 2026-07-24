import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { rideService } from '../../services/rideService';
import { paymentService } from '../../services/paymentService';
import { Ride } from '../../types';
import PaymentForm from '../../components/common/PaymentForm';
import RatingForm from '../../components/common/RatingForm';
import Receipt from '../../components/common/Receipt';
import LoadingSpinner from '../../components/common/LoadingSpinner';

type CompletionStep = 'loading' | 'payment' | 'rating' | 'receipt' | 'complete';

const RideCompletion: React.FC = () => {
  const { rideId } = useParams<{ rideId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [ride, setRide] = useState<Ride | null>(null);
  const [currentStep, setCurrentStep] = useState<CompletionStep>('loading');
  const [receipt, setReceipt] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (rideId) {
      loadRideDetails();
    }
  }, [rideId]);

  const loadRideDetails = async () => {
    try {
      setIsLoading(true);
      const rideData = await rideService.getRideById(rideId!);
      setRide(rideData);

      // Determine the appropriate step based on ride status and payment status
      if (rideData.status !== 'completed') {
        setError('This ride is not yet completed');
        return;
      }

      // Extract IDs properly (handle both string and populated object)
      const riderIdString = typeof rideData.riderId === 'string'
        ? rideData.riderId
        : (rideData.riderId as any)?._id || rideData.riderId;
      const driverIdString = typeof rideData.driverId === 'string'
        ? rideData.driverId
        : (rideData.driverId as any)?._id || rideData.driverId;

      const isRider = riderIdString === user?._id;
      const isDriver = driverIdString === user?._id;

      console.log('🔍 Authorization check:', {
        riderIdString,
        driverIdString,
        userId: user?._id,
        isRider,
        isDriver
      });

      // Drivers skip payment step, go directly to rating or complete
      if (isDriver) {
        const hasRated = rideData.rating?.riderRating !== null && rideData.rating?.riderRating !== undefined;
        if (hasRated) {
          setCurrentStep('complete');
        } else {
          setCurrentStep('rating');
        }
      } else if (isRider) {
        // Rider flow includes payment
        if (rideData.payment?.status === 'completed') {
          const hasRated = rideData.rating?.driverRating !== null && rideData.rating?.driverRating !== undefined;
          if (hasRated) {
            setCurrentStep('complete');
          } else {
            setCurrentStep('rating');
          }
        } else {
          // Payment not completed yet
          setCurrentStep('payment');
        }
      } else {
        setError('You are not authorized to view this ride');
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSuccess = (result: { ride: Ride; receipt: any; transactionId: string }) => {
    setRide(result.ride);
    setReceipt(result.receipt);
    setCurrentStep('rating');
  };

  const handlePaymentError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleRatingSuccess = async (updatedRide: Ride) => {
    setRide(updatedRide);
    // Load receipt before showing receipt step
    if (!receipt) {
      try {
        const receiptData = await paymentService.getReceipt(updatedRide._id);
        setReceipt(receiptData);
      } catch (error: any) {
        console.error('Error loading receipt:', error);
        setError(error.message);
        return;
      }
    }
    setCurrentStep('receipt');
  };

  const handleRatingError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleSkipRating = async () => {
    // Load receipt before showing receipt step
    if (!receipt && ride) {
      try {
        const receiptData = await paymentService.getReceipt(ride._id);
        setReceipt(receiptData);
      } catch (error: any) {
        console.error('Error loading receipt:', error);
        setError(error.message);
        return;
      }
    }
    setCurrentStep('receipt');
  };

  const handleViewReceipt = async () => {
    if (!receipt && ride) {
      try {
        const receiptData = await paymentService.getReceipt(ride._id);
        setReceipt(receiptData);
      } catch (error: any) {
        console.error('Error loading receipt:', error);
        setError(error.message);
        return;
      }
    }
    setCurrentStep('receipt');
  };

  const handleCloseReceipt = () => {
    setCurrentStep('complete');
  };

  const handleGoHome = () => {
    if (user?.role === 'driver') {
      navigate('/driver/dashboard');
    } else {
      // Rider doesn't have a /rider/dashboard route; send to booking page
      navigate('/rider/book');
    }
  };

  const handleBookAnother = () => {
    try {
      // Clear any persisted active ride so booking page resets to initial state
      localStorage.removeItem('currentRideId');
    } catch {
      // ignore — best-effort cleanup
    }
    navigate('/rider/book');
  };

  if (isLoading) {
    return (
      <div className="completion-loading">
        <LoadingSpinner />
        <p>Loading ride details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="completion-error">
        <div className="error-content">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={handleGoHome} className="btn btn-primary">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!ride || !user) {
    return (
      <div className="completion-error">
        <div className="error-content">
          <h2>Ride Not Found</h2>
          <p>The requested ride could not be found.</p>
          <button onClick={handleGoHome} className="btn btn-primary">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 'payment':
        return (
          <PaymentForm
            ride={ride}
            onPaymentSuccess={handlePaymentSuccess}
            onPaymentError={handlePaymentError}
            onCancel={handleGoHome}
          />
        );

      case 'rating':
        return (
          <RatingForm
            ride={ride}
            user={user}
            onRatingSuccess={handleRatingSuccess}
            onRatingError={handleRatingError}
            onCancel={handleSkipRating}
          />
        );

      case 'receipt':
        return receipt ? (
          <Receipt
            receipt={receipt}
            onClose={handleCloseReceipt}
          />
        ) : (
          <div className="receipt-loading">
            <LoadingSpinner />
            <p>Loading receipt...</p>
          </div>
        );

      case 'complete':
        return (
          <div className="completion-summary">
            <div className="completion-header">
              <div className="success-icon">✓</div>
              <h2>Ride Completed!</h2>
              <p>Thank you for using our service</p>
            </div>

            <div className="ride-summary">
              <h3>Trip Summary</h3>
              <div className="summary-details">
                <div className="summary-item">
                  <span>From:</span>
                  <span>{ride.pickup.address}</span>
                </div>
                <div className="summary-item">
                  <span>To:</span>
                  <span>{ride.destination.address}</span>
                </div>
                <div className="summary-item">
                  <span>Total Fare:</span>
                  <span>{paymentService.formatCurrency(ride.fare.final || ride.fare.estimated)}</span>
                </div>
                <div className="summary-item">
                  <span>Payment Status:</span>
                  <span className={`status ${ride.payment?.status || 'pending'}`}>
                    {(ride.payment?.status || 'pending').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            <div className="completion-actions">
              <button onClick={handleViewReceipt} className="btn btn-secondary">
                View Receipt
              </button>
              {user?.role === 'rider' && (
                <button onClick={handleBookAnother} className="btn btn-primary">
                  Book Another Ride
                </button>
              )}
              <button onClick={handleGoHome} className="btn btn-outline">
                Go to Dashboard
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="ride-completion">
      <div className="completion-container">
        <div className="progress-indicator">
          {user?.role === 'rider' && (
            <div className={`step ${currentStep === 'payment' || currentStep === 'loading' ? 'active' : 'completed'}`}>
              <span className="step-number">1</span>
              <span className="step-label">Payment</span>
            </div>
          )}
          <div className={`step ${currentStep === 'rating' || (user?.role === 'driver' && currentStep === 'loading') ? 'active' : currentStep === 'receipt' || currentStep === 'complete' ? 'completed' : ''}`}>
            <span className="step-number">{user?.role === 'driver' ? '1' : '2'}</span>
            <span className="step-label">Rating</span>
          </div>
          <div className={`step ${currentStep === 'receipt' || currentStep === 'complete' ? 'active' : ''}`}>
            <span className="step-number">{user?.role === 'driver' ? '2' : '3'}</span>
            <span className="step-label">Complete</span>
          </div>
        </div>

        <div className="step-content">
          {renderStepContent()}
        </div>
      </div>

      <style>{`
        .ride-completion {
          min-height: 100vh;
          background: #f8f9fa;
          padding: 20px;
        }

        .completion-container {
          max-width: 800px;
          margin: 0 auto;
        }

        .progress-indicator {
          display: flex;
          justify-content: center;
          margin-bottom: 40px;
          padding: 20px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
          position: relative;
        }

        .step:not(:last-child)::after {
          content: '';
          position: absolute;
          top: 15px;
          right: -50%;
          width: 100%;
          height: 2px;
          background: #dee2e6;
          z-index: 1;
        }

        .step.completed:not(:last-child)::after {
          background: #28a745;
        }

        .step-number {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: #dee2e6;
          color: #6c757d;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          margin-bottom: 8px;
          position: relative;
          z-index: 2;
        }

        .step.active .step-number {
          background: #007bff;
          color: white;
        }

        .step.completed .step-number {
          background: #28a745;
          color: white;
        }

        .step-label {
          font-size: 14px;
          color: #6c757d;
          font-weight: 500;
        }

        .step.active .step-label {
          color: #007bff;
        }

        .step.completed .step-label {
          color: #28a745;
        }

        .step-content {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .completion-loading,
        .completion-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          padding: 40px;
          text-align: center;
        }

        .error-content h2 {
          color: #dc3545;
          margin-bottom: 15px;
        }

        .error-content p {
          color: #6c757d;
          margin-bottom: 25px;
        }

        .completion-summary {
          padding: 40px;
          text-align: center;
        }

        .completion-header {
          margin-bottom: 40px;
        }

        .success-icon {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: #28a745;
          color: white;
          font-size: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
        }

        .completion-header h2 {
          margin: 0 0 10px 0;
          color: #333;
        }

        .completion-header p {
          margin: 0;
          color: #6c757d;
        }

        .ride-summary {
          background: #f8f9fa;
          padding: 25px;
          border-radius: 8px;
          margin-bottom: 30px;
          text-align: left;
        }

        .ride-summary h3 {
          margin: 0 0 20px 0;
          color: #333;
          text-align: center;
        }

        .summary-details {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .summary-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .summary-item span:first-child {
          font-weight: 500;
          color: #333;
        }

        .summary-item span:last-child {
          color: #6c757d;
        }

        .status {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }

        .status.completed {
          background: #d4edda;
          color: #155724;
        }

        .status.pending {
          background: #fff3cd;
          color: #856404;
        }

        .status.failed {
          background: #f8d7da;
          color: #721c24;
        }

        .completion-actions {
          display: flex;
          gap: 15px;
          justify-content: center;
        }

        .btn {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition    ;
          text-decoration: none;
          display: inline-block;
        }

        .btn-primary {
          background: #007bff;
          color: white;
        }

        .btn-primary:hover {
          background: #0056b3;
        }

        .btn-secondary {
          background: #6c757d;
          color: white;
        }

        .btn-secondary:hover {
          background: #5a6268;
        }

        .btn-outline {
          background: transparent;
          color: #007bff;
          border: 1px solid #007bff;
        }

        .btn-outline:hover {
          background: #007bff;
          color: white;
        }

        .receipt-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px;
        }

        @media (max-width: 768px) {
          .ride-completion {
            padding: 10px;
          }

          .progress-indicator {
            padding: 15px;
          }

          .step-label {
            font-size: 12px;
          }

          .completion-summary {
            padding: 30px 20px;
          }

          .completion-actions {
            flex-direction: column;
          }

          .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default RideCompletion;