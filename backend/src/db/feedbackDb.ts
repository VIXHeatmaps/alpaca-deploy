/**
 * Database service for feedback (bug reports and feature requests)
 */

import db from './connection';

export interface FeedbackRecord {
  id: string;
  type: 'bug' | 'feature';
  title: string;
  description: string | null;
  screenshot: string | null;
  user_id: string | null;
  created_at: Date;
}

export interface CreateFeedbackInput {
  id: string;
  type: 'bug' | 'feature';
  title: string;
  description?: string;
  screenshot?: string | null;
  user_id?: string | null;
}

/**
 * Create new feedback record
 */
export async function createFeedback(input: CreateFeedbackInput): Promise<FeedbackRecord> {
  const [feedback] = await db('feedback')
    .insert({
      id: input.id,
      type: input.type,
      title: input.title,
      description: input.description || null,
      screenshot: input.screenshot || null,
      user_id: input.user_id || null,
    })
    .returning('*');

  return feedback;
}

/**
 * Get all feedback, sorted by newest first
 */
export async function getAllFeedback(): Promise<FeedbackRecord[]> {
  const feedback = await db('feedback')
    .select('*')
    .orderBy('created_at', 'desc');

  return feedback;
}

/**
 * Get feedback by ID
 */
export async function getFeedbackById(id: string): Promise<FeedbackRecord | null> {
  const feedback = await db('feedback')
    .where({ id })
    .first();

  return feedback || null;
}

/**
 * Delete feedback by ID
 */
export async function deleteFeedback(id: string): Promise<boolean> {
  const deleted = await db('feedback').where({ id }).del();
  return deleted > 0;
}
