-- 023: the user can remove a question from «آخر أسئلتك» (trash button). The row is only hidden from the user's own
-- history; it stays in the admin's legal-questions log, which is how answer quality is reviewed.
ALTER TABLE app.legal_questions ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
