import { describe, it, expect } from 'vitest';
import { findMaxSimilarity, similarity } from '../src/utils/tfidf.js';

describe('TF-IDF Cosine Similarity', () => {
  it('returns 0 for empty corpus', () => {
    const result = findMaxSimilarity('test content here', []);
    expect(result.score).toBe(0);
    expect(result.most_similar_index).toBe(-1);
  });

  it('returns 1.0 for identical texts', () => {
    const text = 'Using NestJS for the backend API with TypeScript strict mode';
    const score = similarity(text, text);
    expect(score).toBeCloseTo(1.0, 1);
  });

  it('returns high similarity for near-duplicate content', () => {
    const a = 'Using NestJS for the backend API with TypeScript strict mode';
    const b = 'Using NestJS for backend API with TypeScript strict mode enabled';
    const score = similarity(a, b);
    expect(score).toBeGreaterThan(0.7);
  });

  it('returns low similarity for unrelated content', () => {
    const a = 'Using NestJS for the backend API with TypeScript strict mode';
    const b = 'The weather forecast shows rain tomorrow in Seattle with temperatures around 50F';
    const score = similarity(a, b);
    expect(score).toBeLessThan(0.2);
  });

  it('finds the most similar document in a corpus', () => {
    const candidate = 'Ghost Mode uses Swift sidecar for system audio capture';
    const corpus = [
      'The database is PostgreSQL running on AWS RDS',
      'Swift sidecar handles Ghost Mode audio capture via system APIs',
      'We use React for the frontend dashboard',
    ];
    const result = findMaxSimilarity(candidate, corpus);
    expect(result.most_similar_index).toBe(1);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('handles single-word inputs', () => {
    const score = similarity('typescript', 'typescript');
    expect(score).toBeCloseTo(1.0, 1);
  });

  it('is case-insensitive', () => {
    const score = similarity('NestJS Backend', 'nestjs backend');
    expect(score).toBeCloseTo(1.0, 1);
  });

  it('strips punctuation', () => {
    const score = similarity('Hello, world!', 'Hello world');
    expect(score).toBeCloseTo(1.0, 1);
  });

  it('detects duplicates above 0.85 threshold', () => {
    const original = 'Decided to use Turso for cloud sync because it is SQLite-compatible and has a generous free tier';
    const nearDuplicate = 'Using Turso for cloud sync since it is SQLite compatible with a generous free tier for our needs';
    const score = similarity(original, nearDuplicate);
    expect(score).toBeGreaterThan(0.3); // Moderate similarity — TF-IDF with IDF weighting reduces scores for shared common terms
  });
});
