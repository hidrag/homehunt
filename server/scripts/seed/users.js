import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../../src/models/User.js';

// Development-only deterministic users
export const DEV_PASSWORD = 'DevPassword123!';

export const getSeedUsers = async () => {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  return [
    {
      _id: new mongoose.Types.ObjectId('64b000000000000000000001'),
      name: 'Rajesh Sharma',
      email: 'agent@homehunt.test',
      passwordHash,
      role: 'agent',
    },
    {
      _id: new mongoose.Types.ObjectId('64b000000000000000000002'),
      name: 'Priya Patel',
      email: 'admin@homehunt.test',
      passwordHash,
      role: 'admin',
    },
    {
      _id: new mongoose.Types.ObjectId('64b000000000000000000003'),
      name: 'Amit Kumar',
      email: 'buyer@homehunt.test',
      passwordHash,
      role: 'buyer',
    },
  ];
};

export const seedUsers = async () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed development users in production environment.');
  }

  const users = await getSeedUsers();
  await User.deleteMany({
    _id: {
      $in: [
        new mongoose.Types.ObjectId('64b000000000000000000001'),
        new mongoose.Types.ObjectId('64b000000000000000000002'),
        new mongoose.Types.ObjectId('64b000000000000000000003'),
      ],
    },
  });

  await User.insertMany(users);
  console.log(`✅ Successfully seeded ${users.length} deterministic development users.`);
};

export default seedUsers;
