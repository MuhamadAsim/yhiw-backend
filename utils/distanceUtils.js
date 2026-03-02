// utils/distanceUtils.js
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

export function calculateETA(lat1, lon1, lat2, lon2) {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  // Average speed: 30 km/h in city, 60 km/h on highway
  // You can make this dynamic based on road type
  const avgSpeed = 30; // km/h
  const timeInHours = distance / avgSpeed;
  const timeInMinutes = Math.ceil(timeInHours * 60);
  
  if (timeInMinutes < 1) return '1 min';
  if (timeInMinutes === 1) return '1 min';
  return `${timeInMinutes} min`;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}