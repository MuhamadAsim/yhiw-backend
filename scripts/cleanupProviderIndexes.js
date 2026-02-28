// scripts/cleanupProviderIndexes.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';

dotenv.config();

const cleanupIndexes = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get the collection
    const collection = ProviderLiveStatus.collection;

    // List all indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:');
    indexes.forEach(index => {
      console.log(` - ${index.name}:`, index.key);
    });

    // Find and drop duplicate 2dsphere indexes
    // Keep only the one we want (usually the one on currentLocation)
    for (const index of indexes) {
      // Drop any index that's 2dsphere but not the one we want
      if (index.name.includes('2dsphere') && index.name !== 'currentLocation_2dsphere') {
        console.log(`Dropping index: ${index.name}`);
        await collection.dropIndex(index.name);
      }
    }

    // Ensure the correct index exists
    await collection.createIndex({ currentLocation: '2dsphere' });
    console.log('✅ Created correct 2dsphere index');

    // Verify final indexes
    const finalIndexes = await collection.indexes();
    console.log('Final indexes:');
    finalIndexes.forEach(index => {
      console.log(` - ${index.name}:`, index.key);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

cleanupIndexes();