// Mock providers in Bahrain with their locations
export const mockProviders = [
  // TOWING PROVIDERS
  {
    id: 'prov_001',
    name: 'Ahmed Al Mansoor',
    rating: 4.8,
    totalRatings: 156,
    phone: '+973 3312 4567',
    vehicleType: 'Flatbed Truck',
    licensePlate: 'MAN 1234',
    location: {
      lat: 26.2285,
      lng: 50.5860,
      address: 'Manama Souq, Manama'
    },
    services: ['towing', 'roadside_assistance', 'tire_replacement'],
    supportedVehicleTypes: ['sedan', 'suv', 'truck', 'van'],
    status: 'available',
    image: 'provider1.jpg',
    estimatedArrival: 15,
    providerType: 'towing'
  },
  {
    id: 'prov_002',
    name: 'Khalid Hasan',
    rating: 4.9,
    totalRatings: 203,
    phone: '+973 3345 6789',
    vehicleType: 'Flatbed Truck',
    licensePlate: 'MAN 5678',
    location: {
      lat: 26.2350,
      lng: 50.5420,
      address: 'Seef District, Manama'
    },
    services: ['towing', 'fuel_delivery', 'roadside_assistance'],
    supportedVehicleTypes: ['sedan', 'suv', 'motorcycle'],
    status: 'available',
    image: 'provider2.jpg',
    estimatedArrival: 12,
    providerType: 'towing'
  },
  {
    id: 'prov_003',
    name: 'Ali Jaffer',
    rating: 4.7,
    totalRatings: 98,
    phone: '+973 3356 7890',
    vehicleType: 'Wheel Lift Truck',
    licensePlate: 'MAN 9012',
    location: {
      lat: 26.2408,
      lng: 50.5747,
      address: 'Bahrain Financial Harbour'
    },
    services: ['towing', 'battery_replacement', 'tire_replacement'],
    supportedVehicleTypes: ['sedan', 'suv'],
    status: 'available',
    image: 'provider3.jpg',
    estimatedArrival: 18,
    providerType: 'towing'
  },
  {
    id: 'prov_004',
    name: 'Hussain Ebrahim',
    rating: 4.6,
    totalRatings: 67,
    phone: '+973 3378 9012',
    vehicleType: 'Flatbed Truck',
    licensePlate: 'MUH 4321',
    location: {
      lat: 26.2708,
      lng: 50.6336,
      address: 'Muharraq, near Airport'
    },
    services: ['towing', 'tire_replacement', 'battery_replacement'],
    supportedVehicleTypes: ['sedan', 'suv', 'truck'],
    status: 'available',
    image: 'provider4.jpg',
    estimatedArrival: 22,
    providerType: 'towing'
  },
  {
    id: 'prov_005',
    name: 'Mohamed Saleh',
    rating: 4.5,
    totalRatings: 45,
    phone: '+973 3390 1234',
    vehicleType: 'Wheel Lift Truck',
    licensePlate: 'MUH 8765',
    location: {
      lat: 26.2600,
      lng: 50.6150,
      address: 'Busateen, Muharraq'
    },
    services: ['towing', 'roadside_assistance'],
    supportedVehicleTypes: ['sedan', 'suv'],
    status: 'available',
    image: 'provider5.jpg',
    estimatedArrival: 25,
    providerType: 'towing'
  },

  // FUEL DELIVERY PROVIDERS
  {
    id: 'prov_006',
    name: 'Bahrain Fuel Services',
    rating: 4.9,
    totalRatings: 178,
    phone: '+973 3311 2233',
    vehicleType: 'Fuel Tanker',
    licensePlate: 'FUEL 2468',
    location: {
      lat: 26.1300,
      lng: 50.5550,
      address: 'East Riffa'
    },
    services: ['fuel_delivery', 'roadside_assistance'],
    supportedVehicleTypes: ['sedan', 'suv', 'truck', 'motorcycle'],
    fuelTypes: ['petrol', 'diesel'], // Available fuel types
    status: 'available',
    image: 'provider6.jpg',
    estimatedArrival: 20,
    providerType: 'fuel'
  },
  {
    id: 'prov_007',
    name: 'Express Fuel',
    rating: 4.7,
    totalRatings: 112,
    phone: '+973 3322 4455',
    vehicleType: 'Fuel Van',
    licensePlate: 'FUEL 1357',
    location: {
      lat: 26.2186,
      lng: 50.6031,
      address: 'Juffair'
    },
    services: ['fuel_delivery'],
    supportedVehicleTypes: ['sedan', 'suv', 'motorcycle'],
    fuelTypes: ['petrol', 'premium'], // Premium fuel available
    status: 'available',
    image: 'provider7.jpg',
    estimatedArrival: 14,
    providerType: 'fuel'
  },
  {
    id: 'prov_008',
    name: 'Diesel Direct',
    rating: 4.6,
    totalRatings: 89,
    phone: '+973 3344 6677',
    vehicleType: 'Fuel Tanker',
    licensePlate: 'FUEL 9876',
    location: {
      lat: 26.1736,
      lng: 50.5478,
      address: 'Isa Town'
    },
    services: ['fuel_delivery'],
    supportedVehicleTypes: ['sedan', 'suv', 'truck'],
    fuelTypes: ['diesel', 'petrol'],
    status: 'available',
    image: 'provider8.jpg',
    estimatedArrival: 17,
    providerType: 'fuel'
  },

  // ROADSIDE ASSISTANCE PROVIDERS
  {
    id: 'prov_009',
    name: 'Quick Assist',
    rating: 4.8,
    totalRatings: 134,
    phone: '+973 3355 8899',
    vehicleType: 'Service Van',
    licensePlate: 'RSA 5432',
    location: {
      lat: 26.1900,
      lng: 50.4850,
      address: 'Saar'
    },
    services: ['roadside_assistance', 'battery_replacement', 'tire_replacement', 'lockout', 'jump_start'],
    supportedVehicleTypes: ['sedan', 'suv', 'motorcycle'],
    status: 'available',
    image: 'provider9.jpg',
    estimatedArrival: 24,
    providerType: 'roadside'
  },
  {
    id: 'prov_010',
    name: '24/7 Road Help',
    rating: 4.7,
    totalRatings: 98,
    phone: '+973 3366 9900',
    vehicleType: 'Service Van',
    licensePlate: 'RSA 1122',
    location: {
      lat: 26.2120,
      lng: 50.5650,
      address: 'Adliya'
    },
    services: ['roadside_assistance', 'battery_replacement', 'fuel_delivery'],
    supportedVehicleTypes: ['sedan', 'suv'],
    fuelTypes: ['petrol'], // For emergency fuel delivery
    status: 'available',
    image: 'provider10.jpg',
    estimatedArrival: 16,
    providerType: 'roadside'
  },

  // CAR WASH & DETAILING PROVIDERS
  {
    id: 'prov_011',
    name: 'Shine Car Wash',
    rating: 4.8,
    totalRatings: 203,
    phone: '+973 3377 1122',
    vehicleType: 'Mobile Unit',
    licensePlate: 'WASH 3344',
    location: {
      lat: 26.2350,
      lng: 50.5525,
      address: 'City Centre Bahrain'
    },
    services: ['car_wash', 'car_detailing'],
    supportedVehicleTypes: ['sedan', 'suv', 'van'],
    hasBooking: true, // Supports scheduling
    status: 'available',
    image: 'provider11.jpg',
    estimatedArrival: 30,
    providerType: 'wash'
  },
  {
    id: 'prov_012',
    name: 'Elite Detailing',
    rating: 4.9,
    totalRatings: 156,
    phone: '+973 3388 2233',
    vehicleType: 'Mobile Unit',
    licensePlate: 'DTL 5566',
    location: {
      lat: 26.2285,
      lng: 50.5860,
      address: 'Manama'
    },
    services: ['car_detailing', 'car_wash'],
    supportedVehicleTypes: ['sedan', 'suv', 'luxury'],
    hasBooking: true,
    status: 'available',
    image: 'provider12.jpg',
    estimatedArrival: 45,
    providerType: 'wash'
  },

  // CAR RENTAL PROVIDERS
  {
    id: 'prov_013',
    name: 'Bahrain Rent-a-Car',
    rating: 4.7,
    totalRatings: 312,
    phone: '+973 3399 4455',
    vehicleType: 'Rental Fleet',
    licensePlate: 'RNT 7788',
    location: {
      lat: 26.2408,
      lng: 50.5747,
      address: 'Bahrain Financial Harbour'
    },
    services: ['car_rental'],
    supportedVehicleTypes: ['sedan', 'suv', 'luxury'],
    hasRentalVehicles: true,
    rentalVehicles: ['sedan', 'suv', 'luxury'], // Types available for rent
    status: 'available',
    image: 'provider13.jpg',
    estimatedArrival: 60, // Rental requires advance booking
    providerType: 'rental'
  },
  {
    id: 'prov_014',
    name: 'Economy Rentals',
    rating: 4.5,
    totalRatings: 189,
    phone: '+973 3311 5566',
    vehicleType: 'Rental Fleet',
    licensePlate: 'RNT 9900',
    location: {
      lat: 26.2186,
      lng: 50.6031,
      address: 'Juffair'
    },
    services: ['car_rental'],
    supportedVehicleTypes: ['sedan', 'suv', 'economy'],
    hasRentalVehicles: true,
    rentalVehicles: ['sedan', 'economy'],
    status: 'available',
    image: 'provider14.jpg',
    estimatedArrival: 60,
    providerType: 'rental'
  },
  {
    id: 'prov_015',
    name: 'Luxury Car Rental',
    rating: 4.9,
    totalRatings: 98,
    phone: '+973 3322 6677',
    vehicleType: 'Rental Fleet',
    licensePlate: 'RNT 2233',
    location: {
      lat: 26.2350,
      lng: 50.5420,
      address: 'Seef'
    },
    services: ['car_rental'],
    supportedVehicleTypes: ['luxury', 'suv'],
    hasRentalVehicles: true,
    rentalVehicles: ['luxury', 'suv'],
    status: 'available',
    image: 'provider15.jpg',
    estimatedArrival: 60,
    providerType: 'rental'
  },

  // SPARE PARTS PROVIDERS
  {
    id: 'prov_016',
    name: 'Auto Parts Bahrain',
    rating: 4.6,
    totalRatings: 145,
    phone: '+973 3344 8899',
    vehicleType: 'Delivery Van',
    licensePlate: 'PRT 4455',
    location: {
      lat: 26.2285,
      lng: 50.5860,
      address: 'Manama'
    },
    services: ['spare_parts'],
    supportedVehicleTypes: ['sedan', 'suv', 'truck'],
    supportsParts: true,
    partsCategories: ['engine', 'brakes', 'suspension', 'electrical'],
    status: 'available',
    image: 'provider16.jpg',
    estimatedArrival: 35,
    providerType: 'parts'
  },
  {
    id: 'prov_017',
    name: 'Genuine Parts Co',
    rating: 4.8,
    totalRatings: 167,
    phone: '+973 3355 9900',
    vehicleType: 'Delivery Van',
    licensePlate: 'PRT 6677',
    location: {
      lat: 26.2408,
      lng: 50.5747,
      address: 'Diplomatic Area'
    },
    services: ['spare_parts'],
    supportedVehicleTypes: ['sedan', 'suv', 'luxury'],
    supportsParts: true,
    partsCategories: ['engine', 'transmission', 'body'],
    status: 'available',
    image: 'provider17.jpg',
    estimatedArrival: 40,
    providerType: 'parts'
  },

  // OIL CHANGE & MAINTENANCE PROVIDERS
  {
    id: 'prov_018',
    name: 'Quick Lube',
    rating: 4.7,
    totalRatings: 178,
    phone: '+973 3366 1122',
    vehicleType: 'Service Van',
    licensePlate: 'OIL 8899',
    location: {
      lat: 26.2350,
      lng: 50.5525,
      address: 'City Centre Bahrain'
    },
    services: ['oil_change', 'inspection_repair'],
    supportedVehicleTypes: ['sedan', 'suv', 'motorcycle'],
    status: 'available',
    image: 'provider18.jpg',
    estimatedArrival: 25,
    providerType: 'maintenance'
  },
  {
    id: 'prov_019',
    name: 'Mobile Mechanic',
    rating: 4.8,
    totalRatings: 134,
    phone: '+973 3377 2233',
    vehicleType: 'Service Van',
    licensePlate: 'MEC 9900',
    location: {
      lat: 26.1900,
      lng: 50.4850,
      address: 'Saar'
    },
    services: ['inspection_repair', 'battery_replacement', 'ac_gas_refill'],
    supportedVehicleTypes: ['sedan', 'suv', 'truck'],
    status: 'available',
    image: 'provider19.jpg',
    estimatedArrival: 30,
    providerType: 'maintenance'
  },

  // BATTERY & AC SERVICES
  {
    id: 'prov_020',
    name: 'Battery Express',
    rating: 4.6,
    totalRatings: 89,
    phone: '+973 3388 3344',
    vehicleType: 'Service Van',
    licensePlate: 'BAT 1122',
    location: {
      lat: 26.2186,
      lng: 50.6031,
      address: 'Juffair'
    },
    services: ['battery_replacement', 'jump_start'],
    supportedVehicleTypes: ['sedan', 'suv', 'truck'],
    status: 'available',
    image: 'provider20.jpg',
    estimatedArrival: 20,
    providerType: 'battery'
  },
  {
    id: 'prov_021',
    name: 'Cool AC Services',
    rating: 4.7,
    totalRatings: 112,
    phone: '+973 3399 4455',
    vehicleType: 'Service Van',
    licensePlate: 'AC 3344',
    location: {
      lat: 26.2120,
      lng: 50.5650,
      address: 'Adliya'
    },
    services: ['ac_gas_refill', 'inspection_repair'],
    supportedVehicleTypes: ['sedan', 'suv'],
    status: 'available',
    image: 'provider21.jpg',
    estimatedArrival: 28,
    providerType: 'ac'
  },

  // TIRE SERVICES
  {
    id: 'prov_022',
    name: 'Tire Masters',
    rating: 4.8,
    totalRatings: 145,
    phone: '+973 3311 5566',
    vehicleType: 'Service Truck',
    licensePlate: 'TIR 5566',
    location: {
      lat: 26.2285,
      lng: 50.5860,
      address: 'Manama'
    },
    services: ['tire_replacement', 'tire_repair'],
    supportedVehicleTypes: ['sedan', 'suv', 'truck'],
    status: 'available',
    image: 'provider22.jpg',
    estimatedArrival: 22,
    providerType: 'tire'
  },
  {
    id: 'prov_023',
    name: 'Quick Tire Change',
    rating: 4.5,
    totalRatings: 78,
    phone: '+973 3322 6677',
    vehicleType: 'Service Van',
    licensePlate: 'TIR 7788',
    location: {
      lat: 26.2350,
      lng: 50.5420,
      address: 'Seef'
    },
    services: ['tire_replacement'],
    supportedVehicleTypes: ['sedan', 'suv'],
    status: 'available',
    image: 'provider23.jpg',
    estimatedArrival: 18,
    providerType: 'tire'
  },
];
