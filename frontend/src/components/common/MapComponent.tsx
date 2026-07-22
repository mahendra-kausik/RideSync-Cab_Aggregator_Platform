import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline } from 'react-leaflet';
import L, { LeafletMouseEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapComponent.css';

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons for different marker types
const createCustomIcon = (color: string) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const pickupIcon = createCustomIcon('green');
const destinationIcon = createCustomIcon('red');
const driverIcon = createCustomIcon('blue');

interface MapComponentProps {
  center: [number, number];
  zoom?: number;
  height?: string;
  pickup?: {
    coordinates: [number, number];
    address: string;
  } | null;
  destination?: {
    coordinates: [number, number];
    address: string;
  } | null;
  driverLocation?: [number, number] | null;
  route?: [number, number][] | null;
  onLocationSelect?: (coordinates: [number, number], type: 'pickup' | 'destination') => void;
  selectionMode?: 'pickup' | 'destination' | null;
  className?: string;
  showRoute?: boolean;
}

// Component to handle map clicks
const MapClickHandler: React.FC<{
  onLocationSelect?: (coordinates: [number, number], type: 'pickup' | 'destination') => void;
  selectionMode?: 'pickup' | 'destination' | null;
}> = ({ onLocationSelect, selectionMode }) => {
  useMapEvents({
    click: (e: LeafletMouseEvent) => {
      if (onLocationSelect && selectionMode) {
        const { lat, lng } = e.latlng;
        onLocationSelect([lng, lat], selectionMode);
      }
    },
  });
  return null;
};

const MapComponent: React.FC<MapComponentProps> = ({
  center,
  zoom = 13,
  height = '400px',
  pickup,
  destination,
  driverLocation,
  route,
  onLocationSelect,
  selectionMode,
  className = '',
  showRoute = true
}) => {
  const mapRef = useRef<L.Map>(null);

  // Debug: log the route being passed
  useEffect(() => {
    if (route && route.length > 1) {
      // Log first and last point for sanity
      console.log('MapComponent: route received', route[0], '...', route[route.length - 1]);
    } else if (route) {
      console.log('MapComponent: route received but too short', route);
    } else {
      console.log('MapComponent: no route, will use straight line');
    }
  }, [route]);

  // OSM tiles only — Mapbox support was never wired to a real deploy target and
  // its token-validation logic was broken (crashed when the token was unset).
  const tileLayerUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  // Update map view when center changes
  // `center` follows this component's [lng, lat] convention (matching the other
  // coordinate props); Leaflet's setView expects [lat, lng], so flip it here.
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView([center[1], center[0]], zoom);
    }
  }, [center, zoom]);

  // Auto-fit bounds when pickup and destination are set
  useEffect(() => {
    if (mapRef.current && pickup && destination) {
      const bounds = L.latLngBounds([
        [pickup.coordinates[1], pickup.coordinates[0]],
        [destination.coordinates[1], destination.coordinates[0]]
      ]);

      // Add driver location to bounds if available
      if (driverLocation) {
        bounds.extend([driverLocation[1], driverLocation[0]]);
      }

      mapRef.current.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [pickup, destination, driverLocation]);

  return (
    <div className={`map-container ${className}`} style={{ height }}>
      <MapContainer
        center={[center[1], center[0]]}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer url={tileLayerUrl} />

        <MapClickHandler
          onLocationSelect={onLocationSelect}
          selectionMode={selectionMode}
        />

        {pickup && (
          <Marker
            position={[pickup.coordinates[1], pickup.coordinates[0]]}
            icon={pickupIcon}
          >
            <Popup>
              <strong>Pickup Location</strong><br />
              {pickup.address}
            </Popup>
          </Marker>
        )}

        {destination && (
          <Marker
            position={[destination.coordinates[1], destination.coordinates[0]]}
            icon={destinationIcon}
          >
            <Popup>
              <strong>Destination</strong><br />
              {destination.address}
            </Popup>
          </Marker>
        )}

        {driverLocation && (
          <Marker
            position={[driverLocation[1], driverLocation[0]]}
            icon={driverIcon}
          >
            <Popup>
              <strong>Driver Location</strong>
            </Popup>
          </Marker>
        )}

        {/* Route polyline */}
        {showRoute && route && route.length > 1 && (
          <Polyline
            positions={route.map(coord => [coord[1], coord[0]])}
            pathOptions={{ color: '#007bff', weight: 4, opacity: 0.7 }}
          />
        )}

        {/* Simple route line between pickup and destination */}
        {showRoute && !route && pickup && destination && (
          <Polyline
            positions={[
              [pickup.coordinates[1], pickup.coordinates[0]],
              [destination.coordinates[1], destination.coordinates[0]]
            ]}
            pathOptions={{ color: '#28a745', weight: 3, opacity: 0.6, dashArray: '10, 10' }}
          />
        )}
      </MapContainer>
    </div>
  );
};

export default MapComponent;