-- Add birthday field to clients (stored as MM-DD, same format as staff.birthday)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS birthday text
  CHECK (birthday ~ '^\d{2}-\d{2}$');
