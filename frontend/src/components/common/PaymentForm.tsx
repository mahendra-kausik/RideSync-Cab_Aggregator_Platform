import React, { useState } from 'react';
import { paymentService, PaymentRequest } from '../../services/paymentService';
import { Ride } from '../../types';
import LoadingSpinner from './LoadingSpinner';

interface PaymentFormProps {
  ride: Ride;
  onPaymentSuccess: (result: { ride: Ride; receipt: any; transactionId: string }) => void;
  onPaymentError: (error: string) => void;
  onCancel: () => void;
}

const PaymentForm: React.FC<PaymentFormProps> = ({
  ride,
  onPaymentSuccess,
  onPaymentError,
  onCancel
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsProcessing(true);

    try {
      const paymentData: PaymentRequest = {
        rideId: ride._id,
        paymentMethod: 'cash'
      };

      const result = await paymentService.processPayment(paymentData);
      onPaymentSuccess(result);
    } catch (error: any) {
      onPaymentError(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="payment-form">
      <div className="payment-header">
        <h2>Pay for the ride</h2>
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
          <div className="summary-item total">
            <span>Total Amount:</span>
            <span className="amount">{paymentService.formatCurrency(ride.fare.final || ride.fare.estimated)}</span>
          </div>
        </div>
      </div>

      <form onSubmit={handlePaymentSubmit} className="payment-form-content">
        <div className="cash-info">
          <p>Cash payment will be recorded for this ride.</p>
          <p>Please ensure you have paid the driver directly.</p>
        </div>

        <div className="form-actions">
          <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={isProcessing}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isProcessing}>
            {isProcessing ? (
              <>
                <LoadingSpinner size="small" />
                Processing...
              </>
            ) : (
              `Pay ${paymentService.formatCurrency(ride.fare.final || ride.fare.estimated)}`
            )}
          </button>
        </div>
      </form>

      <style>{`
        .payment-form {
          padding: 30px;
          max-width: 600px;
          margin: 0 auto;
        }

        .payment-header {
          text-align: center;
          margin-bottom: 30px;
        }

        .payment-header h2 {
          margin: 0 0 10px 0;
          color: #333;
        }

        .ride-summary {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
        }

        .ride-summary h3 {
          margin: 0 0 15px 0;
          color: #333;
        }

        .summary-details {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .summary-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .summary-item.total {
          border-top: 1px solid #dee2e6;
          padding-top: 10px;
          margin-top: 10px;
          font-weight: 600;
        }

        .amount {
          font-size: 18px;
          color: #28a745;
        }

        .cash-info {
          padding: 20px;
          background: #e7f3ff;
          border-radius: 8px;
          border-left: 4px solid #007bff;
          margin-bottom: 25px;
        }

        .cash-info p {
          margin: 0 0 10px 0;
          color: #333;
        }

        .cash-info p:last-child {
          margin-bottom: 0;
        }

        .form-actions {
          display: flex;
          gap: 15px;
          justify-content: flex-end;
        }

        .btn {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: #007bff;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #0056b3;
        }

        .btn-secondary {
          background: #6c757d;
          color: white;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #5a6268;
        }

        @media (max-width: 768px) {
          .payment-form {
            padding: 20px;
          }

          .form-actions {
            flex-direction: column;
          }

          .btn {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};

export default PaymentForm;
