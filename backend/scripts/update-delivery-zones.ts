import 'dotenv/config';
import mongoose from 'mongoose';
import Settings, { ZONES_DEFAULT } from '../models/Settings.model.js';

const MONGO_URI = process.env.MONGO_URI!;
if (!MONGO_URI) { console.error('MONGO_URI manquant'); process.exit(1); }

async function run() {
  await mongoose.connect(MONGO_URI);
  const settings = await Settings.findOne();
  if (!settings) {
    await Settings.create({});
    console.log('Settings créés avec les zones par défaut (Libreville/Owendo/Akanda/PK).');
  } else {
    settings.zonesLivraison = ZONES_DEFAULT;
    await settings.save();
    console.log('Zones de livraison mises à jour : Libreville, Owendo, Akanda, PK5-PK12, PK13+.');
  }
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
