import React, { useState } from 'react';
import { paymentService, RatingRequest } from '../../services/paymentService';
import { Ride, User } from '../../types';
import LoadingSpinner from './LoadingSpinner';

interface RatingFormProps {
  ride: Ride;
  user: User;
  onRatingSuccess: (updatedRide: Ride) => void;
  onRatingError: (error: string) => void;
  onCancel: () => void;
}

const RatingForm: React.FC<RatingFormProps> = ({
  ride,
  user,
  onRatingSuccess,
  onRatingError,
  onCancel
}) => {
  const [rating, setRating] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hoveredRating, setHoveredRating] = useState<number>(0);

  // Handle both string IDs and populated objects
  const riderIdString = typeof ride.riderId === 'string' ? ride.riderId : (ride.riderId as any)?._id || ride.riderId;
  const isRider = riderIdString === user._id;
  const ratingType = isRider ? 'driver' : 'rider';
  const targetUser = isRider ? 'driver' : 'rider';

  const existingRating = isRider ? ride.rating?.driverRating : ride.rating?.riderRating;
  const hasAlreadyRated = existingRating !== null && existingRating !== undefined;

  const handleSubmitRating = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      onRatingError('Please select a rating');
      return;
    }

    setIsSubmitting(true);

    try {
      const ratingData: RatingRequest = {
        rideId: ride._id,
        rating,
        ratingType
      };

      // Only include feedback if it's not empty
      if (feedback.trim()) {
        ratingData.feedback = feedback.trim();
      }

      const updatedRide = await paymentService.submitRating(ratingData);
      onRatingSuccess(updatedRide);
    } catch (error: any) {
      onRatingError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRatingText = (ratingValue: number): string => {
    switch (ratingValue) {
      case 1: return 'Poor';
      case 2: return 'Fair';
      case 3: return 'Good';
      case 4: return 'Very Good';
      case 5: return 'Excellent';
      default: return '';
    }
  };

  if (hasAlreadyRated) {
    return (
      <div className="rating-form-container">
        <div className="rating-header">
          <h2>Rating Already Submitted</h2>
          <p>You have already rated this {targetUser}.</p>
        </div>

        <div className="existing-rating">
          <div className="rating-display">
            <div className="stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className={`star ${star <= existingRating ? 'filled' : ''}`}
                >
                  ★
                </span>
              ))}
            </div>
            <span className="rating-text">{getRatingText(existingRating)}</span>
          </div>
        </div>

        <div className="form-actions">
          <button onClick={onCancel} className="btn btn-primary">
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rating-form-container">
      <div className="rating-header">
        <h2>Rate Your Experience</h2>
        <p>How was your experience with your {targetUser}?</p>
      </div>

      <form onSubmit={handleSubmitRating} className="rating-form">
        <div className="rating-section">
          <div className="stars-container">
            <div className="stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`star ${star <= (hoveredRating || rating) ? 'filled' : ''}`}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  disabled={isSubmitting}
                >
                  ★
                </button>
              ))}
            </div>
            {(hoveredRating || rating) > 0 && (
              <div className="rating-text">
                {getRatingText(hoveredRating || rating)}
              </div>
            )}
          </div>
        </div>

        <div className="feedback-section">
          <label htmlFor="feedback">
            Additional Feedback (Optional)
          </label>
          <textarea
            id="feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={'Share your experience...'}
            maxLength={500}
            rows={4}
            disabled={isSubmitting}
          />
          <div className="character-count">
            {feedback.length}/500 characters
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary"
            disabled={isSubmitting}
          >
            Skip Rating
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || rating === 0}
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size="small" />
                Submitting...
              </>
            ) : (
              'Submit Rating'
            )}
          </button>
        </div>
      </form>

      <style>{`
        .rating-form-container {
          padding: 30px;
          max-width: 500px;
          margin: 0 auto;
        }

        .rating-header {
          text-align: center;
          margin-bottom: 40px;
        }

        .rating-header h2 {
          margin: 0 0 10px 0;
          color: #333;
        }

        .rating-header p {
          margin: 0;
          color: #6c757d;
        }

        .existing-rating {
          background: #f8f9fa;
          padding: 25px;
          border-radius: 8px;
          margin-bottom: 30px;
          text-align: center;
        }

        .rating-display {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        .rating-section {
          margin-bottom: 30px;
        }

        .stars-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 15px;
        }

        .stars {
          display: flex;
          gap: 8px;
        }

        .star {
          font-size: 32px;
          color: #dee2e6;
          background: none;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          padding: 5px;
          border-radius: 4px;
        }

        .star:hover {
          transform: scale(1.1);
        }

        .star.filled {
          color: #ffc107;
        }

        .star:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .rating-text {
          font-size: 18px;
          font-weight: 600;
          color: #333;
        }

        .feedback-section {
          margin-bottom: 30px;
        }

        .feedback-section label {
          display: block;
          margin-bottom: 10px;
          font-weight: 500;
          color: #333;
        }

        .feedback-section textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          resize: vertical;
          min-height: 100px;
        }

        .feedback-section textarea:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
        }

        .character-count {
          text-align: right;
          font-size: 12px;
          color: #6c757d;
          margin-top: 5px;
        }

        .form-actions {
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
          .rating-form-container {
            padding: 20px;
          }

          .stars {
            gap: 5px;
          }

          .star {
            font-size: 28px;
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

export default RatingForm;