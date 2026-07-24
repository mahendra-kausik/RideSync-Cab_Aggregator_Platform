import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import './AuthPages.css';

const RegisterPage: React.FC = () => {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [formData, setFormData] = useState({
    phone: '',
    name: '',
    otp: '',
    password: '',
    role: 'rider' as 'rider' | 'driver',
    // Driver-specific fields
    licenseNumber: '',
    vehicleMake: '',
    vehicleModel: '',
    vehiclePlateNumber: '',
    vehicleColor: '',
  });
  const [tempUserData, setTempUserData] = useState<any>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { register, verifyOTP } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Validate driver fields if role is driver
    if (formData.role === 'driver') {
      if (!formData.licenseNumber || !formData.vehicleMake || !formData.vehicleModel ||
        !formData.vehiclePlateNumber || !formData.vehicleColor) {
        setError('All driver information fields are required');
        setIsLoading(false);
        return;
      }
    }

    try {
      const response = await register(formData);
      if (response.success) {
        // Store temp user data for OTP verification
        setTempUserData(response.data?.tempUserData);
        setStep('otp');
      } else {
        setError(response.error?.message || 'Registration failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await verifyOTP(formData.phone, formData.otp, formData.password, tempUserData);
      if (response.success) {
        navigate(formData.role === 'rider' ? '/rider/book' : '/driver/dashboard');
      } else {
        setError(response.error?.message || 'OTP verification failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner message={step === 'phone' ? 'Sending OTP...' : 'Verifying OTP...'} />;
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>🚗 Cab Aggregator</h1>
          <h2>Create Account</h2>
          <p>
            {step === 'phone'
              ? 'Enter your phone number to get started'
              : 'Enter the OTP sent to your phone'
            }
          </p>
        </div>

        {step === 'phone' ? (
          <form onSubmit={handlePhoneSubmit} className="auth-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="role">I want to</label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
              >
                <option value="rider">Book rides</option>
                <option value="driver">Drive and Earn</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                minLength={2}
                maxLength={100}
                pattern="[a-zA-Z\s'.-]+"
                title="Letters, spaces, apostrophes, periods, and hyphens only"
                placeholder="Enter your full name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                inputMode="numeric"
                pattern="\d{10}"
                maxLength={10}
                title="10-digit phone number, no country code or symbols"
                placeholder="1234567890"
              />
            </div>

            {formData.role === 'driver' && (
              <>
                <div className="form-group">
                  <label htmlFor="licenseNumber">Driver's License Number</label>
                  <input
                    type="text"
                    id="licenseNumber"
                    name="licenseNumber"
                    value={formData.licenseNumber}
                    onChange={handleChange}
                    required
                    minLength={5}
                    maxLength={20}
                    pattern="[a-zA-Z0-9-]+"
                    title="Letters, numbers, and hyphens only"
                    placeholder="Enter your license number"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="vehicleMake">Vehicle Company</label>
                  <input
                    type="text"
                    id="vehicleMake"
                    name="vehicleMake"
                    value={formData.vehicleMake}
                    onChange={handleChange}
                    required
                    maxLength={30}
                    pattern="[a-zA-Z\s-]+"
                    title="Letters, spaces, and hyphens only"
                    placeholder="e.g., Toyota"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="vehicleModel">Vehicle Model</label>
                  <input
                    type="text"
                    id="vehicleModel"
                    name="vehicleModel"
                    value={formData.vehicleModel}
                    onChange={handleChange}
                    required
                    maxLength={30}
                    pattern="[a-zA-Z0-9\s-]+"
                    title="Letters, numbers, spaces, and hyphens only"
                    placeholder="e.g., Camry"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="vehiclePlateNumber">License Plate</label>
                  <input
                    type="text"
                    id="vehiclePlateNumber"
                    name="vehiclePlateNumber"
                    value={formData.vehiclePlateNumber}
                    onChange={handleChange}
                    required
                    maxLength={15}
                    pattern="[a-zA-Z0-9\s-]+"
                    title="Letters, numbers, spaces, and hyphens only"
                    placeholder="e.g., ABC123"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="vehicleColor">Vehicle Color</label>
                  <input
                    type="text"
                    id="vehicleColor"
                    name="vehicleColor"
                    value={formData.vehicleColor}
                    onChange={handleChange}
                    required
                    maxLength={20}
                    pattern="[a-zA-Z\s-]+"
                    title="Letters, spaces, and hyphens only"
                    placeholder="e.g., Silver"
                  />
                </div>
              </>
            )}

            <button type="submit" className="auth-button">
              Send OTP
            </button>
          </form>
        ) : (
          <form onSubmit={handleOTPSubmit} className="auth-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="otp">Verification Code</label>
              <input
                type="text"
                id="otp"
                name="otp"
                value={formData.otp}
                onChange={handleChange}
                required
                placeholder="Enter 6-digit code"
                inputMode="numeric"
                pattern="\d{6}"
                title="6-digit numeric code"
                maxLength={6}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Create Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="At least 8 characters, with a letter and a number"
                minLength={8}
                maxLength={128}
                pattern="(?=.*[a-zA-Z])(?=.*\d).+"
                title="At least 8 characters, with at least one letter and one number"
              />
            </div>

            <button type="submit" className="auth-button">
              Verify & Create Account
            </button>

            <button
              type="button"
              className="auth-button secondary"
              onClick={() => setStep('phone')}
            >
              Back to Phone Number
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="auth-link">
              Sign in here
            </Link>
          </p>
        </div>

        {process.env.NODE_ENV === 'development' && step === 'otp' && (
          <div className="demo-info">
            <h3>Development Mode</h3>
            <p>Check the browser console or server logs for the OTP code</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegisterPage;