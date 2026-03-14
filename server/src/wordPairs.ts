/**
 * Paires de mots pour le tirage côté serveur.
 * Aligné sur le frontend (pas de partage de module pour ce sprint).
 */

import type { WordPair } from './types.js';

export const WORD_PAIRS: WordPair[] = [
  { motCitoyens: 'Pizza', motImposteur: 'Burger' },
  { motCitoyens: 'Chien', motImposteur: 'Loup' },
  { motCitoyens: 'Chat', motImposteur: 'Tigre' },
  { motCitoyens: 'Mer', motImposteur: 'Océan' },
  { motCitoyens: 'Soleil', motImposteur: 'Lune' },
  { motCitoyens: 'Café', motImposteur: 'Thé' },
  { motCitoyens: 'Train', motImposteur: 'Métro' },
  { motCitoyens: 'Avion', motImposteur: 'Hélicoptère' },
  { motCitoyens: 'Pomme', motImposteur: 'Poire' },
  { motCitoyens: 'Banane', motImposteur: 'Mangue' },
  { motCitoyens: 'Neige', motImposteur: 'Glace' },
  { motCitoyens: 'Hôpital', motImposteur: 'Pharmacie' },
  { motCitoyens: 'École', motImposteur: 'Université' },
  { motCitoyens: 'Stylo', motImposteur: 'Crayon' },
  { motCitoyens: 'Téléphone', motImposteur: 'Radio' },
  { motCitoyens: 'Guitare', motImposteur: 'Violon' },
  { motCitoyens: 'Football', motImposteur: 'Rugby' },
  { motCitoyens: 'Tennis', motImposteur: 'Badminton' },
  { motCitoyens: 'Camion', motImposteur: 'Bus' },
  { motCitoyens: 'Vélo', motImposteur: 'Moto' },
  { motCitoyens: 'Sandwich', motImposteur: 'Tacos' },
  { motCitoyens: 'Fromage', motImposteur: 'Beurre' },
  { motCitoyens: 'Jardin', motImposteur: 'Forêt' },
  { motCitoyens: 'Rivière', motImposteur: 'Lac' },
  { motCitoyens: 'Montagne', motImposteur: 'Colline' },
  { motCitoyens: 'Roi', motImposteur: 'Président' },
  { motCitoyens: 'Policier', motImposteur: 'Détective' },
  { motCitoyens: 'Peinture', motImposteur: 'Dessin' },
  { motCitoyens: 'Film', motImposteur: 'Série' },
  { motCitoyens: 'Robot', motImposteur: 'Humain' },
];

export function getRandomWordPair(): WordPair {
  return WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
}
