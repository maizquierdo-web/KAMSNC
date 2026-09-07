import { useState, useCallback } from 'react';

/**
 * Hook de geolocalización.
 * Obtiene la posición GPS del usuario con manejo de errores y permisos.
 *
 * Uso:
 *   const { position, loading, error, getPosition } = useGeolocation();
 *   // position = { latitude, longitude, accuracy } | null
 */
export function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      setLoading(true);
      setError(null);
      // Cada intento debe partir sin una posición anterior. De este modo, si
      // el navegador rechaza o no puede resolver la nueva lectura, nunca se
      // reutilizan coordenadas obtenidas en otro intento.
      setPosition(null);

      if (!navigator.geolocation) {
        const err = 'Tu navegador no soporta geolocalización';
        setError(err);
        setLoading(false);
        reject(new Error(err));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const result = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
          };
          setPosition(result);
          setLoading(false);
          resolve(result);
        },
        (err) => {
          const messages = {
            1: 'Permiso de ubicación denegado. Actívalo en ajustes del navegador.',
            2: 'No se pudo determinar tu ubicación. Inténtalo en un lugar con mejor señal.',
            3: 'Tiempo de espera agotado. Inténtalo de nuevo.',
          };
          const message = messages[err.code] || 'Error desconocido de geolocalización';
          setError(message);
          setLoading(false);
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  }, []);

  return { position, loading, error, getPosition };
}

/**
 * Calcular distancia entre dos puntos GPS en metros.
 * Fórmula de Haversine.
 */
export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radio de la Tierra en metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}
