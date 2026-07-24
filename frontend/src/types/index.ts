// User and Authentication Types
export interface User {
  _id: string;
  phone?: string;
  email?: string;
  role: 'rider' | 'driver' | 'admin';
  profile: {
    name: string;
    avatar?: string;
    rating: number;
    totalRides: number;
  };
  driverInfo?: {
    licenseNumber: string;
    vehicleDetails: {
      make: string;
      model: string;
      plateNumber: string;
      color: string;
    };
    isAvailable: boolean;
    currentLocation?: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  phone?: string;
  email?: string;
  password?: string;
  otp?: string;
  name?: string;
  role?: 'rider' | 'driver';
  // Driver-specific fields
  licenseNumber?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehiclePlateNumber?: string;
  vehicleColor?: string;
}

// Location and Ride Types
export interface Location {
  address: string;
  coordinates: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
}

export interface Ride {
  _id: string;
  riderId: string;
  driverId?: string;
  status: 'requested' | 'matched' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  pickup: Location;
  destination: Location;
  estimatedDistance: number;
  estimatedDuration: number;
  fare: {
    estimated: number;
    final?: number;
    breakdown: {
      baseFare: number;
      distanceFare: number;
      timeFare: number;
      surgeFare: number;
    };
  };
  timeline: {
    requestedAt: string;
    matchedAt?: string;
    acceptedAt?: string;
    startedAt?: string;
    completedAt?: string;
  };
  payment?: {
    method: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
    transactionId?: string;
    processedAt?: string;
  };
  rating?: {
    riderRating?: number;
    driverRating?: number;
    riderFeedback?: string;
    driverFeedback?: string;
  };
}

// Socket.IO Event Types
export interface SocketEvents {
  // Driver events
  'driver:location-update': (data: { rideId: string; location: [number, number] }) => void; // legacy client format
  'driver:location-updated': (data: { rideId: string; driverId: string; location: { latitude: number; longitude: number; heading?: number | null; speed?: number | null }; timestamp: string }) => void;
  'driver:status-change': (data: { driverId: string; isAvailable: boolean }) => void;

  // Ride events
  'ride:status-change': (data: { rideId: string; status: Ride['status']; timestamp: string }) => void;
  'ride:status-updated': (data: { rideId: string; status: Ride['status']; updatedBy: string; userRole: User['role']; location?: { latitude: number; longitude: number } | null; timestamp: string }) => void;
  'ride:driver-assigned': (data: { rideId: string; driver: User; estimatedArrival: number }) => void;
  'ride:driver-location': (data: { rideId: string; location: [number, number] }) => void; // legacy client format

  // Room management
  'ride:join-room': (data: { rideId: string }) => void;
  'ride:leave-room': (data: { rideId: string }) => void;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: string;
    timestamp: string;
  };
}

// Component Props Types
export interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: User['role'];
  redirectTo?: string;
}

export interface LayoutProps {
  children: React.ReactNode;
  showNavigation?: boolean;
  title?: string;
}

// Form Types
export interface RideBookingForm {
  pickup: {
    address: string;
    coordinates: [number, number];
  };
  destination: {
    address: string;
    coordinates: [number, number];
  };
}

export interface UserProfileForm {
  name: string;
  email?: string;
  phone?: string;
}