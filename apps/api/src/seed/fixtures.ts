// Sample station names and all timetables, operators, vehicles and fares are fictional.
export const cities: Record<string, [string, string, string]> = {
  Bengaluru: ['Karnataka', 'Majestic', 'Silk Board'],
  Chennai: ['Tamil Nadu', 'Koyambedu', 'Guindy'],
  Mumbai: ['Maharashtra', 'Dadar East', 'Chembur'],
  Pune: ['Maharashtra', 'Swargate', 'Shivajinagar'],
  Hyderabad: ['Telangana', 'Lakdikapul', 'Kukatpally'],
  Vijayawada: ['Andhra Pradesh', 'Benz Circle', 'Pandit Nehru Terminal'],
  Delhi: ['Delhi', 'Kashmere Gate', 'Dhaula Kuan'],
  Jaipur: ['Rajasthan', 'Sindhi Camp', 'Narayan Singh Circle'],
  Mysuru: ['Karnataka', 'Suburban Terminal', 'Hunsur Road'],
  Coimbatore: ['Tamil Nadu', 'Gandhipuram', 'Avinashi Road'],
  Kochi: ['Kerala', 'Vyttila', 'Edappally'],
  Madurai: ['Tamil Nadu', 'Mattuthavani', 'Periyar Terminal'],
  Kozhikode: ['Kerala', 'Mavoor Road', 'Palayam'],
  Mangaluru: ['Karnataka', 'State Bank Terminal', 'Bejai'],
  Ahmedabad: ['Gujarat', 'Paldi', 'Geeta Mandir'],
  Vadodara: ['Gujarat', 'Central Terminal', 'Alkapuri'],
  Surat: ['Gujarat', 'Adajan', 'Kadodara'],
  Indore: ['Madhya Pradesh', 'Sarwate', 'Bhanwarkuan'],
  Bhopal: ['Madhya Pradesh', 'ISBT', 'Nadra Terminal'],
  Lucknow: ['Uttar Pradesh', 'Alambagh', 'Kaiserbagh'],
  Kanpur: ['Uttar Pradesh', 'Jhakarkati', 'Rama Devi'],
  Bhubaneswar: ['Odisha', 'Baramunda', 'Vani Vihar'],
  Puri: ['Odisha', 'Grand Road', 'Malatipatpur'],
  Jodhpur: ['Rajasthan', 'Paota', 'Rai Ka Bagh']
};
// Geography is illustrative. A corridor is scheduled in both directions.
export const corridors: [string, string, number, number][] = [
  ['Bengaluru', 'Chennai', 348, 405], ['Mumbai', 'Pune', 152, 210],
  ['Hyderabad', 'Vijayawada', 275, 320], ['Delhi', 'Jaipur', 281, 335],
  ['Bengaluru', 'Mysuru', 145, 180], ['Hyderabad', 'Bengaluru', 576, 570],
  ['Bengaluru', 'Coimbatore', 365, 400], ['Chennai', 'Madurai', 460, 470],
  ['Coimbatore', 'Kochi', 189, 265], ['Mysuru', 'Mangaluru', 256, 340],
  ['Kozhikode', 'Kochi', 185, 240], ['Mangaluru', 'Kozhikode', 232, 300],
  ['Ahmedabad', 'Vadodara', 113, 145], ['Vadodara', 'Surat', 152, 185],
  ['Indore', 'Bhopal', 195, 245], ['Lucknow', 'Kanpur', 93, 145],
  ['Bhubaneswar', 'Puri', 64, 105], ['Jaipur', 'Jodhpur', 336, 390],
  ['Surat', 'Mumbai', 285, 350], ['Madurai', 'Coimbatore', 214, 260]
];
export const operators = [
  ['Fernway Travels', 'Comfortable intercity coaches for the southern corridors.'],
  ['Amberline Coaches', 'City connections aboard bright, modern coaches.'],
  ['Deccan Grove', 'A regional fleet connecting towns across the Deccan.'],
  ['Dune & Dale Transit', 'Day and overnight journeys through northern India.'],
  ['Monsoon Mile', 'Coastal connections and tree-lined hill routes.'],
  ['Copperleaf Express', 'Overnight sleepers and frequent city departures.'],
  ['Cobalt Finch', 'Regional coaches with thoughtfully appointed interiors.'],
  ['Meridian Fern', 'Long-distance connections between growing cities.'],
  ['Marigold Lines', 'Comfortable coaches on popular western routes.'],
  ['Silver Tamarind', 'Intercity journeys with simple, flexible fares.']
];
