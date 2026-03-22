/**
 * TF-IDF cosine similarity for duplicate detection.
 * Pure function — no external dependencies.
 */

/**
 * Tokenize text into lowercase terms.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Compute term frequency for a document.
 */
function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  // Normalize by document length
  const len = tokens.length;
  if (len > 0) {
    for (const [term, count] of tf) {
      tf.set(term, count / len);
    }
  }
  return tf;
}

/**
 * Compute inverse document frequency across a corpus.
 */
function inverseDocumentFrequency(corpus: Map<string, number>[], allTerms: Set<string>): Map<string, number> {
  const idf = new Map<string, number>();
  const n = corpus.length;

  for (const term of allTerms) {
    let docCount = 0;
    for (const doc of corpus) {
      if (doc.has(term)) docCount++;
    }
    // IDF = log(N / (1 + docCount)) + 1 (smoothed)
    idf.set(term, Math.log(n / (1 + docCount)) + 1);
  }
  return idf;
}

/**
 * Compute TF-IDF vector for a document.
 */
function tfidfVector(tf: Map<string, number>, idf: Map<string, number>): Map<string, number> {
  const vec = new Map<string, number>();
  for (const [term, tfVal] of tf) {
    const idfVal = idf.get(term) || 1;
    vec.set(term, tfVal * idfVal);
  }
  return vec;
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  const allTerms = new Set([...a.keys(), ...b.keys()]);

  for (const term of allTerms) {
    const aVal = a.get(term) || 0;
    const bVal = b.get(term) || 0;
    dotProduct += aVal * bVal;
    magnitudeA += aVal * aVal;
    magnitudeB += bVal * bVal;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Compute TF-IDF cosine similarity between a candidate text and a corpus of existing texts.
 * Returns the highest similarity score found.
 *
 * @param candidate - The new text to check
 * @param corpus - Array of existing memory contents to compare against
 * @returns Highest similarity score (0-1) and the index of the most similar document
 */
export function findMaxSimilarity(
  candidate: string,
  corpus: string[],
): { score: number; most_similar_index: number } {
  if (!candidate || candidate.trim().length === 0) {
    return { score: 0, most_similar_index: -1 };
  }

  if (corpus.length === 0) {
    return { score: 0, most_similar_index: -1 };
  }

  const candidateTokens = tokenize(candidate);
  const corpusTokens = corpus.map(tokenize);
  const allTokenized = [candidateTokens, ...corpusTokens];

  // Compute TF for all documents
  const allTf = allTokenized.map(termFrequency);

  // Collect all terms
  const allTerms = new Set<string>();
  for (const tf of allTf) {
    for (const term of tf.keys()) {
      allTerms.add(term);
    }
  }

  // Compute IDF
  const idf = inverseDocumentFrequency(allTf, allTerms);

  // Compute TF-IDF vectors
  const candidateVec = tfidfVector(allTf[0], idf);

  let maxScore = 0;
  let maxIndex = -1;

  for (let i = 1; i < allTf.length; i++) {
    const corpusVec = tfidfVector(allTf[i], idf);
    const sim = cosineSimilarity(candidateVec, corpusVec);
    if (sim > maxScore) {
      maxScore = sim;
      maxIndex = i - 1; // Offset by 1 because candidate is at index 0
    }
  }

  return { score: maxScore, most_similar_index: maxIndex };
}

/**
 * Quick similarity check between two texts.
 */
export function similarity(a: string, b: string): number {
  if (!a || a.trim().length === 0 || !b || b.trim().length === 0) return 0;
  const result = findMaxSimilarity(a, [b]);
  return result.score;
}
