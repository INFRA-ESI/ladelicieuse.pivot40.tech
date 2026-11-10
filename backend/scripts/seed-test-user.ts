// Compte client de test pour le développement local : e-mail déjà vérifié, avec quelques points.
// Refuse de s'exécuter en production ou sur une base qui n'est pas locale : ce mot de passe est connu de tous.
//   npm run seed:test-user
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.model.js';

const EMAIL    = 'ladelicieusetest@dd.com';
const PASSWORD = 'Ladelicieuse123@';

const uri = process.env.MONGO_URI ?? '';
const isLocal = /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri);
if (process.env.NODE_ENV === 'production' || !isLocal) {
  console.error('Refusé : ce seed ne s\'exécute qu\'en développement, sur une base MongoDB locale.');
  process.exit(1);
}

async function main(): Promise<void> {
  await mongoose.connect(uri);
  try {
    // findOne + save (et non updateOne) pour que le mot de passe soit haché par le hook du modèle.
    const user = (await User.findOne({ email: EMAIL })) ?? new User({ email: EMAIL });
    user.set({
      nom: 'TEST', prenoms: 'Client', telephone: '060000000',
      password: PASSWORD, emailVerified: true, points: 640,
    });
    await user.save();
    console.log(`Compte de test prêt : ${EMAIL}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
