import { useState, useCallback, useEffect } from 'react';

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
  const [permissionState, setPermissionState] = useState('unknown');

  const refreshPermission = useCallback(async () => {
    if (!navigator.permissions?.query) return 'unknown';
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      setPermissionState(status.state);
      return status.state;
    } catch {
      return 'unknown';
    }
  }, []);

  useEffect(() => {
    if (!navigator.permissions?.query) return undefined;
    let permissionStatus;
    let mounted = true;
    const handleChange = () => {
      if (!mounted || !permissionStatus) return;
      setPermissionState(permissionStatus.state);
      if (permissionStatus.state !== 'denied') setError(null);
    };

    navigator.permissions.query({ name: 'geolocation' }).then(status => {
      if (!mounted) return;
      permissionStatus = status;
      setPermissionState(status.state);
      status.addEventListener?.('change', handleChange);
    }).catch(() => {});

    return () => {
      mounted = false;
      permissionStatus?.removeEventListener?.('change', handleChange);
    };
  }, []);

  const getPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      setLoading(true);
      setError(null);
      // Cada intento debe partir sin una posición anterior. De este modo, si
      // el navegador rechaza o no puede resolver la nueva lectura, nunca se
      // reutilizan coordenadas obtenidas en otro intento.
      setPosition(null);

      if (!window.isSecureContext) {
        const err = 'La ubicación solo funciona mediante una conexión segura (HTTPS).';
        setError(err);
        setLoading(false);
        reject(new Error(err));
        return;
      }

      if (!navigator.geolocation) {
        const err = 'Tu navegador no soporta geolocalización';
        setError(err);
        setLoading(false);
        reject(new Error(err));
        return;
      }

      const succeed = (pos) => {
          const result = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
          };
          setPosition(result);
          setPermissionState('granted');
          setLoading(false);
          resolve(result);
      };

      const fail = (err) => {
          const messages = {
            1: 'Permiso de ubicación denegado. Actívalo en ajustes del navegador.',
            2: 'No se pudo determinar tu ubicación. Inténtalo en un lugar con mejor señal.',
            3: 'Tiempo de espera agotado. Inténtalo de nuevo.',
          };
          const message = messages[err.code] || 'Error desconocido de geolocalización';
          if (err.code === 1) setPermissionState('denied');
          setError(message);
          setLoading(false);
          reject(new Error(message));
      };

      const requestCompatiblePosition = () => navigator.geolocation.getCurrentPosition(
        succeed,
        fail,
        {
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 0,
        }
      );

      navigator.geolocation.getCurrentPosition(
        succeed,
        (err) => {
          // Algunos portátiles y móviles no pueden ofrecer una lectura de alta
          // precisión en interiores. Mantenemos maximumAge en 0 y repetimos con
          // el proveedor de ubicación compatible antes de dar el intento por fallido.
          if (err.code === 2 || err.code === 3) {
            requestCompatiblePosition();
            return;
          }
          fail(err);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  }, []);

  return { position, loading, error, permissionState, refreshPermission, getPosition };
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
