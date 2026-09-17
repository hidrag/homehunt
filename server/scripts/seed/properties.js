import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

import Property from '../../src/models/Property.js';
import { seedUsers } from "./users.js";

const DB_URI = process.env.MONGODB_URI;

// Safety check: Prevent running seed in production environment
if (process.env.NODE_ENV === 'production') {
  console.error('❌ Refusing to run seed script in production environment.');
  process.exit(1);
}

if (!DB_URI) {
  console.error('❌ MONGODB_URI is not defined in environment variables. Cannot seed database.');
  process.exit(1);
}

// Deterministic synthetic agent ObjectId for S1
const SEED_AGENT_ID = new mongoose.Types.ObjectId('64b000000000000000000001');

const seedProperties = [
  {
    title: "3BHK Sea Facing Apartment in Bandra West",
    description:
      "Spacious and breezy 3BHK flat overlooking the Arabian Sea with floor-to-ceiling windows and Italian marble flooring.",
    price: 45000000,
    propertyType: "apartment",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [72.8258, 19.0544] },
    address: {
      street: "Carter Road",
      city: "Mumbai",
      state: "Maharashtra",
      zipCode: "400050",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 3,
    bathrooms: 3,
    area: 1650,
    amenities: [
      "Sea View",
      "Gymnasium",
      "Covered Parking",
      "24x7 Security",
      "High-Speed Elevators",
    ],
    images: [
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Luxury 4BHK Gated Villa in Whitefield",
    description:
      "Modern duplex villa with landscaped private garden, private plunge pool, and integrated smart home automation.",
    price: 68000000,
    propertyType: "villa",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [77.7499, 12.9698] },
    address: {
      street: "EPIP Zone",
      city: "Bengaluru",
      state: "Karnataka",
      zipCode: "560066",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 4,
    bathrooms: 5,
    area: 4200,
    amenities: [
      "Private Garden",
      "Swimming Pool",
      "Clubhouse",
      "Power Backup",
      "EV Charging",
    ],
    images: [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Furnished 1BHK Studio in Koramangala",
    description:
      "Chic, plug-and-play studio apartment located near vibrant cafes and tech startups in 4th Block.",
    price: 32000,
    propertyType: "apartment",
    listingType: "rent",
    status: "available",
    location: { type: "Point", coordinates: [77.6245, 12.9345] },
    address: {
      street: "80 Feet Road, 4th Block",
      city: "Bengaluru",
      state: "Karnataka",
      zipCode: "560034",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 1,
    bathrooms: 1,
    area: 550,
    amenities: ["Fully Furnished", "Wi-Fi", "Air Conditioning", "Power Backup"],
    images: [
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Executive 2BHK High-Rise Condo in DLF Phase 5",
    description:
      "Premium condominium with panoramic skyline views of Golf Course Road. Close to top international schools.",
    price: 85000,
    propertyType: "condo",
    listingType: "rent",
    status: "available",
    location: { type: "Point", coordinates: [77.0988, 28.4595] },
    address: {
      street: "Golf Course Road, DLF Phase 5",
      city: "Gurugram",
      state: "Haryana",
      zipCode: "122002",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 2,
    bathrooms: 2,
    area: 1400,
    amenities: [
      "Gymnasium",
      "Tennis Court",
      "Concierge Service",
      "Underground Parking",
    ],
    images: [
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Heritage Style Independent Bungalow in Vasant Vihar",
    description:
      "Colonial inspired independent house on a 500 sq yard plot featuring grand driveway and lush green lawns.",
    price: 180000000,
    propertyType: "house",
    listingType: "sale",
    status: "under_offer",
    location: { type: "Point", coordinates: [77.1585, 28.5583] },
    address: {
      street: "Poorvi Marg",
      city: "New Delhi",
      state: "Delhi",
      zipCode: "110057",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 5,
    bathrooms: 5,
    area: 5800,
    amenities: [
      "Private Lawn",
      "Servant Quarters",
      "Gated Security",
      "Solar Water Heating",
    ],
    images: [
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Modern 2BHK Apartment in Lokhandwala Complex",
    description:
      "Well-ventilated apartment situated in the bustling heart of Andheri West, minutes away from the metro line.",
    price: 48000,
    propertyType: "apartment",
    listingType: "rent",
    status: "available",
    location: { type: "Point", coordinates: [72.8258, 19.1412] },
    address: {
      street: "Main Lokhandwala Market Road",
      city: "Mumbai",
      state: "Maharashtra",
      zipCode: "400053",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 2,
    bathrooms: 2,
    area: 980,
    amenities: ["Piped Gas", "Intercom", "Lift", "Security"],
    images: [
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Ultra-Luxury 4BHK Penthouse in Worli",
    description:
      "Opulent penthouse with a private infinity pool, dedicated private elevator, and sweeping vistas of the Bandra-Worli Sea Link.",
    price: 280000000,
    propertyType: "condo",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [72.8172, 19.0144] },
    address: {
      street: "Dr. Annie Besant Road",
      city: "Mumbai",
      state: "Maharashtra",
      zipCode: "400018",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 4,
    bathrooms: 6,
    area: 4800,
    amenities: [
      "Private Pool",
      "Private Elevator",
      "Spa",
      "Valet Parking",
      "Smart Automation",
    ],
    images: [
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Prime Gated Villa Plot in Electronic City Phase 1",
    description:
      "Clear title residential plot in a premium gated community with underground cabling and water connections.",
    price: 9500000,
    propertyType: "land",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [77.6744, 12.8399] },
    address: {
      street: "Neeladri Road",
      city: "Bengaluru",
      state: "Karnataka",
      zipCode: "560100",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 0,
    bathrooms: 0,
    area: 2400,
    amenities: [
      "Gated Community",
      "Paved Roads",
      "Water Supply",
      "Street Lights",
    ],
    images: [
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Contemporary 3BHK Row House in OMR",
    description:
      "Modern aesthetic row house with private terrace and parking. Situated right on the IT Expressway.",
    price: 16500000,
    propertyType: "house",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [80.2319, 12.9158] },
    address: {
      street: "Rajiv Gandhi Salai, Thoraipakkam",
      city: "Chennai",
      state: "Tamil Nadu",
      zipCode: "600097",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 3,
    bathrooms: 3,
    area: 1950,
    amenities: [
      "Terrace Garden",
      "Covered Parking",
      "Clubhouse",
      "Children Play Area",
    ],
    images: [
      "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Cosmopolitan 2BHK Flat in Koregaon Park",
    description:
      "Furnished apartment with high ceilings and green canopy views in Pune’s most coveted residential pocket.",
    price: 52000,
    propertyType: "apartment",
    listingType: "rent",
    status: "available",
    location: { type: "Point", coordinates: [73.8968, 18.5362] },
    address: {
      street: "Lane 7, North Main Road",
      city: "Pune",
      state: "Maharashtra",
      zipCode: "411001",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 2,
    bathrooms: 2,
    area: 1150,
    amenities: ["Balcony", "Gymnasium", "Swimming Pool", "Security"],
    images: [
      "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Scenic 3BHK Portuguese Villa in Assagao",
    description:
      "Restored heritage Goan villa surrounded by lush foliage and fruit trees, featuring traditional red-oxide verandas.",
    price: 55000000,
    propertyType: "villa",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [73.7842, 15.5908] },
    address: {
      street: "Badem Road",
      city: "Goa",
      state: "Goa",
      zipCode: "403507",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 3,
    bathrooms: 4,
    area: 3100,
    amenities: ["Private Pool", "Courtyard", "Furnished", "Borewell"],
    images: [
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Sprawling 4BHK Apartment in Banjara Hills",
    description:
      "Grand luxury apartment with central AC, private home theater room, and views of KBR National Park.",
    price: 42000000,
    propertyType: "apartment",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [78.4377, 17.4156] },
    address: {
      street: "Road No. 12",
      city: "Hyderabad",
      state: "Telangana",
      zipCode: "500034",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 4,
    bathrooms: 4,
    area: 3400,
    amenities: [
      "Home Theater",
      "Gymnasium",
      "Visitor Parking",
      "3 Reserved Parking Slots",
    ],
    images: [
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Convenient 1BHK Flat near HITEC City",
    description:
      "Compact and modern 1BHK apartment ideal for IT professionals working in Madhapur and Financial District.",
    price: 24000,
    propertyType: "apartment",
    listingType: "rent",
    status: "available",
    location: { type: "Point", coordinates: [78.3752, 17.4474] },
    address: {
      street: "Ayyappa Society, Madhapur",
      city: "Hyderabad",
      state: "Telangana",
      zipCode: "500081",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 1,
    bathrooms: 1,
    area: 620,
    amenities: ["Lift", "Power Backup", "Security", "Wi-Fi Ready"],
    images: [
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Elegant 3BHK Flat in Ballygunge Circular Road",
    description:
      "Classic south-facing apartment in one of Kolkata’s most prestigious heritage neighborhoods with teakwood finishes.",
    price: 29000000,
    propertyType: "apartment",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [88.3582, 22.5294] },
    address: {
      street: "Ballygunge Circular Road",
      city: "Kolkata",
      state: "West Bengal",
      zipCode: "700019",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 3,
    bathrooms: 3,
    area: 2100,
    amenities: ["Servant Room", "Lift", "Covered Garage", "24x7 Water"],
    images: [
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Modern 3BHK Penthouse in Salt Lake Sector V",
    description:
      "Sleek top-floor duplex penthouse with private roof deck overlooking the East Kolkata Wetlands.",
    price: 60000,
    propertyType: "condo",
    listingType: "rent",
    status: "available",
    location: { type: "Point", coordinates: [88.4312, 22.5768] },
    address: {
      street: "Ring Road, Sector V",
      city: "Kolkata",
      state: "West Bengal",
      zipCode: "700091",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 3,
    bathrooms: 3,
    area: 2400,
    amenities: ["Private Roof Deck", "Clubhouse", "Gym", "Badminton Court"],
    images: [
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Sunny 2BHK Apartment in Bodakdev",
    description:
      "Bright and airy 2BHK near SG Highway. Clean title, vaastu compliant, and close to top hospitals and retail malls.",
    price: 8500000,
    propertyType: "apartment",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [72.5085, 23.0366] },
    address: {
      street: "Judges Bungalow Road",
      city: "Ahmedabad",
      state: "Gujarat",
      zipCode: "380054",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 2,
    bathrooms: 2,
    area: 1250,
    amenities: ["Garden", "Solar Lighting", "Community Hall", "Security"],
    images: [
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Royal 4BHK Haveli-Inspired House in C-Scheme",
    description:
      "Stately independent residence featuring Jodhpur sandstone jaali work, carved pillars, and private inner courtyard.",
    price: 75000000,
    propertyType: "house",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [75.8016, 26.9085] },
    address: {
      street: "Subhash Marg, C-Scheme",
      city: "Jaipur",
      state: "Rajasthan",
      zipCode: "302001",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 4,
    bathrooms: 4,
    area: 4500,
    amenities: ["Courtyard", "Terrace", "Private Borewell", "Servant Quarters"],
    images: [
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Waterfront 3BHK Apartment in Marine Drive Kochi",
    description:
      "Panoramic backwaters view from the 14th floor with gentle sea breeze and sunset views.",
    price: 21000000,
    propertyType: "apartment",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [76.2755, 9.9816] },
    address: {
      street: "Shanmugham Road, Marine Drive",
      city: "Kochi",
      state: "Kerala",
      zipCode: "682031",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 3,
    bathrooms: 3,
    area: 1850,
    amenities: ["Waterfront View", "Infinity Pool", "Gym", "Helipad Access"],
    images: [
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Cozy 2BHK Cottage in Indiranagar",
    description:
      "Charming ground-floor cottage with private portico nestled in a quiet lane off 12th Main.",
    price: 45000,
    propertyType: "house",
    listingType: "rent",
    status: "available",
    location: { type: "Point", coordinates: [77.6412, 12.9719] },
    address: {
      street: "12th Main Road",
      city: "Bengaluru",
      state: "Karnataka",
      zipCode: "560038",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 2,
    bathrooms: 2,
    area: 1100,
    amenities: ["Private Garden", "Pet Friendly", "Covered Car Park"],
    images: [
      "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Premium 3BHK Villa in Hinjawadi Phase 1",
    description:
      "Spacious modern villa inside a luxury township with golf putting greens and clubhouse amenities.",
    price: 18500000,
    propertyType: "villa",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [73.7381, 18.5912] },
    address: {
      street: "Maan Road",
      city: "Pune",
      state: "Maharashtra",
      zipCode: "411057",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 3,
    bathrooms: 3,
    area: 2300,
    amenities: ["Clubhouse", "Swimming Pool", "Gymnasium", "Tennis Court"],
    images: [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Compact 1BHK in Powai Hiranandani",
    description:
      "Neoclassical architectural style building in Hiranandani Gardens with lake view and manicured gardens.",
    price: 38000,
    propertyType: "apartment",
    listingType: "rent",
    status: "available",
    location: { type: "Point", coordinates: [72.9106, 19.1176] },
    address: {
      street: "Central Avenue, Hiranandani Gardens",
      city: "Mumbai",
      state: "Maharashtra",
      zipCode: "400076",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 1,
    bathrooms: 1,
    area: 600,
    amenities: ["Clubhouse Access", "Lake View", "24x7 Security", "Piped Gas"],
    images: [
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Corner Plot in Kokapet Golden Mile",
    description:
      "East-facing residential plot in Hyderabad’s fastest appreciating luxury corridor.",
    price: 32000000,
    propertyType: "land",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [78.3245, 17.3912] },
    address: {
      street: "Golden Mile Road",
      city: "Hyderabad",
      state: "Telangana",
      zipCode: "500075",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 0,
    bathrooms: 0,
    area: 3600,
    amenities: [
      "Clear Title",
      "Underground Utilities",
      "Gated Community",
      "HMDA Approved",
    ],
    images: [
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Luxury 3BHK Apartment in Boat Club Road",
    description:
      "Ultra-exclusive residential enclave in Chennai with mature trees, private security, and silence.",
    price: 52000000,
    propertyType: "apartment",
    listingType: "sale",
    status: "available",
    location: { type: "Point", coordinates: [80.2458, 13.0234] },
    address: {
      street: "Boat Club Road, RA Puram",
      city: "Chennai",
      state: "Tamil Nadu",
      zipCode: "600028",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 3,
    bathrooms: 3,
    area: 2500,
    amenities: [
      "Private Foyer",
      "Gymnasium",
      "Landscaped Garden",
      "2 Covered Car Parks",
    ],
    images: [
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Modern 3BHK Condo in Noida Sector 150",
    description:
      "Eco-friendly smart condominium overlooking sprawling 9-hole golf course and city green belt.",
    price: 35000,
    propertyType: "condo",
    listingType: "rent",
    status: "available",
    location: { type: "Point", coordinates: [77.4789, 28.4312] },
    address: {
      street: "Expressway Sector 150",
      city: "Noida",
      state: "Uttar Pradesh",
      zipCode: "201310",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 3,
    bathrooms: 3,
    area: 1750,
    amenities: [
      "Golf Course View",
      "Swimming Pool",
      "Cricket Pitch",
      "Solar Powered Common Areas",
    ],
    images: [
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
    ],
  },
  {
    title: "Spacious 4BHK Family House in Mansarovar",
    description:
      "Triple-story standalone home with wide balconies, modern modular kitchen, and marble terrace.",
    price: 13500000,
    propertyType: "house",
    listingType: "sale",
    status: "sold",
    location: { type: "Point", coordinates: [75.7689, 26.8521] },
    address: {
      street: "Sector 7, Mansarovar",
      city: "Jaipur",
      state: "Rajasthan",
      zipCode: "302020",
      country: "India",
    },
    agent: SEED_AGENT_ID,
    bedrooms: 4,
    bathrooms: 4,
    area: 3200,
    amenities: ["Modular Kitchen", "Borewell", "Balcony", "Covered Parking"],
    images: [
      "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?auto=format&fit=crop&w=800&q=80",
    ],
  },
];

export const seedDB = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(DB_URI);
    console.log('✅ MongoDB connected successfully');

    console.log('Clearing existing properties...');
    await Property.deleteMany({});
    console.log('✅ Cleared properties');

    console.log("Seeding deterministic development users...");
    await seedUsers();

    console.log('Inserting seed data...');
    await Property.insertMany(seedProperties);
    console.log(`✅ Successfully seeded ${seedProperties.length} deterministic properties.`);

    console.log('Closing connection...');
    await mongoose.connection.close();
    console.log('✅ Connection closed. Seeding complete.');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

// If run directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDB();
}
