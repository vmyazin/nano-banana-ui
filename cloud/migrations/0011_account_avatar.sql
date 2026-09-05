-- Nullable for existing accounts; the next verified Google sign-in refreshes it.
ALTER TABLE account_users ADD COLUMN picture TEXT;
